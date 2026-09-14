// 마이페이지 [크레딧] 탭으로 가는 길 — 주소와 신호 이름 한 벌(2026-09-14).
//
// ★ 화면("use client")이 import 한다 — import 문을 두지 마라(lib/pricing.js 와 같은 규칙).
// ★ 신호가 필요한 이유: 이미 /me 에 있을 때 같은 경로로 이동하면 Next 가 화면을 다시 그리지 않아,
//   처음 그릴 때만 ?tab= 을 읽는 마이페이지의 탭이 안 바뀐다. 누르는 쪽이 이 신호를 함께 보낸다.
export const CREDITS_TAB_HREF = "/me?tab=credits";
export const ME_TAB_EVENT = "shotform:me-credits-tab";
