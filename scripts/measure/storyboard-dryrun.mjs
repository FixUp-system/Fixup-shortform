// 가짜 모드에서 스토리보드 갈래가 통째로 도는지 — **0원**.
//
// ★ 이 저장소의 유일한 공짜 검증이다: 값이 0 인 채로 배선 전체(생성→내려받기→자르기)가
//   실제로 도는지 본다. 오늘 표본 주소를 상대 경로로 바꾸면서 이 길이 한 번 끊겼었다.
process.env.SHOTFORM_FAKE = "fal";
process.env.SHOTFORM_STORE = "memory";
const { planReelImages, buildStoryboardPrompt, storyboardImageSize, cropStoryboardCells, fetchImageBytes } =
  await import("../../lib/reel/storyboard.js");
const { generateImage } = await import("../../lib/imagegen.js");

const cuts = [0, 1, 2, 3].map((i) => ({ idx: i, shows: `scene ${i + 1}` }));
const project = { scenario: { look: "red box" }, settings: { mood: "warm", style: "photo" } };

const plan = planReelImages(cuts, null);
console.log("갈래:", plan.mode, "· 격자:", plan.grid && `${plan.grid.rows}x${plan.grid.cols}`);
const size = storyboardImageSize(plan.grid, "9:16");
console.log("요청 치수:", `${size.width}x${size.height}`);
const out = await generateImage({
  prompt: buildStoryboardPrompt(project, cuts, plan.grid),
  aspect_ratio: plan.grid.canvas,
  imageSize: size,
});
console.log("가짜 응답:", out.url);
const bytes = await fetchImageBytes(out.url);
console.log("바이트:", `${Math.round(bytes.length / 1024)}KB`);
const cells = await cropStoryboardCells(bytes, plan.grid, { aspect: "9:16" });
console.log("잘린 칸:", `${cells.length}개 · 첫 칸 ${Math.round(cells[0].length / 1024)}KB`);
