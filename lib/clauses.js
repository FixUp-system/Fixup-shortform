// 절 경계 판정 — 여기 홀로 둔다(import 없는 leaf 모듈).
//
// lib/cuts.js 에 두면 안 된다. 그 모듈은 lib/styles.js·lib/motion.js·
// lib/clip-limits.js 등으로 이어지는 무거운 사슬(LLM 시스템 프롬프트 수백 줄 포함)을 끌고
// 오는데, "use client" 화면인 app/create/[id]/done/page.js 가 lib/subtitles.js 의
// cutSeconds 를 import 한다. subtitles.js 가 절 경계를 쓰겠다고 cuts.js 를 그대로
// import 하면 그 페이지의 번들이 통째로 부푼다.
// (lib/styles.js·lib/voices.js·lib/clip-limits.js 가 같은 이유로 분리돼 있다 — 여기도
// import 가 없다.)
//
// lib/cuts.js(컷 분할)와 lib/subtitles.js(자막 분할) 둘 다 이 판정을 쓴다. 판정 자체는
// 여기 한 곳에만 있고, 부르는 쪽마다 잘라내는 방식(원문 복원 계약)만 다르다.

// 연결어미는 **닫힌 목록**이다. 한국어 연결어미를 다 담으려 하지 않는다 —
// 못 담은 어미는 그 문장이 안 나뉠 뿐이고, 그때는 지금 동작(문장 통째)으로 떨어진다.
// 늘리는 것은 나중에 한 줄이면 된다.
export const CLAUSE_ENDINGS = ["고", "며", "면", "어서", "아서", "지만", "는데"];

// 한두 낱말짜리 조각은 컷으로 쓸모가 없다("자면" 같은 것). 앞 조각에 도로 붙인다.
// 연결어미 매칭은 낱말 끝만 보므로 "장면"·"라면"처럼 어미가 아닌 것도 걸리는데,
// 이 하한이 그런 자리를 대부분 걸러 준다.
export const MIN_UNIT_CHARS = 6;

export const noSpace = (s) => (s || "").replace(/\s/g, "").length;

export function isClauseEnd(token) {
  if (token.endsWith(",")) return true;
  return CLAUSE_ENDINGS.some((e) => token.endsWith(e));
}

// 원문 보존 — 컷을 이어붙이면 원고와 글자 그대로 같다는 이 저장소의 유일한 구조적 보장은
// 여기서 지켜지거나 깨진다. 낱말을 다시 " "로 이어 붙이면 원래 있던 연속 공백·탭이
// 한 칸으로 뭉개진다. 그래서:
//  1. 조각은 토큰을 이어 붙이지 않고 **원본 문자열에서 slice** 한다 — 조각 안의 공백은
//     원래 모양 그대로 남는다.
//  2. 자를 자리는 **공백이 정확히 한 칸인 곳**으로만 제한한다. 뒤에서 splitUnits.join(" ")
//     로 되짚으므로, 두 칸·탭 자리에서 자르면 그 자리의 원래 공백 모양을 복원할 방법이
//     없다 — 그런 자리는 아예 후보로 삼지 않고 buf에 그대로 흘려보낸다.
// 절 경계 **위치**만 돌려준다. 각 값은 뒤 조각이 시작하는 문자 인덱스다.
//
// 왜 위치인가: 자막(lib/subtitles.js)이 이 후보 중에서 **폭을 보고** 고른다. 조각을 받으면
// 다시 이어 붙였다 자르는 일이 생기고, 그때 "이어붙이면 원문과 같다"가 깨질 자리가 난다.
//
// 판정은 splitClauses(lib/cuts.js) 가 쓰던 것 그대로다 — 목록도 하한도 여기 한 곳에만 있다.
//
// 이 함수가 '조각'이 아니라 '위치'를 돌려주는 이유: 부르는 쪽마다 원문 복원 계약이
// 다르다. 컷(splitClauses)은 조각이 구분 공백을 품지 않고 join(" ")으로 원문을 되찾고,
// 자막(lib/subtitles.js)은 조각이 구분 공백을 품고 join("")으로 되찾는다. 같은 경계
// 목록을 공유하되 자르는 방식은 계약대로 각자 정한다.
export function clauseBoundaries(sentence) {
  const s = sentence || "";
  const tokens = [...s.matchAll(/\S+/g)];
  if (tokens.length === 0) return [];
  const out = [];
  let start = tokens[0].index;
  for (let i = 0; i < tokens.length - 1; i++) {
    const tok = tokens[i];
    const tokenEnd = tok.index + tok[0].length;
    const next = tokens[i + 1];
    const sep = s.slice(tokenEnd, next.index);
    const buf = s.slice(start, tokenEnd);
    // 조각이 너무 짧으면 자르지 않고 계속 모은다. 공백이 한 칸이 아니면 자르지 않는다 —
    // 이었을 때 원래 모양을 복원할 수 없는 자리이기 때문이다.
    if (isClauseEnd(tok[0]) && noSpace(buf) >= MIN_UNIT_CHARS && sep === " ") {
      out.push(next.index);
      start = next.index;
    }
  }
  return out;
}

// 문장이 스스로 닫혔는가 — 닫혔으면 그대로, 아니면 마침표를 채운다.
//
// **여기 두는 이유는 import 그래프다.** 이 규칙을 쓰는 쪽은 둘이고 지금은 둘 다
// lib/cuts.js 에 산다: 컷별 덮어쓰기(promptOverride)와 프로젝트 공통 지시(promptNoteOf).
//
// ★ 왜 lib/styles.js 가 아닌가 — 공통 지시의 **게이트**(normalizePromptNote)는 거기 있어서
//   판독도 그리 가고 싶어지는데, `tests/styles.test.js` 가 **"styles.js 에 import 가 하나도
//   없다"**를 소스로 못 박는다("use client" 화면이 그 파일을 읽어 번들에 fs 가 섞이면 안 된다).
//   거기 두면 이 함수를 끌 수 없어 규칙이 두 벌이 된다. 실제로 그 길로 가 보고 되돌린
//   자리다 — 다음 사람이 같은 지뢰를 다시 밟지 않도록 적어 둔다.
//
// 이 파일은 import 없는 leaf 이고 이미 **문장·절 경계 판정의 유일한 집**이라(머리말 참고)
// 부르는 쪽이 어디로 옮겨 가든 순환 없이 끌 수 있다.
//
// 규칙을 두 군데 적지 않는 이유: 한쪽만 고쳐지는 날 같은 값이 프롬프트마다 다르게 닫힌다.
//
// 전각 부호까지 보는 이유: 사장님은 한국어로 쓰고, 한글 입력에서 "。！？" 가 섞여 나온다.
// 부호를 채우는 것은 사장님이 쓴 **내용**을 고치는 것이 아니다 — 반대로 안 채우면 그 값이
// 뒤 문장과 한 문장으로 붙어 뜻이 망가지고, 두 번 채우면 ".." 가 된다.
export function closeSentence(text) {
  if (!text) return "";
  return /[.!?。！？]$/.test(text) ? text : `${text}.`;
}
