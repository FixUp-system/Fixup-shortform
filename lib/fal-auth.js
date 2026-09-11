// fal 에 보내는 머리말 — **유일한 자리**.
//
// ★★★ 2026-09-11 — 그전에는 `Authorization: \`Key ${process.env.FAL_KEY}\`` 가 **열두 곳**에
//   손으로 적혀 있었다(i2v·imagegen·tts·compose·speech-probe·ad/generate·ad/pipeline·
//   reel/pipeline). 열두 벌이면 머리말을 하나 더할 때 **한 곳만 빠져도 아무도 모른다** —
//   그리고 이번에 더하는 것이 바로 개인정보에 닿는 머리말이다.
//
// ★★★ `X-Fal-Store-IO: "0"` 을 왜 넣는가.
//   fal 은 기본으로 **요청·응답 JSON 을 30일 보관**한다(대시보드 이력용). 그런데 우리 요청
//   몸통에는 **사장님이 올린 사진이 data URI 로 통째로** 들어 있다(lib/refs-io.js 의 toDataUri —
//   업로드 버킷이 비공개라 fal 이 URL 을 못 읽어서 바이트로 넘긴다). 즉 지금까지 이용자의
//   가게·제품·인물 사진이 fal 의 보관소에 30일씩 쌓여 왔다.
//   → 끄면 그 보관이 사라진다. **문서 확인(2026-09-11): 이 머리말은 JSON 보관만 끄고
//     큐 결과(response_url)와 CDN 파일에는 영향이 없다.**
//
// ⚠️ **대가가 하나 있다 — fal 대시보드의 요청 이력이 사라진다.** 이 저장소는 실제로 그것을
//   디버깅에 썼다(요청 `01a065aa` 의 "fal 이 되돌려준 입력을 눈으로 확인" — 얼굴 격자 거절을
//   그렇게 찾았다). 그 채널을 포기하는 대신 이용자 사진을 남기지 않는 쪽을 골랐다.
//   되살려야 하면 `SHOTFORM_FAL_KEEP_IO=1` 로 이 회차만 켠다(기본은 끔 = 안 남김).
//
// ⚠️ **남은 것**: 이것은 *요청 몸통*만 막는다. **생성된 파일(이미지·클립)은 여전히 fal CDN 에
//   공개로 남는다.** 그쪽을 닫으려면 `initial_acl` + 우리 프록시 라우트가 필요하고, 그러면
//   대역폭이 fal 에서 우리(Vercel)로 옮겨온다 — Pro 승급과 함께 해야 한다.
//   자세한 것은 OUTSTANDING.md 의 「A-3」 항목.

export function falHeaders(extra = {}) {
  const headers = {
    Authorization: `Key ${process.env.FAL_KEY}`,
    ...extra,
  };
  // ★ "1" 일 때만 보관을 켠다 — 오타("true"·"yes")는 **안 남기는 쪽**으로 떨어진다.
  //   이 저장소의 다른 스위치와 같은 규율이다(lib/auth/guest.js 의 guestArchiveOn).
  if (process.env.SHOTFORM_FAL_KEEP_IO !== "1") headers["X-Fal-Store-IO"] = "0";
  return headers;
}
