// 랜딩에 거는 표지 — **구워 넣은 목록이다. 손으로 고치지 마라.**
//
// 만드는 법:  node scripts/showcase-refresh.mjs
// 만든 때:    2026-09-09  (출처 https://fixup-shortform-service.vercel.app)
//
// ★★ 이 파일과 public/showcase/ 는 **한 벌**이다. 한쪽만 고치면 깨진 칸이 생긴다 —
//   스크립트가 둘을 함께 쓴다.
// ★★ 이 파일에 **import 를 더하지 마라.** 화면이 읽는 자리라 그 사슬 끝에 fs 가 있으면
//   빌드가 깨진다(이 저장소가 세 번 겪었다 — CLAUDE.md 「값이 사는 곳」).
// ★ w·h 는 굽는 시점에 실제 파일에서 쟀다. 화면이 그대로 적어 주면 표지가 하나씩 뜰 때
//   아래가 밀리지 않는다(자리를 미리 잡는다).
export const SHOWCASE = [
  { file: "01.webp", w: 480, h: 853, id: "49edacd4-55fa-4838-90ef-dc2b23b39ae3" },
  { file: "02.webp", w: 480, h: 853, id: "317515a3-7d0a-4ba0-bad4-0258de3b0127" },
  { file: "03.webp", w: 480, h: 853, id: "446e2be6-3fb5-4c69-820b-73bc6673c20b" },
  { file: "04.webp", w: 480, h: 853, id: "b0614aa2-765b-44b9-b65f-27a527719314" },
  { file: "05.webp", w: 477, h: 848, id: "ed278c94-8d08-4efa-8e26-a4056630e0d0" },
];
