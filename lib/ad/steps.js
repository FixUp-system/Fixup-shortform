// 광고 한 방 만들기의 표시 단계 — 사이드바 하위 항목이 읽는다.
//
// ⚠️ 이 파일은 화면("use client")도 import 한다. **import 문을 두지 마라** —
//    lib/ad/models.js·lib/ad/options.js 와 같은 규율이다(순수 데이터·순수 함수만이어야
//    번들에 fs 가 안 섞인다).
//
// 기존 6단계(lib/steps.js)와 근본이 다르다:
//  - 저건 "지금 있어야 할 화면"(페이지가 여럿, 사장님이 눌러야 다음으로 간다).
//  - 이건 "지금 어디쯤인가"(페이지 하나 `/ads/[id]` 가 status 로 넷을 오간다.
//    자동으로 흐르고, 사장님은 확인만 한다).
// 그래서 이 표에는 href 가 없다 — 사이드바 하위 항목은 이동이 아니라 표시다.
//
// key 는 project.status(app/ads/[id]/page.js·lib/ad/pipeline.js) 값 그대로다:
// draft(입력) · scenario(시나리오 확인 대기) · rendering(굽는 중) · done(완성).
// 이 값을 여기서 다시 만들지 않고 그대로 쓰는 이유는 두 표가 갈릴 자리를 안 만들기 위해서다.
export const AD_STEPS = [
  { key: "draft", no: "1", label: "입력" },
  // waits — 사람이 실제로 멈춰 기다리는 유일한 자리(시나리오 확인). 그 외 세 단계는
  // 전부 자동으로 흐른다. 사이드바가 이 자리에만 "확인" 꼬리표를 붙인다.
  { key: "scenario", no: "2", label: "시나리오", waits: true },
  { key: "rendering", no: "3", label: "만드는 중" },
  { key: "done", no: "4", label: "완성" },
];

// status → 몇 번째 단계인가(0-based). 모르는 값(아직 없거나, 나중에 다섯째 상태가 생기면)은
// 첫 단계로 본다 — 사이드바가 죽거나 빈 채로 남는 대신 "입력"부터 보여준다.
export function adStepIndex(status) {
  const i = AD_STEPS.findIndex((s) => s.key === status);
  return i === -1 ? 0 : i;
}
