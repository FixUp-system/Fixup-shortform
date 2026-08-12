import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "node:fs";
import { SUBTITLE_FONTS } from "../lib/subtitles.js";

// ★ 폰트는 코드가 아니라 파일이다. 목록에만 있고 파일이 없으면 ffmpeg 가 조용히
// 기본 폰트로 그려 사장님이 고른 것과 다른 자막이 나온다 — 아무도 못 알아챈다.
describe("자막 폰트 파일", () => {
  const FILES = {
    basic: "assets/subtitle-font.otf",
    impact: "assets/subtitle-impact.ttf",
    soft: "assets/subtitle-soft.ttf",
  };

  for (const f of SUBTITLE_FONTS) {
    it(`${f.id}(${f.label}) 파일이 있다`, () => {
      const p = FILES[f.id];
      expect(p, `${f.id} 의 파일 경로가 목록에 없다`).toBeTruthy();
      expect(existsSync(p), `${p} 가 없다`).toBe(true);
      // 오류 HTML 을 받아 놓고 폰트라고 믿는 것을 막는다
      expect(statSync(p).size).toBeGreaterThan(50_000);
    });
  }
});
