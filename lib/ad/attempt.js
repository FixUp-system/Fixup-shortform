// "이미 영상을 낸 프로젝트인가" — 광고 회차 판정을 한 곳에 둔다.
//
// lib/charges.js 는 프로젝트 문서를 읽지 않는다(costs.js 와의 순환 import를 피하려고
// 스토어에서 직접 읽는 의도된 분리다 — lib/charges.js 상단 주석 참고). 그런데 "다음
// [다시 만들기]가 새 회차인가"는 장부만으로는 답할 수 없다 — 성공한 회차의 청구는
// refundAd 가 안 돌아 장부상 영원히 "살아 있다"(readAdLedger 의 active). 그 청구가
// 소진됐는지는 프로젝트 문서(videos)를 봐야 안다.
//
// 이 판정을 부르는 자리가 둘이다: lib/ad/pipeline.js(청구 여부) ·
// app/api/ads/[id]/render/route.js(잔액 검사 여부). 각자 계산하면 언젠가 어긋난다 —
// 이 저장소가 반복해서 겪은 실패 모양이라, 순수 함수 하나로 묶어 둘이 같이 부른다.
export function hasRenderedAdVideo(project) {
  return Boolean(project?.videos?.[0]?.url);
}
