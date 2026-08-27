// 손님(로그인 안 한 사람)에게 **보관함만** 열어 주는 문 (2026-08-27 사장님 요청).
//
// 목적은 사장님이 말한 그대로다: **내부 레퍼런스 체크**. 결과물 품질을 보려고 매번
// 로그인하는 것이 실질적인 방해라, 만들어진 영상을 로그인 없이 훑어볼 수 있게 한다.
//
// ⚠️⚠️ **이것은 보안 경계를 넓히는 스위치다.** 켜면 주소를 아는 누구나 이 서비스의
//   **모든 사람의** 영상·자료·프롬프트를 볼 수 있다(보관함은 원래 전체 공유다).
//   그래서 규율을 셋 둔다:
//
//   ① **env 로 켠다. 기본은 닫힘이다.** env 를 잊으면 조용히 열리는 것이 아니라
//      조용히 닫힌다 — 이 저장소가 env 를 잊는 사고를 여러 번 겪었고(CLAUDE.md),
//      그때 안전한 쪽으로 떨어져야 하는 값이다.
//   ② **읽기(GET)만이다.** 만들기·고치기·지우기는 그대로 로그인이 필요하다.
//      값이 나가는 문(생성·굽기)은 이 목록에 **한 줄도 없다.**
//   ③ **경로를 정확히 적는다.** `/api/reel` 처럼 접두사로 열면 그 아래 굽기 문
//      (`/api/reel/<id>/clips`)까지 함께 열린다. 그래서 정규식으로 **한 자리씩** 연다.
//
// ★ 순수 모듈이다(import 0). middleware(Edge)와 라우트가 함께 읽는다.

// 켜져 있는가. **"1" 일 때만** 참이다 — 오타("true"·"yes")는 닫힌 쪽으로 떨어진다.
export function guestArchiveOn() {
  return process.env.SHOTFORM_PUBLIC_ARCHIVE === "1";
}

// 손님이 GET 으로 두드릴 수 있는 자리. **여기 없는 것은 전부 로그인이 필요하다.**
//
// ★ `$` 로 끝을 못 박는다 — 그래야 `/api/reel/<id>/clips`(값이 나가는 문)가 안 걸린다.
// ★ id·파일명 모양도 좁게 잡는다: 우리 문서 id 는 uuid 이고 파일명은 `<id>.mp4` 꼴이다.
const ID = "[A-Za-z0-9_-]{6,64}";
const GUEST_GET = [
  // 화면 — 들어오는 문(루트)과 보관함 목록·상세
  // ★ 루트는 **판정만 하고 보낸다**(app/page.js): 로그인했으면 만들기 화면으로,
  //   아니면 보관함으로. 그 자리가 막혀 있으면 손님은 첫 화면에서 로그인 벽을 만난다.
  new RegExp(`^/$`),
  new RegExp(`^/archive$`),
  new RegExp(`^/archive/${ID}$`),
  // 목록 — 라우트가 손님에게는 늘 [전체]로 답한다(내 것이라는 개념이 없다)
  new RegExp(`^/api/projects$`),
  // 상세 읽기 — 종류마다 문이 다르다(서로를 404 로 거절한다)
  new RegExp(`^/api/projects/${ID}$`),
  new RegExp(`^/api/ads/${ID}$`),
  new RegExp(`^/api/film/${ID}$`),
  new RegExp(`^/api/reel/${ID}$`),
  // 미디어 — 완성본과 사진. 이것이 없으면 보관함이 빈 껍데기다.
  new RegExp(`^/api/renders/${ID}(\\.[a-z0-9]+)?(\\.mp4)?$`),
  new RegExp(`^/api/uploads/${ID}\\.(jpg|png|webp)$`),
];

// ★ 메서드를 **함께** 본다 — 같은 주소라도 GET 만 손님의 것이다
//   (`/api/projects/<id>` 는 DELETE 가, `/api/reel/<id>` 는 PATCH 가 붙어 있다).
export function isGuestPath(pathname, method = "GET") {
  if (method !== "GET") return false;
  return GUEST_GET.some((re) => re.test(pathname));
}

// 손님으로 들어왔는가 — 스위치가 켜져 있고, 그 자리가 손님에게 열린 자리인가.
export function isGuestRequest(pathname, method) {
  return guestArchiveOn() && isGuestPath(pathname, method);
}

// 원장·로그에 남는 손님의 이름. 실제 사용자 id 와 섞이지 않는 문자열이어야 한다
// (uuid 가 아니므로 lib/costs.js 의 labelFor 가 그대로 내보낸다).
export const GUEST_ACTOR = "guest";
