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
  "no_credits", "budget", "rejected", "rejected_likeness", "busy", "timeout", "network",
  "provider", "empty", "unknown",
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

  // ★★ 초상 거절 — **상태 코드보다 먼저 본다**(2026-08-31). 이 오류는 422 로 오는데,
  //   아래 `status >= 400` 가지가 먼저 물면 "문장을 조금 바꿔 다시 시도해 주세요"가 된다.
  //   그 안내는 이 경우 **틀렸다**: 문장을 백 번 바꿔도 안 풀린다.
  //
  //   fal 원문: `loc:["body","image_urls"]` — *"The images or videos provided may contain
  //   likenesses of real people or other private information that cannot be processed."*
  //
  // ★ 뿌리는 **얼굴이 식별 가능한가**(크기 × 정면성 × 응시)이지 화풍이 아니다 —
  //   2026-08-25 실측에서 같은 날 **실사인데 통과한 표본**이 원장에 있었다.
  // ★ 끄는 파라미터가 없고 프롬프트로도 못 푼다 — 오류가 `image_urls` 를 가리키는,
  //   이미지를 따로 보는 분류기다. 그래서 여기서 할 수 있는 일은 **무엇을 바꿔야
  //   풀리는지**를 정확히 말해 주는 것뿐이다.
  // ★ retryable 은 **참**이다 — 사진을 바꿔 다시 굽는 것이 바로 이 오류의 해법이라,
  //   거짓으로 두면 화면이 그 문을 닫는다.
  // ★ **이미지에 대한 거절일 때만** 잡는다. "사진을 바꿔 주세요"는 그때만 맞는 말이라,
  //   프롬프트가 걸린 정책 거절(같은 낱말이 온다)까지 물면 엉뚱한 안내가 된다.
  //   그래서 둘 중 하나여야 한다 — ① 초상이라고 **말한 것** ② 정책 거절이면서 **이미지
  //   칸을 가리킨 것**.
  if (/likenesses of real people/i.test(text)
    || (/content_policy_violation/i.test(text) && /image_urls?|reference_image_urls/i.test(text))) {
    return {
      code: "rejected_likeness",
      message: "사진에 사람 얼굴이 또렷하게 담겨 있어서 만드는 쪽이 거절했어요 — 얼굴이 작게 나오거나 옆을 보는 사진으로 바꾸거나, 그 사진을 빼고 다시 시도해 주세요",
      retryable: true,
    };
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
