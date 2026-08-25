// 화면 제목 — **단계 표가 쥔다**(2026-08-25 사장님 지시).
//
// ★★ 전에는 제목이 두 겹이었다: 레이아웃의 h1("컷마다 말하는 영상")과 화면마다의 h2("그림").
//   흐름 이름은 사이드바에 이미 있어 h1 은 중복이었고, h2 는 손으로 적어서 단계 라벨과 갈렸다
//   (표에서는 "이미지 생성"인데 화면에는 "그림"). 표 하나만 보게 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { REEL_STEPS } from "../lib/reel/steps.js";

const layout = readFileSync("app/reel/[id]/layout.js", "utf8");
const clean = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("흐름 제목이 겹치지 않는다", () => {
  it("레이아웃이 흐름 이름을 다시 쓰지 않는다", () => {
    expect(clean(layout)).not.toContain("컷마다 말하는 영상");
  });
});

describe("화면 제목은 단계 라벨이다", () => {
  const pages = [
    ["briefing", "material"],
    ["scenario", "scenario"],
    ["images", "images"],
  ];
  for (const [seg, key] of pages) {
    it(`${seg} 제목이 표에서 온다`, () => {
      const src = clean(readFileSync(`app/reel/[id]/${seg}/page.js`, "utf8"));
      const label = REEL_STEPS.find((s) => s.key === key).label;
      // 손으로 적은 옛 제목이 남아 있으면 안 된다
      expect(src, `${seg}: 제목을 손으로 적었다`).not.toMatch(/<h2>[가-힣 ]+<\/h2>/);
      expect(src, `${seg}: 표를 안 읽는다`).toMatch(/REEL_STEPS|stepLabel/);
      expect(label).toBeTruthy();
    });
  }

  it("이미지 단계 라벨이 이미지 생성이다", () => {
    expect(REEL_STEPS.find((s) => s.key === "images").label).toBe("이미지 생성");
  });
});
