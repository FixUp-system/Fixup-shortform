// 크레딧 내역 — 장부의 행을 사장님이 읽을 수 있는 한 줄로 바꾸는 규칙.
//
// 장부는 둘이다(lib/charges.js): credit_grants(충전)와 credit_charges(청구).
// 잔액 = 충전합 − 청구합이라 **부호의 뜻이 서로 반대**다:
//   · 청구 50  → 잔액 −50      · 환불(청구 장부의 음수 행) −50 → 잔액 +50
//   · 충전 500 → 잔액 +500     · 회수(충전 장부의 음수 행) −200 → 잔액 −200
// 이 갈림을 화면마다 다시 적으면 언젠가 한쪽이 뒤집힌다. 여기 한 곳에 둔다.
//
// ★ 이 파일은 화면("use client")에서도 import 된다. import 문을 두지 마라 —
//   순수 데이터·순수 함수만 있어야 번들이 깨지지 않는다(lib/pricing.js 와 같은 규칙).

// 청구 장부의 kind → 사장님 말. **무엇에 썼는지**를 적는다.
// 값은 lib/charges.js 가 쓰는 kind 와 같아야 한다("video", `regen_${kind}`).
export const LEDGER_LABELS = {
  video: "영상 만들기",
  regen_image: "이미지 다시 만들기",
  regen_clip: "영상 다시 만들기",
  regen_voice: "목소리 다시 만들기",
  grant: "충전",
};

// 되돌려준 것은 종류가 여럿이다(refund · refund_regen_clip · refund_regen_image …).
// 사장님에게는 전부 한 가지 사건이다 — "돌려받음".
const REFUND_PREFIX = "refund";

// ★ 모르는 종류를 빈칸으로 두지 않는다. 새 청구 종류가 생겼는데 표를 안 고치면
// "무엇에 썼는지 모르는 줄"이 생기는데, 크레딧이 줄어든 화면에서 그것이 가장 나쁘다.
export function ledgerLabel(kind) {
  const k = String(kind || "");
  if (k.startsWith(REFUND_PREFIX)) return "돌려받음";
  return LEDGER_LABELS[k] || "사용";
}

// 이 행이 잔액을 얼마나 움직였나. 화면은 이 값만 보고 +/− 를 찍는다.
//
// ★ 정수로 준다(2026-08-13 사용자 결정: 크레딧은 정수 단위). 지금 들어오는 값은 이미
// 정수지만(lib/pricing.js 가 반올림해서 내보낸다) **옛 장부에는 소수 행이 남아 있다** —
// credit_grants 가 옛 amount_usd 를 이름만 바꿔 쓴 자리라 실제로 +5.18 이 있다.
// 그것을 그대로 찍으면 "5.18 크레딧"이라는, 이 제품에 없는 단위가 화면에 뜬다.
//
// ⚠️ 그래서 **줄의 합이 잔액과 1 안팎으로 어긋날 수 있다** — 잔액은 합을 버리고(floorBalance)
// 여기는 줄마다 반올림하기 때문이다. 옛 소수 행이 있는 계정에서만 생기는 일이고,
// 반대로 소수를 그대로 보여 주는 쪽이 더 나쁘다.
export function ledgerDelta({ source, credits }) {
  const n = Math.round(Number(credits) || 0);
  return source === "charge" ? -n : n;
}
