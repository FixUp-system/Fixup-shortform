// 사이즈 아래 한 줄은 **어느 플랫폼에 올리기 좋은가**다 (2026-09-14 사장님 지시).
// 그리고 모델 칩 아래의 설명 줄은 뺐다(같은 날 지시).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ASPECTS } from "../lib/aspects.js";

const SCREENS = [
  "components/AdOptionTray.jsx",
  "app/create/page.js",
  "app/reel/new/page.js",
  "app/film/new/page.js",
  "app/film/one/[mode]/page.js",
];

describe("사이즈 안내", () => {
  it("사이즈마다 플랫폼 문장이 있다", () => {
    for (const a of ASPECTS) expect(a.fits, `${a.id} 에 fits 가 없다`).toMatch(/[가-힣]/);
    expect(ASPECTS.find((a) => a.id === "9:16").fits).toMatch(/쇼츠|릴스|틱톡/);
    expect(ASPECTS.find((a) => a.id === "16:9").fits).toMatch(/유튜브/);
  });

  it("다섯 화면 모두 표의 문장을 그대로 쓰고, 옛 뭉뚱그린 문장은 없다", () => {
    for (const f of SCREENS) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} 가 fits 를 안 쓴다`).toContain("{aspectFor(aspect).fits}");
      expect(src, `${f} 에 옛 문장이 남았다`).not.toContain("에 맞는 규격이에요");
    }
  });
});

describe("모델 설명 줄을 뺐다", () => {
  it("모델 칩 아래에 hint 를 그리지 않는다", () => {
    expect(readFileSync("components/AdOptionTray.jsx", "utf8")).not.toMatch(/AD_MODELS\.find\([^)]*\)\?\.hint/);
    expect(readFileSync("app/reel/new/page.js", "utf8")).not.toMatch(/models\.find\([^)]*\)\?\.hint/);
    expect(readFileSync("app/create/page.js", "utf8")).not.toMatch(/I2V_MODELS\.find\([^)]*\)\?\.hint/);
  });
});
