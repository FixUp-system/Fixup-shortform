// 랜딩에 거는 표지 — **구워 넣은 목록이다. 손으로 고치지 마라.**
//
// 만드는 법:  node scripts/showcase-refresh.mjs
// 만든 때:    2026-09-10  (출처 https://fixup-shortform-service.vercel.app)
//
// ★★ 이 파일과 public/showcase/ 는 **한 벌**이다. 한쪽만 고치면 깨진 칸이 생긴다 —
//   스크립트가 둘을 함께 쓴다.
// ★★ 이 파일에 **import 를 더하지 마라.** 화면이 읽는 자리라 그 사슬 끝에 fs 가 있으면
//   빌드가 깨진다(이 저장소가 세 번 겪었다 — CLAUDE.md 「값이 사는 곳」).
// ★ w·h 는 굽는 시점에 실제 파일에서 쟀다. 화면이 그대로 적어 주면 표지가 하나씩 뜰 때
//   아래가 밀리지 않는다(자리를 미리 잡는다).
export const SHOWCASE = [
  { file: "01.webp", w: 480, h: 853, id: "14fd0ce0-e4fa-40a1-b4f9-59816f20b2af" },
  { file: "02.webp", w: 480, h: 853, id: "49edacd4-55fa-4838-90ef-dc2b23b39ae3" },
  { file: "03.webp", w: 480, h: 853, id: "317515a3-7d0a-4ba0-bad4-0258de3b0127" },
  { file: "04.webp", w: 480, h: 853, id: "446e2be6-3fb5-4c69-820b-73bc6673c20b" },
  { file: "05.webp", w: 720, h: 1280, id: "8be2d89d-afad-46ec-ad0a-7a820df701dd" },
  { file: "06.webp", w: 480, h: 853, id: "b0614aa2-765b-44b9-b65f-27a527719314" },
  { file: "07.webp", w: 477, h: 848, id: "ed278c94-8d08-4efa-8e26-a4056630e0d0" },
  { file: "08.webp", w: 720, h: 1280, id: "535af2c4-504c-41b2-9b01-16ce92ddf7e8" },
  { file: "09.webp", w: 720, h: 1280, id: "00b1885a-62a8-4e71-92fb-d8ae7f36e194" },
  { file: "10.webp", w: 720, h: 1280, id: "5ddea7b7-70c5-4b41-afba-65b3d9892530" },
  { file: "11.webp", w: 720, h: 1280, id: "47afd05a-d127-4c7f-8a16-dfdbc9189b2f" },
  { file: "12.webp", w: 720, h: 1280, id: "4d441ed1-bab3-411f-830c-2a76bde539fc" },
  { file: "13.webp", w: 480, h: 854, id: "645fa232-a3a4-4dd5-9b1e-ea6acf0391c0" },
  { file: "14.webp", w: 640, h: 640, id: "78cc092e-29ea-4754-9554-14f974cf5667" },
  { file: "15.webp", w: 496, h: 864, id: "1e5af142-1227-4f6c-bcf9-5d395746407e" },
  { file: "16.webp", w: 768, h: 1376, id: "3dd7ae72-a793-46fe-8345-8cae15fa7d6e" },
];
