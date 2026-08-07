// 표시명 한 벌 — 화면과 라우트가 **같은 규칙**을 봐야 한다.
// import 0 개의 순수 모듈이다("use client" 화면에서 안전하게 가져다 쓴다).

export const NAME_MAX = 20;

// 이름이 없으면 이메일의 @ 앞부분. 둘 다 없으면 빈 버튼이 생기지 않게 기본 문구.
export function displayNameOf({ display_name, email } = {}) {
  const name = String(display_name || "").trim();
  if (name) return name;
  const head = String(email || "").split("@")[0];
  return head || "이용자";
}
