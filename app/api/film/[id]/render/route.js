import { withUser } from "../../../../../lib/auth/require-user.js";
import { isFilmMode } from "../../../../../lib/film/mode.js";
import { loadFilm } from "../../../../../lib/film/load.js";
import { filmOf, isDrawLocked } from "../../../../../lib/film/doc.js";
import { startFilmRender } from "../../../../../lib/film/pipeline.js";
import { assertCanAfford, chargeAd, refundAd, NoCredits } from "../../../../../lib/charges.js";
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
  // ★★ **그리는 중에는 굽지 않는다.** 그리면 그림이 곧 바뀌는데, 지금 접수하면 값은
  //   **옛 그림**으로 치러진다($2). 화면도 같은 것을 잠그지만(lib/film/gates.js) 화면
  //   잠금은 한 벌뿐이라 샌다 — 탭이 둘이거나 새로고침이 실패하면 그대로 열린다.
  // ★ 판정은 새로 만들지 않는다 — 그림 라우트가 자기 재진입을 막을 때 쓰는 isDrawLocked
  //   하나다(lib/film/doc.js). 시각까지 함께 보므로 인스턴스가 죽어 "그리는 중"이 남아도
  //   10분 뒤에는 굽기가 다시 열린다(막다른 길을 안 만든다).
  // ★ 청구 **앞**에 선다 — 뒤에 두면 걷고 나서 막는 꼴이다.
  if (isDrawLocked(film)) {
    return Response.json({ error: "지금 그림을 그리는 중이에요" }, { status: 409 });
  }
  // ★★ 그림을 그린 뒤에 시나리오를 다시 썼으면 굽지 않는다 — 그대로 구우면 **옛 판의
  //   그림**으로 값이 나가고, 한 방식은 v1 로 다른 방식은 v2 로 구워져 두 영상의 차이가
  //   방식 때문인지 시나리오 때문인지 알 수 없게 된다(그 비교가 이 기능의 전부다).
  //   판은 그림을 그릴 때 films[방식].scenarioTries 에 적힌다(lib/film/pipeline.js).
  // ★ 숫자가 없는 옛 문서는 그대로 통과시킨다 — 이 문 이전에 그린 그림을 못 굽게 만들면
  //   그 프로젝트는 값을 치를 길이 아예 없어진다(막다른 길). 앞으로 그린 것만 판을 안다.
  const drawnAt = film.scenarioTries;
  if (typeof drawnAt === "number" && drawnAt !== (Number(project.scenario?.tries) || 0)) {
    return Response.json(
      { error: "시나리오가 바뀌었어요 — 그림을 다시 만들어 주세요" }, { status: 400 }
    );
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
  // ★★ 반환값에서 **회차 번호를 함께** 받는다(lib/charges.js). 쓰고 나서 장부에 다시
  //   물어보면 안 된다 — A 가 ad:1 을 쓰고 B 가 ad:2 를 쓴 뒤에 A 가 물어보면 2 가 나오고,
  //   그러면 order 수거 실패가 refs 의 값을 환불한다. 이 경로는 두 방식을 나란히 굽는 것이
  //   정상 흐름이라 그 순서가 예외가 아니라 기본이다.
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
  if (!charged.credits) {
    return Response.json({ error: "방금 접수된 것 같아요 — 잠시 뒤 다시 눌러 주세요" }, { status: 409 });
  }

  // 이 회차 번호가 접수증(films[mode].job.attempt)에 적힌다 — 수거가 실패할 때 되돌릴
  // 회차다. refundAd 는 번호를 안 주면 "살아 있는 **마지막** 회차"를 되돌리는데, 수거
  // 시점에는 두 방식이 동시에 살아 있을 수 있어 옆 방식의 값이 돌아간다.
  const attempt = charged.attempt;

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
