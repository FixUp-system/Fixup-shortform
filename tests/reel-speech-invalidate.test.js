// 소리가 바뀌면 잰 시각은 딴 소리의 것이다. 2026-09-15 신고의 뿌리 둘 중 하나였다.
import { describe, it, expect } from "vitest";
import fs from "fs";

const src = fs.readFileSync("lib/reel/pipeline.js", "utf8");

describe("영상이 바뀌면 자막 시각을 버린다", () => {
  it("접수·수거·되붙이기 세 자리에서 speech 를 지운다", () => {
    const hits = src.match(/speech:\s*null/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });
});
