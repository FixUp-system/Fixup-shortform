// **영어 지문 옆에 사장님 말을 곁들인다** (2026-09-03 사장님 지시).
//
// ★★★ 이 판이 지키는 것은 셋이다 — 하나만 깨져도 지문이 망가진다:
//   ① **원문은 안 건드린다.** 모델에게 나가는 것도, 각인(of)이 무는 것도 원문 하나다.
//      번역이 각인에 섞이면 번역이 달라질 때마다 이미 구운 편이 낡는다.
//   ② **실패하면 빈 값**이다 — 번역이 안 되는 것과 지문을 못 만드는 것은 다른 일이라,
//      번역 실패가 본 일을 망치면 안 된다.
//   ③ **앞으로 만드는 문서에만** 붙는다(사장님 결정) — 옛 문서를 열 때 값을 쓰지 않는다.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { translatePrompt, TRANSLATE_SYSTEM } from "../lib/reel/translate.js";

const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

describe("translatePrompt — 옮기는 함수", () => {
  it("★★★ 옮긴 글을 돌려준다", async () => {
    const call = vi.fn(async () => ({ ko: "한 번에 이어지는 15초 영상" }));
    const out = await translatePrompt("One continuous 15-second video", { callJsonImpl: call });
    expect(out).toBe("한 번에 이어지는 15초 영상");
  });

  it("★★★ 실패하면 **빈 값**이다 — 던지면 본 일까지 망친다", async () => {
    const call = vi.fn(async () => { throw new Error("LLM 죽음"); });
    await expect(translatePrompt("x", { callJsonImpl: call })).resolves.toBe("");
  });

  it("★★ 모양이 어긋난 응답도 빈 값이다", async () => {
    for (const bad of [{}, { ko: 123 }, null, { ko: "   " }]) {
      const call = vi.fn(async () => bad);
      expect(await translatePrompt("x", { callJsonImpl: call })).toBe("");
    }
  });

  it("★★ 빈 입력이면 **안 부른다** — 값이 드는 자리라 헛호출을 만들지 않는다", async () => {
    const call = vi.fn(async () => ({ ko: "안 불려야 한다" }));
    expect(await translatePrompt("", { callJsonImpl: call })).toBe("");
    expect(await translatePrompt("   ", { callJsonImpl: call })).toBe("");
    expect(await translatePrompt(null, { callJsonImpl: call })).toBe("");
    expect(call).not.toHaveBeenCalled();
  });

  it("★★ 가짜 모드에서 돌려줄 값을 **부르는 쪽이 정한다** — 광고 시나리오가 섞이지 않게", async () => {
    let seen = null;
    const call = vi.fn(async (args) => { seen = args; return { ko: "" }; });
    await translatePrompt("x", { callJsonImpl: call });
    expect(typeof seen.fake, "fake 를 안 넘긴다").toBe("function");
    expect(seen.fake()).toEqual({ ko: "" });
  });

  it("★ 지문이 지켜야 할 것을 말한다 — 요약·다듬기·대사 번역을 막는다", () => {
    expect(TRANSLATE_SYSTEM).toMatch(/요약/);
    expect(TRANSLATE_SYSTEM).toMatch(/대사/);
    expect(TRANSLATE_SYSTEM).toMatch(/제품명|브랜드/);
  });
});

describe("배선 — 세 자리가 같은 함수를 쓴다", () => {
  const files = {
    "시나리오": "app/api/reel/[id]/scenario/route.js",
    "이미지 지문": "app/api/reel/[id]/images/route.js",
    "영상 프롬프트": "app/api/reel/[id]/prompts/route.js",
  };

  for (const [name, path] of Object.entries(files)) {
    it(`★★★ ${name} 이 번역을 곁들인다`, () => {
      const src = strip(readFileSync(path, "utf8"));
      expect(src, "번역을 안 부른다").toMatch(/translatePrompt\(/);
    });
  }

  it("★★★ 원문 자리는 그대로다 — 번역이 원문을 덮지 않는다", () => {
    const prompts = strip(readFileSync("app/api/reel/[id]/prompts/route.js", "utf8"));
    // 저장할 때 원문(prompt)과 번역(prompt_ko)이 **둘 다** 실린다.
    expect(prompts).toMatch(/prompt: next, prompt_ko:/);
  });

  it("★★ 이미지 번역은 **판 단위 하나**다 — 컷마다 같은 글을 저장하지 않는다", () => {
    const images = strip(readFileSync("app/api/reel/[id]/images/route.js", "utf8"));
    expect(images).toMatch(/image_prompt_ko/);
    // 각인(of)은 컷마다 그대로 — 번역이 그 자리에 섞이면 안 된다.
    expect(images, "각인에 번역이 섞였다").not.toMatch(/of_ko/);
  });

  it("★★ 번역은 저장 **전에** 만든다 — updateProject 안에서 부르면 그 프로젝트의 저장이 멈춘다", () => {
    const scenario = strip(readFileSync("app/api/reel/[id]/scenario/route.js", "utf8"));
    const call = scenario.indexOf("translatePrompt(");
    const update = scenario.indexOf("await updateProject(id, user.id, (p) => {");
    expect(call, "번역을 안 부른다").toBeGreaterThan(-1);
    expect(call, "updateProject 안에서 번역한다").toBeLessThan(update);
  });
});

describe("화면 — 옛 문서에는 안 그린다", () => {
  it("★★★ 번역이 없으면 그 줄을 아예 안 그린다", () => {
    const src = readFileSync("components/PromptWithKo.jsx", "utf8");
    expect(src).toMatch(/\{trans && \(/);
  });

  it("★★ 원문이 없으면 아무것도 안 그린다 — 빈 상자를 남기지 않는다", () => {
    const src = readFileSync("components/PromptWithKo.jsx", "utf8");
    expect(src).toMatch(/if \(!body\) return null/);
  });

  it("★★ 세 화면이 그 컴포넌트를 쓴다", () => {
    for (const p of [
      "app/reel/[id]/scenario/page.js",
      "app/reel/[id]/prompts/page.js",
      "app/reel/[id]/images/page.js",
    ]) {
      expect(strip(readFileSync(p, "utf8")), `${p} 가 안 쓴다`).toMatch(/<PromptWithKo/);
    }
  });
});
