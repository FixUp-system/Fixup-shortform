// 시나리오 **수정** — 원클릭(lib/ad/scenario.js)과 단계별(lib/reel/scenario.js)이 함께 쓴다.
//
// 🔍 왜 생겼나(2026-09-17 코드 확인): 두 흐름 다 "수정"이 **처음 만들기와 같은 호출**이었고,
//   프롬프트에 **지금 시나리오가 한 글자도 안 실렸다.** 단계별은 "요청한 그 자리만 고친다 —
//   나머지는 지금 시나리오 그대로 둔다"고 시켜 놓고 정작 그 시나리오를 안 보여 줬다. 모델은
//   무엇을 지켜야 하는지 모르니 매번 **처음부터 새로** 썼다 — 한 줄만 고쳐 달라고 해도
//   마음에 들던 장면까지 바뀔 수 있었다.
//
// ★ 그래서 수정일 때는 **지금 시나리오를 함께 싣고** "그 자리만 고쳐 전체를 돌려줘"로 부른다.
// ★ 모델도 가른다(사장님 결정): 수정은 **이미 있는 글을 고치는 일**이라 Opus 5, 처음 만들기와
//   요청 없는 [다시 쓰기]는 사진을 보고 새로 짜는 일이라 Fable 5 그대로다.
// ★ 이 파일은 **순수 데이터·순수 함수**만 둔다(import 없음).

// 원가 장부의 단계 이름 — 첫 생성(「광고 시나리오」)과 갈라 둬야 수정의 값과 횟수를 따로 볼 수 있다.
export const REVISION_STAGE = "시나리오 수정";

// 저장된 시나리오에서 **모델이 쓰는 칸만** 고른다. 저장본에는 tries·prev·endpoint 판정 같은
// 우리 쪽 값이 섞여 있어, 그대로 실으면 모델이 그 칸까지 되돌려 주려 하거나 지어낸다.
// ★ 고르는 기준은 스키마다 — 흐름마다 칸이 달라서(원클릭 셋 · 단계별 스물 남짓) 손으로 적지 않는다.
export function pickCurrentScenario(scenario, schema) {
  if (!scenario || typeof scenario !== "object") return null;
  const keys = Object.keys(schema?.properties || {});
  const out = {};
  for (const k of keys) {
    if (scenario[k] !== undefined && scenario[k] !== null && scenario[k] !== "") out[k] = scenario[k];
  }
  // 고칠 대상이 비었으면 수정이 아니다 — 처음 만들기로 흘러간다.
  const hasBody = (typeof out.text === "string" && out.text.trim()) || (Array.isArray(out.shots) && out.shots.length);
  return hasBody ? out : null;
}

// 지문 꼬리에 붙는 "지금 시나리오 + 고치는 규칙" 블록.
// ★ 규칙은 **범위** 하나만 못 박는다 — 무엇을 어떻게 고칠지는 사장님 요청이 정한다
//   (wiki 원칙 2026-08-19: "최대한 통제를 자제한다").
export function revisionLines(current) {
  if (!current) return [];
  return [
    "",
    "지금 시나리오 — **고칠 대상**이다(JSON):",
    JSON.stringify(current, null, 2),
    "",
    "★ 이번 요청은 처음부터 새로 쓰는 것이 아니라 **위 시나리오를 고치는 것**이다.",
    "  · 사장님이 요청한 자리만 바꾼다. 요청과 상관없는 칸·장면은 **글자 그대로** 돌려준다.",
    "  · 바꾼 내용이 다른 칸에 닿으면(예: 대사를 바꾸면 영상 프롬프트 text 안의 그 대사) 그 자리만 함께 맞춘다.",
    "  · 요청이 없으면 장면 수와 각 장면의 초는 그대로 둔다.",
    "  · 답은 위와 같은 모양의 **시나리오 전체**다.",
  ];
}
