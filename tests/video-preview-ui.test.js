// ⑤영상의 미리보기 — ⑥완성과 같은 규칙이라야 한다.
//
// 그전에는 여기만 틀이 9:16 고정이고 영상이 cover 였다. 16:9·1:1 프로젝트에서는 클립이
// 세로 틀에 맞춰 잘려 보였고, 키우면 그 잘림이 그대로 커졌다(2026-08-13 사용자 지적).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const video = readFileSync("app/create/[id]/video/page.js", "utf8");

describe("⑤영상 — 미리보기 비율", () => {
  it("틀 비율을 프로젝트에서 가져온다", () => {
    expect(video).toMatch(/aspectFor/);
    expect(video).toMatch(/aspectRatio/);
  });

  // 값은 lib/aspects 하나에서 온다 — 화면이 표를 또 만들면 언젠가 갈린다.
  it("비율을 화면에 손으로 적지 않는다", () => {
    const at = video.indexOf("aspectRatio");
    const block = video.slice(Math.max(0, at - 400), at + 200);
    expect(block, "9:16 을 손으로 적었다").not.toMatch(/9 ?\/ ?16/);
  });
});
