// 롱폼 30초 시험의 단계 관문 — **돈이 나가는 자리를 코드가 지킨다.**
//
// ★★★ 순서: plan → seg1 → (확인 ①) → seg2 → (확인 ②) → join. seg1 과 seg2 는 **따로**
//   승인한다(스펙 결정 10). --yes 가 그 승인이다.
// ★★ 접수만 되고 결과를 못 받은 구간은 --yes 없이 이어 기다린다 — 새 돈이 안 나간다.
//   반대로 이미 구운 구간은 다시 굽지 않는다 — 누르면 값이 두 번 나간다.
// ★★ 고정 블록은 seg1 뒤에 잠긴다 — 두 구간이 다른 설정으로 구워지면 일관성 시험 자체가 무너진다.
import { adModel } from "../ad/models.js";
import { FIXED_HEAD } from "./bible.js";
import { CASTING_SECONDS } from "./casting.js";

// ★★ 2026-09-30 구간 N개로 넓혔다 — "seg<n>" 은 구간 목록(state.segments)에 있는 번호만 받는다.
//   extend 는 시나리오 뒤에 구간을 더한다(LLM 한 번 · 유료).
export const STAGES = ["plan", "cast", "extend", "seg<n>", "join"];

export function segOf(stage) {
  const m = /^seg([1-9][0-9]*)$/.exec(String(stage || ""));
  return m ? Number(m[1]) : 0;
}

const isPaid = (stage) => stage === "plan" || stage === "extend" || stage === "cast" || segOf(stage) > 0;

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

// sheet: GPT Image 판을 사는가 — 2026-09-30 부터 기본으로 끈다(스크립트의 --sheet 로만 켠다).
//   판이 AI 질감의 입구였다(lib/longform/casting.js 머리말). 기본값 true 는 옛 호출 모양 그대로다.
export function stageCostUsd(stage, { resolution, seconds = 0, extraRefUsd = 0, sheet = true, characters = 0 } = {}) {
  if (stage === "plan" || stage === "extend") return SCENARIO_USD;
  if (stage === "cast") return h3SecondUsd(resolution) * CASTING_SECONDS * characters;
  if (segOf(stage)) return (sheet ? SHEET_USD : 0) + h3SecondUsd(resolution) * seconds + extraRefUsd;
  return 0;
}

export function gate(state, stage, { yes = false } = {}) {
  const n = segOf(stage);
  if (!(n || ["plan", "extend", "cast", "join"].includes(stage))) {
    return { ok: false, reason: `모르는 단계예요: ${stage} (plan·cast·extend·seg<n>·join)` };
  }
  const seg = state?.segments || [];
  // ★★★ 최종 리뷰(2026-09-30) — plan 은 segments 를 새로 만든다. 접수했거나 구운 구간이 있는데
  //   plan 을 다시 돌리면 **접수증이 지워진다.** H3 가 30분에 끊긴 뒤 "실패했네, 처음부터"로
  //   plan 을 다시 돌리면 이미 값을 치른 job 을 잃고 seg1 을 또 굽는다 — 값이 두 번 나간다.
  if (stage === "plan" && seg.some((x) => x?.job || x?.video)) {
    return { ok: false, reason: "이 작업 폴더에는 이미 접수했거나 구운 구간이 있어요 — plan 을 다시 돌리면 그 접수증이 지워져 값이 두 번 나가요. 새로 시작하려면 새 작업 폴더를 써요" };
  }
  if (stage !== "plan" && !state?.scenario) return { ok: false, reason: "plan 을 먼저 돌려요" };
  if (n > seg.length) {
    return { ok: false, reason: `구간 ${n} 은 없어요 — 지금 구간은 ${seg.length}개예요(늘리려면 extend)` };
  }
  // 앞 구간이 있어야 뒤 구간을 굽는다 — 닻·목소리를 앞 구간 영상에서 뽑고, 확인을 건너뛰지 않는다.
  if (n >= 2 && !seg[n - 2]?.video) {
    const check = n === 2 ? "확인 ① 을 거쳐요" : "보고 나서 굽어요";
    return { ok: false, reason: `구간 ${n - 1} 영상이 없어요 — seg${n - 1} 을 먼저 굽고, ${check}` };
  }
  if (stage === "join" && !(seg.length && seg.every((x) => x?.video))) {
    return { ok: false, reason: "모든 구간이 다 있어야 이어 붙여요" };
  }

  const i = n - 1;
  if (i >= 0 && seg[i]?.video) {
    return { ok: false, reason: `구간 ${i + 1} 은 이미 구웠어요(${seg[i].video}) — 다시 구우려면 run.json 에서 그 구간의 job·video 를 지워요` };
  }
  if (i >= 0 && seg[i]?.job) return { ok: true, resume: true };
  if (isPaid(stage) && !yes) return { ok: false, reason: "유료 단계예요 — 위 어림값을 확인하고 --yes 를 붙여 다시 돌려요" };
  return { ok: true };
}

// 그 단계가 부르는 것이 전부 가짜인가 — plan 은 LLM, seg 는 fal(판·H3), join 은 로컬이다.
// ★★ 최종 리뷰(2026-09-30) — 예전에는 "fal·LLM 둘 다 가짜"일 때만 가짜로 봤다. 그러면
//   SHOTFORM_FAKE=fal(저장소 규약: "fal 만 가짜")에서 판은 가짜인데 **H3 는 진짜로 접수됐다.**
export function stageIsFree(stage, { fal, llm }) {
  if (stage === "plan" || stage === "extend") return Boolean(llm);
  if (segOf(stage) || stage === "cast") return Boolean(fal);
  return true;
}

// 닻을 뽑을 초 — **판을 사기 전에** 거른다(최종 리뷰: 판을 산 뒤 닻 추출이 실패하면 다시
// 돌릴 때 판을 또 샀다). 비우면 구간 1 의 가운데다.
export function parseAnchorAt(value, seconds) {
  const s = Number(seconds) || 0;
  if (value === undefined || value === null || value === "") return { ok: true, at: s / 2 };
  const at = Number(value);
  if (!Number.isFinite(at) || at < 0 || at >= s) {
    return { ok: false, reason: `--anchor-at 은 0 이상 ${s}초 미만의 숫자여야 해요(받은 값: ${value})` };
  }
  return { ok: true, at };
}

// ★★ 2026-09-30 — 잠그는 것은 **인물·목소리·화풍·색감**(bible.js 의 buildFixedBlock)이다.
//   장소·옷은 구간마다 바뀔 수 있게 풀었다(몽타주). 판정은 "고정 블록의 줄이 구간 1 을 구울 때의
//   블록에 **줄 그대로** 다 들어 있나"다 — 옛 형식(buildBible: 장소·옷 줄이 섞인 블록)으로 구운
//   구간과도 맞는다. 머리 줄(FIXED_HEAD)은 형식마다 달라 빼고 잰다.
export function checkBibleLock(state, fixed) {
  const used = state?.segments?.[0]?.bible;
  if (!used) return { ok: true };
  const have = new Set(String(used).split("\n"));
  const need = String(fixed).split("\n").filter((l) => l && l !== FIXED_HEAD);
  if (need.every((l) => have.has(l))) return { ok: true };
  return {
    ok: false,
    reason: "인물·목소리·화풍·색감이 구간 1 을 구운 뒤 바뀌었어요 — 앞 구간과 이어지려면 이것들은 못 바꿔요. 뒤 구간은 본문·대사·장소·옷만 고칠 수 있어요. 인물을 바꿔야 하면 구간 1 부터 다시 구워요",
  };
}
