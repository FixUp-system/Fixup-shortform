// 비밀번호 규칙 — **유일한 자리**.
//
// ★★★ 2026-09-11 — 이 파일이 생기기 전에는 같은 수가 **네 곳**에 손으로 적혀 있었다:
//     app/api/admin/users/[id]/password/route.js  `const MIN_LENGTH = 6`
//     app/api/me/password/route.js                `const MIN_LENGTH = 6`  (주석: "운영자 재설정 라우트와 같은 값")
//     app/api/auth/signup/route.js                문구 "6자 이상으로 정해 주세요"
//     app/admin/page.js                           문구 "(6자 이상)"
//   주석이 "같은 값"이라고 말하고 있었다는 것 자체가 두 벌이라는 증거다 — 이 저장소의
//   「값이 사는 곳 — 두 벌이면 갈린다」 표에 걸리는 자리다(CLAUDE.md).
//
// ★★ 값을 **6 → 8** 로 올렸다(형제 제품 MCS 와 같은 값). 기존 사용자는 영향이 없다 —
//   로그인은 길이를 재지 않는다. 새로 정하는 비밀번호(가입·운영자 재설정·내 정보)에만 걸린다.
//   ⚠️ Supabase 자체 최소 길이는 프로젝트 설정값이다(기본 6). 우리가 **그 앞에서** 8로
//     막으므로 6~7자는 Supabase 에 닿지 않는다 — 두 값이 어긋나도 사용자가 보는 문구는 하나다.
//
// ★ import 0 개의 순수 모듈이다 — 화면("use client")과 라우트가 **같은 규칙**을 본다.
//   화면 검사는 예의이고 진짜 문지기는 라우트다(이 저장소의 규율: "판정만 하고 강제하지
//   않으면 안 된다"). 그래서 둘이 같은 함수를 봐야 한다.

export const PASSWORD_MIN = 8;

// 두 비밀번호가 다를 때의 문구 — **한 자리**다.
// ★ 화면은 이것을 두 번 쓴다: 적는 도중에 칸 아래로 바로 알리고(즉시), 제출을 막을 때도
//   같은 말을 쓴다. 두 자리에 손으로 적으면 한쪽만 고쳐져 "다른 말로 두 번" 이 된다.
export const PASSWORD_MISMATCH = "두 비밀번호가 서로 달라요";

// 무엇이 잘못됐는지 **사장님 말로** 돌려준다. 문제가 없으면 빈 문자열.
//
// ★ `confirm` 은 **넘길 때만** 잰다(가입 화면의 확인 칸). 라우트는 확인 칸을 안 받으므로
//   인자 하나로 부르고, 그러면 길이만 잰다 — 한 함수가 두 자리를 다 본다.
export function passwordProblem(password, confirm) {
  const pw = String(password ?? "");
  if (pw.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상으로 정해 주세요`;
  if (confirm !== undefined && pw !== String(confirm ?? "")) return PASSWORD_MISMATCH;
  return "";
}
