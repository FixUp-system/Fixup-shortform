import { regenVoice } from "../../../../../../../lib/pipeline";
import { getProject } from "../../../../../../../lib/projects";
import { withUser } from "../../../../../../../lib/auth/require-user.js";
import {
  assertCanAfford, chargeRegen, refundRegen, requireVideoCharge, NoCredits,
} from "../../../../../../../lib/charges.js";
import { regenPrice, MAX_REGEN_PER_CUT } from "../../../../../../../lib/pricing.js";
import { BudgetExceeded } from "../../../../../../../lib/costs.js";
import { fakeFal } from "../../../../../../../lib/fake";
import { modelIdForProject, projectSpeaks, resolutionForProject } from "../../../../../../../lib/clip-limits.js";

// ★★ 이 라우트는 **기다렸다가 답한다**(await regen…) — 생성 라우트 여섯과 다른 점이다.
//    그래서 `maxDuration` 이 곧 성공과 실패를 가른다: 배포 기본값에 잘리면 사장님에게는
//    그냥 실패이고, 값은 이미 나간 뒤다(2026-08-18 사장님 지적으로 찾았다).
//    화면이 이 응답을 받고 곧바로 다시 읽는 구조라 백그라운드로 돌리지 않는다 —
//    돌리면 "다시 만드는 중" 표시를 내릴 자리가 사라진다.
//
// 낭독 한 줄. 짧지만 같은 규칙을 쓴다 — 셋이 같은 모양이어야 다음 사람이 안 빠뜨린다.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id, idx } = await params;

  // 문 둘을 **어떤 청구보다도 앞**에 둔다 — 못 줄 것에 값을 받지 않는다.
  // 가짜 모드에서도 같은 답이어야 화면이 두 모드에서 같게 굴러간다(아래 청구 블록은
  // `!fakeFal()` 일 때만 도는데, 이 저장소가 권하는 개발 방식이 바로 가짜 모드다).
  // 재생성은 폴링이 아니라 버튼을 누를 때만 도는 자리라 getProject 하나가 늘어도 괜찮다.
  const project = await getProject(id, user.id);

  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (project?.kind === "ad") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }

  // ★ 말하는 모델에서는 목소리가 클립과 한 몸이라 따로 다시 만들 수 없다.
  if (project && projectSpeaks(project)) {
    return Response.json(
      { error: "이 영상은 목소리가 영상에 함께 만들어져요 — 영상을 다시 만들어 주세요" },
      { status: 400 }
    );
  }

  // 컷당 첫 재생성은 공짜, 둘째부터 정가. 회차는 그 컷이 이미 쓴 횟수다.
  //
  // ★ 회차는 **프로젝트 문서**(voice_regen_count)가 센다 — 청구 장부로 세면 첫 회가 공짜라
  // 행을 안 남기고, 그러면 회차가 영원히 0 이라 계속 공짜가 된다.
  // ★ try 바깥이다. 안에 넣으면 NoCredits 가 아래 catch 에 잡혀 400 으로 나가고,
  // 화면은 "크레딧 부족"과 "만들지 못했어요"를 구분할 수 없다.
  // 가짜 모드는 건너뛴다 — 0원이라 받을 것이 없다(assertBudget 과 같은 규칙).
  let charged = null;
  if (!fakeFal()) {
    // project 는 위에서 한 번 읽었다(말하는 프로젝트 판정) — 여기서 다시 읽지 않는다
    const cut = (project?.cuts || []).find((c) => c.idx === Number(idx));
    const prior = Number(cut?.voice_regen_count) || 0;

    // ★ 상한 판정이 **어떤 청구보다도 앞**이다(아래 정가 게이트보다도 앞).
    // 뒤에 두면 4회째에 값을 받고 나서 regenVoice 가 같은 상한으로 던져 400 이 된다 —
    // 내고 아무것도 못 받는 응답이다. 정가 게이트를 이 앞에 두었을 때도 같은 결함이
    // 환불된 프로젝트에서만 되살아났다. 드문 것과 없는 것은 다르다.
    if (prior >= MAX_REGEN_PER_CUT) {
      return Response.json({ error: "목소리 다시 만들기는 컷당 3회까지예요" }, { status: 400 });
    }

    // ★ 재생성도 유료 입구다 — /clips 와 **같은 문**을 쓴다.
    // 회차 가격만 보면 구멍이 난다: 실패 → refundVideo(잔액 복구) → 그림·컷은 남음 →
    // 컷별 재생성(컷당 첫 회 무료) → POST /render(로컬 ffmpeg 0원) = **순지불 0 완성본**.
    // `balance < 0` 그물은 잔액이 양수라 못 잡는다.
    // 살아 있는 청구가 있으면 0 으로 지나가므로 **정상 흐름은 안 바뀐다**.
    // 프로젝트가 없으면(남의 것 포함) 문을 열지 않는다 — 볼 수도 없는 프로젝트에
    // 값을 물리면 안 되고, 아래 regen 이 어차피 400 으로 끝낸다.
    if (project) {
      try {
        await requireVideoCharge({
          userId: user.id, projectId: id, seconds: project.settings?.target_seconds,
          model: modelIdForProject(project), resolution: resolutionForProject(project),
        });
      } catch (e) {
        if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
        throw e;
      }
    }

    const price = regenPrice("voice", prior, modelIdForProject(project));
    if (price > 0) {
      try {
        await assertCanAfford(user.id, price);
      } catch (e) {
        if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
        throw e;
      }
      await chargeRegen({
        userId: user.id, projectId: id, kind: "voice", idx: Number(idx), priorCount: prior,
        // 이미지·목소리 재생성은 값이 하나다 — 해상도를 안 넘기는 것이 맞다(lib/pricing.js 의 REGEN_PRICE).
        model: modelIdForProject(project),
      });
      charged = prior;   // 실패하면 이 회차를 되돌린다
    }
  }

  try {
    const cut = await regenVoice(id, user.id, Number(idx));
    return Response.json({ cut });
  } catch (e) {
    // 못 준 것은 받지 않는다 — 자동 관통의 환불과 같은 정책.
    // 카운터는 시도 **전**에 오르므로, 되돌리지 않으면 재시도가 다음 회차 값을 또 낸다.
    if (charged !== null) {
      await refundRegen({ projectId: id, kind: "voice", idx: Number(idx), priorCount: charged })
        .catch((err) => console.error("재생성 환불 실패:", err?.message));
    }
    // ★ 예산 오류는 400 이 아니다 — 여기서 잡아 버리면 withUser 의 402·503 이 도달하지
    // 못하고, 프로젝트 상한에 닿은 재생성이 "만들지 못했어요"로 보인다(사장님은 계속
    // 다시 누른다). 환불은 위에서 이미 했으니 값은 안 남는다.
    if (e instanceof BudgetExceeded) throw e;
    return Response.json({ error: e.message }, { status: 400 });
  }
});
