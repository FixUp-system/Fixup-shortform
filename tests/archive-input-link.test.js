// 보관함 상세 — 적은 글을 더 보려면 **입력 화면으로 간다** (2026-09-15 사장님 결정).
//
// ★ 그전에는 그 자리에서 접었다 폈다(`<details>`). 보관함은 **보는 곳**이고 고치는 곳은
//   제작 화면이라, 글을 더 보려면 그쪽으로 가는 것이 흐름에 맞다 — 거기서는 보는 데서
//   그치지 않고 **고칠 수도** 있다.
// ★★ 라벨이 함께 바뀌어야 한다 — 「전체 보기」는 "이 자리에서 더 보여 줘"로 읽힌다.
//   페이지를 옮기는데 그 말을 그대로 두면 거짓말이 된다.
// ★ 손님 걱정은 없다 — 보관함을 회원 전용으로 돌리기로 했다(사장님, 2026-09-15).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/archive/[id]/page.js", "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("보관함 상세 — 적은 글", () => {
  it("★★★ 그 자리에서 펼치지 않는다 — 입력 화면으로 간다", () => {
    expect(code, "아직 접었다 폈다 한다").not.toContain("input-fold");
    expect(code, "입력 화면으로 가는 길이 없다").toContain("inputHref");
  });

  it("★★★ 라벨이 **가는 곳**을 말한다 — 「전체 보기」는 거짓말이 된다", () => {
    expect(code, "옛 라벨이 남아 있다").not.toContain("전체 보기");
    expect(code, "어디로 가는지 안 말한다").toMatch(/입력 화면/);
  });

  it("★★ 짧은 글에는 그 길을 안 붙인다 — 없는 분량을 있는 것처럼 말한다", () => {
    expect(code, "길이 문턱이 없다").toContain("INPUT_FOLD_AT");
  });

  it("★★ 입력 화면 주소는 **종류마다** 다르다 — 하나로 적으면 딴 데로 간다", () => {
    const at = code.indexOf("const inputHref");
    expect(at, "inputHref 를 안 만든다").toBeGreaterThan(-1);
    const line = code.slice(at, code.indexOf("\n", at));
    expect(line, "reel 갈래가 없다").toContain("isReel");
    expect(line, "광고 갈래가 없다").toContain("isAd");
  });
});
