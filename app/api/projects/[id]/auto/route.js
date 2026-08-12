// 자동 관통 시작 — 빠른 생성의 [만들기] 버튼이 부른다. 시작만 하고 폴링은 GET /projects/[id].
import { getProject, updateProject } from "../../../../../lib/projects";
import { runAutoPipeline } from "../../../../../lib/auto";
import { VOICES } from "../../../../../lib/voices";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { requireVideoCharge, NoCredits } from "../../../../../lib/charges.js";
import { fakeFal } from "../../../../../lib/fake";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!project || project.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.material?.text?.trim()) {
    return Response.json({ error: "자료가 없어요" }, { status: 400 });
  }
  // 목소리는 대화가 고른 라벨. 목록 밖이면 기본으로 — 임의 문자열이 fal 로 새지 않게.
  const body = await req.json().catch(() => ({}));
  const voice = VOICES.find((v) => v.label === body?.voice_label) || VOICES[0];

  // 멱등 **선판정** — 청구보다 앞이다.
  //
  // 아래 락 안의 판정만 있으면, 이미 완성한(또는 도는 중인) 프로젝트에서 청구가 먼저
  // 일어나고 409 로 거절된다. 그 프로젝트에 환불 이력이 있으면 새 회차가 열려 **돈만 받고
  // 아무것도 안 하는** 응답이 된다. 여기서 먼저 읽어 그 창을 닫는다.
  //
  // 아래 락 안의 판정은 그대로 남긴다 — 여기 읽기는 경합에 지는 낙관적 선판정이고,
  // 동시 클릭 둘을 갈라내는 것은 여전히 CAS 다(그 경합에서 져도 chargeVideo 의
  // 멱등키가 같은 회차를 한 번만 쓴다).
  const already =
    project.auto?.state === "running" ? "이미 만드는 중이에요"
      : project.render ? "이미 완성한 프로젝트예요 — 보관함에서 확인해 주세요"
        : null;
  if (already) return Response.json({ error: already }, { status: 409 });

  // 시작 게이트 + 청구 — **정가를 시작하기 전에 받는다.**
  // 자동 관통은 한 번에 한 편치가 백그라운드로 나가고 중간에 사람이 보고 있지 않다.
  // 잔액이 모자란 채 시작하면 호출 게이트가 중간에 끊고, 사장님에게는
  // "돈은 나갔는데 영상이 없다"만 남는다. 실패로 끝나면 lib/auto.js 가 되돌린다.
  //
  // ★ 아래 patchFn(running 세우기)보다 **앞**이다 — 크레딧이 없으면 auto.state="running" 을
  // 세우지 않아야 한다. 세워 두면 402 를 받은 사용자가 충전 후 다시 눌러도 409 에 막힌다.
  //
  // 가짜 모드는 건너뛴다 — 0원이라 받을 것이 없고, 크레딧 없이도 흐름을 볼 수 있어야 한다
  // (assertBudget 이 fakeFal() 에서 즉시 통과하는 것과 같은 규칙).
  if (!fakeFal()) {
    try {
      await requireVideoCharge({
        userId: user.id, projectId: id, seconds: project.settings?.target_seconds,
      });
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  // 멱등 가드 — 진행 중 재클릭·완성 후 재시작을 막는다. 한 번의 자동 관통이 30초 기준 ~$3.06 다.
  // 판정을 락 안(patchFn)에서 running 세우기와 **함께** 한다 — 읽고-나서-쓰면 [만들기] 를
  // 동시에 두 번 눌렀을 때 둘 다 가드를 빠져나가 관통이 두 번 뜨고 그 원가를 두 번 산다.
  let blocked = null;
  await updateProject(id, user.id, (proj) => {
    // ★ 시도마다 초기화한다. updateProject 는 낙관적 락이라 CAS 에 지면 같은 patchFn 을 다시
    // 부르는데, 이 변수가 래치로 남으면 **버려진 시도의 판정**이 다음 시도까지 살아남는다.
    blocked = null;
    if (proj.auto?.state === "running") {
      blocked = "이미 만드는 중이에요";
      return proj;
    }
    // ★ url 이 아니라 render 객체 존재로 본다 — 가짜 합성(SHOTFORM_FAKE)은 일부러 파일을
    // 만들지 않아 render = { fake: true } 만 남는다. url 로 판독하면 가짜 완성 프로젝트가
    // 관통을 처음부터 다시 돈다. 실모드 재합성은 render 라우트가 render:null 로 리셋하므로
    // "render 객체 존재 = 완성 이력 있음" 이 설계와 맞다.
    if (proj.render) {
      blocked = "이미 완성한 프로젝트예요 — 보관함에서 확인해 주세요";
      return proj;
    }
    return {
      ...proj,
      voice_id: voice.id, voice_label: voice.label, voice_error: null,
      auto: { stage: "briefing", state: "running", error: null },
    };
  });
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  // 비동기 시작 — 실패 처리는 runAutoPipeline 이 auto.state=failed 로 스스로 남긴다
  runAutoPipeline(id, user.id).catch((e) => console.error("auto pipeline error:", e));
  return Response.json({ started: true }, { status: 202 });
});
