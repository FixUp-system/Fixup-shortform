import { withUser } from "../../../../../lib/auth/require-user.js";
import { isFilmMode } from "../../../../../lib/film/mode.js";
import { loadFilm } from "../../../../../lib/film/load.js";
import { filmOf } from "../../../../../lib/film/doc.js";
import { startFilmRender } from "../../../../../lib/film/pipeline.js";
import { assertCanAfford, chargeAd, refundAd, activeAdAttempt, NoCredits } from "../../../../../lib/charges.js";
import { adVideoPrice } from "../../../../../lib/pricing.js";

// 굽기 접수 — **유료 입구다.**
//
// ★★ 청구가 접수 **앞**에 선다(lib/ad/pipeline.js 의 startAdRender 와 같은 이유):
//   잔액 없이 fal 이 나가는 길을 안 만든다. 광고는 그 청구가 파이프라인 안에 있는데
//   여기서는 라우트가 한다 — lib/film/pipeline.js 는 "무엇을 어떻게 굽는가"만 알고
//   돈을 모른다(그 파일은 두 방식을 재는 실험 장치라, 재는 축을 늘리지 않는다).
//
// ★ 값은 광고와 **같은 표**로 매긴다(adVideoPrice·chargeAd). film 은 광고와 같은 모델·길이·
//   해상도(15초·480p·seedance-2.0)로 굽는다 — 원가가 같으니 정가도 같아야 한다.
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const { mode } = (await req.json().catch(() => ({}))) || {};
  // ★ 입구에서 막는다. 모르는 방식이 안으로 들어가면 어느 칸에 쓸지가 흔들린다.
  if (!isFilmMode(mode)) return Response.json({ error: "모르는 방식이에요" }, { status: 400 });

  const project = await loadFilm(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  if (!project.scenario?.text) {
    return Response.json({ error: "시나리오를 먼저 만들어 주세요" }, { status: 400 });
  }

  const film = filmOf(project, mode);
  // ★ 굽는 중에는 또 못 누른다. 이 문이 **이중 청구를 막는 자리**이기도 하다 —
  //   아래 청구는 누를 때마다 새 회차를 여는(openNewAttempt) 방식이라, 여기가 없으면
  //   같은 방식을 두 번 눌러 두 번 걷힌다.
  if (film.status === "rendering") {
    return Response.json({ error: "이미 만드는 중이에요" }, { status: 400 });
  }
  // 그림 없이 굽지 않는다 — 참조 없이 r2v 로 나가면 이 경로의 뜻이 사라지는데 값은 그대로 든다.
  // (파이프라인도 같은 것을 보지만, 여기서 먼저 막아야 **청구 앞에서** 걸린다.)
  if (!film.images?.length) {
    return Response.json({ error: "먼저 그림을 만들어 주세요" }, { status: 400 });
  }

  const price = adVideoPrice(
    project.settings?.seconds, project.settings?.model, project.settings?.resolution
  );
  try {
    // 낼 수 있는지 먼저 본다 — 그래야 사장님이 402 를 HTTP 로 받는다(광고 라우트와 같은 규율).
    await assertCanAfford(user.id, price);
  } catch (e) {
    if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
    throw e;
  }

  // ★★ openNewAttempt: true — **누를 때마다 새 회차다.**
  //   광고는 "이미 영상을 냈는가"(hasRenderedAdVideo)로 회차를 여는데, 여기서는 그 판정을
  //   쓸 수 없다: 장부(readAdLedger)의 키는 **프로젝트 하나**인데 이 경로는 한 프로젝트에서
  //   두 편(order·refs)을 굽는다. 그대로 두면 order 의 청구가 살아 있는 동안 refs 가
  //   `active && !openNewAttempt` 로 걸려 **공짜로 구워진다** — 두 편을 만드는데 한 편 값만
  //   받는 것이라 이 경로가 값이 새는 구멍이 된다.
  //   여기까지 온 요청은 전부 실제로 fal 에 한 편을 접수한다(위 rendering·images 문을 지났다).
  //   그러니 회차를 열어 **한 편에 한 줄**을 남긴다 — 그것이 장부가 사실과 맞는 유일한 모양이다.
  const charged = await chargeAd({
    userId: user.id, projectId: id,
    seconds: project.settings?.seconds, model: project.settings?.model,
    resolution: project.settings?.resolution,
    openNewAttempt: true,
  });
  // ★★ 0 은 **안 걷혔다**는 뜻이다. openNewAttempt 가 true 라 chargeAd 가 0 을 주는 길은
  //   `idem_key` 유니크 충돌 하나뿐 — 같은 회차 번호를 계산한 다른 요청이 먼저 썼다는 말이다.
  //   그대로 접수하면 35 크레딧(원가 ≈$2)짜리 한 편이 **공짜로** 나간다.
  //   이 경로에서는 경합이 예외가 아니다: 두 방식을 나란히 재는 것이 목적이라 화면에
  //   [둘 다 굽기]가 생기면 병렬 두 요청이 정상 흐름이 된다. 그래서 여기서 멈춘다.
  if (!charged) {
    return Response.json({ error: "방금 접수된 것 같아요 — 잠시 뒤 다시 눌러 주세요" }, { status: 409 });
  }

  // ★★ 방금 연 회차 번호를 읽어 파이프라인에 넘긴다 — 접수증(films[mode].job)에 적힌다.
  //   왜: refundAd 는 살아 있는 **마지막** 회차를 되돌린다. 접수 직후에는 방금 연 회차가
  //   늘 마지막이라 맞지만, **수거는 나중**이고 그때는 두 방식의 회차가 동시에 살아 있을 수
  //   있다 — order 를 수거하다 실패했는데 refs 의 값이 돌아가면 사장님은 멀쩡한 영상값을
  //   돌려받고 실패한 영상값은 그대로 낸다. 그래서 회차를 접수증에 적어 둔다.
  const attempt = await activeAdAttempt(id).catch(() => null);

  try {
    const out = await startFilmRender(id, user.id, mode, { attempt });
    return Response.json(out, { status: 202 });
  } catch (e) {
    // 못 준 것은 받지 않는다 — 방금 연 **그 회차**를 음수 행으로 되돌린다.
    await refundAd({ projectId: id, attempt }).catch(() => {});
    // ★ 문서에 실패를 적지 않는다 — 파이프라인의 failFilm 이 방금 status:"error" 와 문구를
    //   남겼다. 여기서 또 쓰면 마지막 쓰기가 이겨 그 상태를 덮어버리고(예전엔 "draft" 로
    //   되돌렸다), 화면은 films[mode].status 를 읽으므로 실패 표시가 어긋난다.
    return Response.json({ error: e?.message || "굽지 못했어요" }, { status: 400 });
  }
});
