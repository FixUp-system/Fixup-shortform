// **가리켜지지 않은 참조 사진을 코드가 짚어 준다** (2026-09-28 사장님 신고: "단계별 기본
// 빼고 다른 모드는 로고가 안 들어간다").
//
// ★★★ 실측 근거 — Seedance·H3 는 참조 사진을 **지문 안에서 이름으로 가리켜야** 쓴다
//   (lib/ad/scenario.js 의 지시문: "안 가리키면 사진이 통째로 무시된다"). 그런데 그 이름을
//   적는 것은 시나리오 LLM 이고, **빠뜨려도 아무도 안 잡았다.**
//     · 4e390466(09-22 · 프로) 로고가 4번째인데 시나리오는 @Image1~3 만 가리켰다
//     · 666991e0(09-21 · 기본) 같은 모양 — 로고가 무시됐다
//   사진은 **보내고 있었다.** 전달이 아니라 **가리킴**이 빠진 것이다.
// ★ 그래서 코드가 마지막에 본다 — 지문에 안 나온 사진이 있으면 꼬리에 한 줄씩 붙인다.
//   문구 조각은 단계별과 **같은 표**(lib/photos.js 의 PHOTO_ROLES.en)에서 온다.
// ★ 광고와 film 이 이 함수(buildFalInput) 하나를 함께 쓴다 — 두 흐름이 같이 고쳐진다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildFalInput } from "../lib/ad/generate.js";
import { LEDGER_PROMPT_MAX } from "../lib/costs.js";

const ref = (role, key) => ({ key, bytes: Buffer.from(key), role });
const base = (model, prompt, refs) => buildFalInput({
  settings: { model, aspect_ratio: "9:16", resolution: "720p" },
  scenario: { text: prompt },
  refs, kind: "r2v", seconds: 15,
});

describe("가리키지 않은 사진 — 코드가 꼬리에 짚어 준다", () => {
  it("★★★ 로고가 안 가리켜졌으면 그 라벨로 한 줄이 붙는다(2.5 는 @ImageN)", () => {
    const p = base("seedance-2.5", "@Image1 제품을 보여 준다. @Image2 도 함께.",
      [ref("product", "a.png"), ref("product", "b.png"), ref("logo", "c.png")]).prompt;
    expect(p).toMatch(/@Image3 is the brand logo/);
    expect(p).toMatch(/never redraw, restyle, recolour, or re-letter it/);
  });

  it("★★★ 모델마다 라벨 표기가 다르다 — H3 는 'Image N'", () => {
    const p = base("minimax-h3", "Image 1 shows the bottle.",
      [ref("product", "a.png"), ref("logo", "b.png")]).prompt;
    expect(p).toMatch(/Image 2 is the brand logo/);
  });

  it("★★ 이미 가리켜진 사진은 다시 안 붙인다 — 같은 말을 두 번 실으면 무게만 흐려진다", () => {
    const p = base("seedance-2.5", "@Image1 제품. 끝에 @Image2 로고를 박는다.",
      [ref("product", "a.png"), ref("logo", "b.png")]).prompt;
    expect(p.match(/@Image2 is the brand logo/g) || []).toHaveLength(0);
  });

  it("★★ 띄어쓰기가 달라도 가리킨 것으로 본다 — 'Image  2' 도 같은 사진이다", () => {
    const p = base("minimax-h3", "Image  2 is used at the end.",
      [ref("product", "a.png"), ref("logo", "b.png")]).prompt;
    expect(p).not.toMatch(/Image 2 is the brand logo/);
  });

  it("★★ 종류를 모르는 사진은 안 짚는다 — 무엇이라고 말할 것이 없다", () => {
    const p = base("seedance-2.5", "장면 설명만 있다.", [{ key: "x.png", bytes: Buffer.from("x") }]).prompt;
    expect(p).toBe("장면 설명만 있다.");
  });

  it("★★★ i2v 는 안 짚는다 — 그 사진은 참조가 아니라 첫 프레임이다", () => {
    const input = buildFalInput({
      settings: { model: "seedance-2.5", aspect_ratio: "9:16" },
      scenario: { text: "장면" }, refs: [ref("logo", "a.png")], kind: "i2v", seconds: 15,
    });
    expect(input.prompt).toBe("장면");
  });

  it("★ 사진이 없으면 지문이 글자 그대로다", () => {
    expect(base("seedance-2.5", "장면", []).prompt).toBe("장면");
  });
});

describe("역할이 적재까지 따라온다", () => {
  it("★★ 광고·film 두 적재 함수가 사진의 종류를 refs 에 싣는다", () => {
    for (const f of ["lib/ad/pipeline.js", "lib/film/pipeline.js"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/role: photo\.role/);
    }
  });
});

describe("원장 — 광고도 단계별과 같은 길이로 남긴다", () => {
  it("★★★ 300 자로 자르던 것을 걷었다 — 무엇을 보냈는지 확인할 채널이 막혀 있었다", () => {
    const src = readFileSync("lib/ad/generate.js", "utf8");
    expect(src).not.toMatch(/slice\(0, 300\)/);
    expect(src).toMatch(/slice\(0, LEDGER_PROMPT_MAX\)/);
    expect(LEDGER_PROMPT_MAX).toBe(4000);
  });
});
