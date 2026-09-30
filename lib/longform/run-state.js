// 롱폼 30초 시험의 단계 관문 — **돈이 나가는 자리를 코드가 지킨다.**
//
// ★★★ 순서: plan → seg1 → (확인 ①) → seg2 → (확인 ②) → join. seg1 과 seg2 는 **따로**
//   승인한다(스펙 결정 10). --yes 가 그 승인이다.
// ★★ 접수만 되고 결과를 못 받은 구간은 --yes 없이 이어 기다린다 — 새 돈이 안 나간다.
//   반대로 이미 구운 구간은 다시 굽지 않는다 — 누르면 값이 두 번 나간다.
// ★★ 고정 블록은 seg1 뒤에 잠긴다 — 두 구간이 다른 설정으로 구워지면 일관성 시험 자체가 무너진다.
import { adModel } from "../ad/models.js";

export const STAGES = ["plan", "seg1", "seg2", "join"];
export const PAID = new Set(["plan", "seg1", "seg2"]);

// 어림값 — 확인 전에 사장님께 보여 주는 숫자다(청구가 아니다).
// 시나리오: 실측 편 1c979787 의 「광고 시나리오」 $0.3969.
export const SCENARIO_USD = 0.40;
// 판 한 장: 같은 편의 이미지값 $0.826(다시 그리기가 섞였을 수 있어 보수적으로 잡는다).
export const SHEET_USD = 0.83;

export function h3SecondUsd(resolution) {
  const v = adModel("minimax-h3").perSecUsd?.[resolution];
  if (!v) throw new Error(`H3 가 모르는 화질이에요: ${resolution}`);
  return v;
}

export function stageCostUsd(stage, { resolution, seconds = 0, extraRefUsd = 0 } = {}) {
  if (stage === "plan") return SCENARIO_USD;
  if (stage === "seg1" || stage === "seg2") return SHEET_USD + h3SecondUsd(resolution) * seconds + extraRefUsd;
  return 0;
}

export function gate(state, stage, { yes = false } = {}) {
  if (!STAGES.includes(stage)) return { ok: false, reason: `모르는 단계예요: ${stage} (plan·seg1·seg2·join)` };
  const seg = state?.segments || [];
  if (stage !== "plan" && !state?.scenario) return { ok: false, reason: "plan 을 먼저 돌려요" };
  if (stage === "seg2" && !seg[0]?.video) {
    return { ok: false, reason: "구간 1 영상이 없어요 — seg1 을 먼저 굽고, 확인 ① 을 거쳐요" };
  }
  if (stage === "join" && !(seg[0]?.video && seg[1]?.video)) return { ok: false, reason: "두 구간이 다 있어야 이어 붙여요" };

  const i = stage === "seg1" ? 0 : stage === "seg2" ? 1 : -1;
  if (i >= 0 && seg[i]?.video) {
    return { ok: false, reason: `구간 ${i + 1} 은 이미 구웠어요(${seg[i].video}) — 다시 구우려면 run.json 에서 그 구간의 job·video 를 지워요` };
  }
  if (i >= 0 && seg[i]?.job) return { ok: true, resume: true };
  if (PAID.has(stage) && !yes) return { ok: false, reason: "유료 단계예요 — 위 어림값을 확인하고 --yes 를 붙여 다시 돌려요" };
  return { ok: true };
}

export function checkBibleLock(state, bible) {
  const used = state?.segments?.[0]?.bible;
  if (!used || used === bible) return { ok: true };
  return {
    ok: false,
    reason: "고정 블록이 구간 1 을 구운 뒤 바뀌었어요 — 확인 ① 뒤에는 구간 2 의 본문과 대사만 고칠 수 있어요. 인물·무대·의상·목소리를 바꿔야 하면 구간 1 부터 다시 구워요",
  };
}
