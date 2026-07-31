// 가짜 모드 판정 한 곳 — 세 단계다.
//   off : 전부 진짜
//   fal : fal(이미지·TTS·i2v·합성)만 가짜. OpenAI는 진짜라 대본 내용까지 확인된다
//   all : OpenAI까지 가짜. 완전 0원 — 배선과 상태 전이만 확인한다
//
// 모르는 값은 off 로 본다. 오타(SHOTFORM_FAKE=true)를 무료로 착각하고 돌리면 돈이 나가므로,
// 애매하면 "진짜로 동작"하는 쪽이 아니라 "사용자가 의도를 명시한 경우에만 막는" 쪽을 택했다.
export function fakeLevel() {
  const v = process.env.SHOTFORM_FAKE;
  if (v === "all") return "all";
  // 옛 이름은 계속 인정한다 (tests/vlm.test.js 와 CLAUDE.md 의 실행 예시가 쓴다).
  // ★ 최종 리뷰 I3 — "fal" 을 안 받았었다. CLAUDE.md 가 광고하는
  // `SHOTFORM_FAKE=fal npm run dev` 가 실제로는 off(=진짜, 돈이 나감)로 동작한 원인.
  if (v === "1" || v === "fal" || process.env.SHOTFORM_FAKE_IMAGES === "1") return "fal";
  return "off";
}

// fal 호출(이미지·TTS·i2v·합성)을 건너뛰는가
export function fakeFal() {
  return fakeLevel() !== "off";
}

// OpenAI 호출(브리핑·대본·컷·VLM)을 건너뛰는가
export function fakeLlm() {
  return fakeLevel() === "all";
}
