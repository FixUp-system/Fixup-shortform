// 광고에서 영어를 **고르는 길만** 닫는다 (2026-08-18 사용자 요청: "일단 제외").
//
// ★ 지우지 않는 이유 — 이 저장소가 이미 겪은 사고다. 선택지를 표에서 지웠더니
//   그 값으로 만든 옛 문서가 조회에서 던져 화면째 죽었다(seedance-2.0-fast).
//   그래서 모델은 `hidden: true` 로 **표에 남기고 칩만 안 그리는** 길을 택했고
//   (lib/ad/models.js), 언어도 같은 자를 쓴다. "일단"이라는 말이 곧 되돌릴 여지를
//   뜻하므로, 되돌리기는 그 한 줄을 지우는 것이어야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AD_LANGS, normalizeAdOptions } from "../lib/ad/options.js";

// ★ 2026-08-21 — 입력 트레이(포맷·분위기·화풍·언어·사이즈·모델·해상도·길이)가
//   components/AdOptionTray.jsx 로 빠졌다. **입력 수정 화면(/ads/[id]?step=draft)과
//   나눠 쓰기 위해서**다 — 두 벌이면 한쪽이 낡는다.
//   이 시험들이 재는 계약은 그대로이므로 **읽는 자리만 넓힌다**: 화면 + 그 화면이 쓰는
//   트레이를 한 덩어리로 본다. 트레이만 읽으면 화면 쪽 계약(사진·본문)을 놓친다.
const src = [
  readFileSync("app/ads/new/page.js", "utf8"),
  readFileSync("components/AdOptionTray.jsx", "utf8"),
].join("\n");
// 주석은 걷어내고 판정한다 — 주석 속 낱말이 계약을 대신 통과시킨 사고가 반복됐다
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("광고 나레이션 언어 — 영어는 숨긴다", () => {
  it("★ 영어가 표에서 사라지지는 않는다 — 옛 문서가 계속 열려야 한다", () => {
    expect(AD_LANGS.map((l) => l.id), "영어를 지웠다 — 영어로 만든 옛 광고가 죽는다")
      .toContain("en");
  });

  it("★ 영어는 hidden 이다", () => {
    expect(AD_LANGS.find((l) => l.id === "en")?.hidden, "영어가 아직 고를 수 있다").toBe(true);
  });

  it("★ 한국어·일본어·중국어는 그대로 고를 수 있다", () => {
    for (const id of ["ko", "ja", "zh"]) {
      expect(AD_LANGS.find((l) => l.id === id)?.hidden, `${id} 까지 숨겨졌다`).toBeFalsy();
    }
  });

  it("★ 화면은 숨긴 언어를 칩으로 안 그린다 — 모델 칩과 같은 자를 쓴다", () => {
    expect(code, "AD_LANGS 를 거르지 않고 그대로 그린다 — 영어 칩이 그대로 보인다")
      .toMatch(/AD_LANGS\.filter\(\([^)]*\)\s*=>\s*![^)]*\.hidden\)/);
  });

  it("★ 저장된 영어 문서는 그대로 영어로 남는다 — 숨긴다고 값을 갈아치우지 않는다", () => {
    const out = normalizeAdOptions({ narration_lang: "en" });
    expect(out.narration_lang, "옛 문서의 영어가 조용히 다른 말로 바뀐다").toBe("en");
  });
});
