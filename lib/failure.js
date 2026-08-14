// 왜 안 됐는지를 사장님 말로 옮긴다.
//
// 뒷단이 남기는 문구는 대개 `이미지 생성 실패 (429) {본문}` 꼴이다
// (lib/imagegen.js·lib/i2v.js·lib/tts.js·lib/llm.js 가 같은 모양으로 던진다).
// 그래서 **괄호 안의 HTTP 상태**가 가장 믿을 만한 단서다 — 본문 낱말로 맞히는 것보다
// 안정적이고, 제공자가 문구를 바꿔도 안 흔들린다.
//
// ★ 못 알아본 것은 **원문 그대로** 내보낸다. "알 수 없는 오류"로 뭉개면 지금보다 정보가
//   줄어든다 — 사장님이 우리에게 그 문구를 그대로 읽어 줄 수 있어야 고칠 수 있다.
//
// import 0 개의 순수 모듈이다 — 화면이 읽어도 안전하다(lib/pricing.js 와 같은 규칙).

export const FAILURE_CODES = [
  "no_credits", "budget", "rejected", "busy", "timeout", "network", "provider", "empty", "unknown",
];

export function classifyFailure(raw) {
  const text = (typeof raw === "string" ? raw : raw?.message) || "";
  if (!text) return { code: "unknown", message: "만들지 못했어요", retryable: true };

  // 돈 — 여기서는 **원문이 곧 사장님에게 할 말**이다(lib/charges.js·lib/costs.js 가 남긴
  // 문구에 얼마가 모자란지까지 들어 있다). 다시 써서 그 숫자를 잃지 않는다.
  if (text.includes("크레딧이 모자라요")) {
    return { code: "no_credits", message: text, retryable: false };
  }
  if (text.includes("예산 상한")) {
    return { code: "budget", message: text, retryable: false };
  }

  // 괄호 안 세 자리 숫자 = 제공자가 준 HTTP 상태.
  const status = Number((text.match(/\((\d{3})\)/) || [])[1]) || 0;
  // ★ 402 를 아래 4xx 규칙보다 **먼저** 본다 — 순서가 뒤바뀌면 돈 문제가 "장면을 못 만들었어요"가 된다.
  if (status === 402) {
    return { code: "no_credits", message: "크레딧이 모자라요 — 충전한 뒤 다시 시도해 주세요", retryable: false };
  }
  if (status === 429) {
    return { code: "busy", message: "만드는 쪽에 요청이 몰렸어요 — 잠시 뒤 다시 시도해 주세요", retryable: true };
  }
  if (status === 408 || status === 504) {
    return { code: "timeout", message: "만드는 데 너무 오래 걸렸어요 — 다시 시도해 주세요", retryable: true };
  }
  if (status >= 500) {
    return { code: "provider", message: "만드는 쪽 서비스에 문제가 있어요 — 잠시 뒤 다시 시도해 주세요", retryable: true };
  }
  if (status >= 400) {
    // 안전 필터·잘못된 요청이 여기로 온다. 사장님이 할 수 있는 일은 같다 — 문장을 바꿔 다시.
    return { code: "rejected", message: "이 장면은 만들지 못했어요 — 문장을 조금 바꿔 다시 시도해 주세요", retryable: true };
  }

  if (/결과가 비어 있어요/.test(text)) {
    return { code: "empty", message: "결과가 비어서 왔어요 — 다시 시도해 주세요", retryable: true };
  }
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(text)) {
    return { code: "network", message: "잠시 연결이 끊겼어요 — 다시 시도해 주세요", retryable: true };
  }

  return { code: "unknown", message: text, retryable: true };
}
