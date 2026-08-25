// 통짜 갈래의 수정 요청은 **붙이는 것이 아니라 다시 쓰는 것**이다.
//
// ★ 2026-08-25 사장님 지적: 적은 말이 전체 프롬프트 끝에 그대로 붙고, 붙고 나면 위 글에
//   그 한국어가 그대로 보였다. 붙이는 자리를 없애고 LLM 이 한 문단으로 다시 쓰게 했다.
//   여기서 못 박는 것은 **붙지 않는다**는 것 하나다 — 그것이 회귀하면 화면이 다시 더러워진다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  WHOLE_PROMPT_SYSTEM, buildWholePromptMessages, rewriteWholePrompt,
} from "../lib/reel/whole-prompt.js";

const WHOLE = "A vertical shot of a small bakery at dawn, warm light across the counter.";

describe("전체 프롬프트를 다시 쓴다", () => {
  it("요청이 비어 있으면 **부르지 않는다** — 값을 치를 이유가 없다", async () => {
    let called = 0;
    const out = await rewriteWholePrompt(WHOLE, "   ", {
      callJsonImpl: async () => { called += 1; return { body: "x" }; },
    });
    expect(called).toBe(0);
    expect(out).toBe(WHOLE);
  });

  it("요청과 원문을 같이 넘긴다 — 요청이 뒤에 온다", () => {
    const [msg] = buildWholePromptMessages(WHOLE, "마지막을 천천히 끝내 줘");
    expect(msg.content).toContain(WHOLE);
    expect(msg.content).toContain("마지막을 천천히 끝내 줘");
    expect(msg.content.indexOf("마지막을")).toBeGreaterThan(msg.content.indexOf(WHOLE));
  });

  it("★ 돌려받은 한 벌로 **대체한다** — 원문 뒤에 붙지 않는다", async () => {
    const rewritten = "A vertical shot of a small bakery at dawn, ending on a slow hold.";
    const out = await rewriteWholePrompt(WHOLE, "마지막을 천천히 끝내 줘", {
      callJsonImpl: async () => ({ body: rewritten }),
    });
    expect(out).toBe(rewritten);
    expect(out).not.toContain(WHOLE);
    expect(out).not.toContain("마지막을 천천히");
  });

  it("빈 본문으로 덮지 않는다 — 꼬리만 남은 지문으로 굽는 것을 막는다", async () => {
    await expect(
      rewriteWholePrompt(WHOLE, "고쳐 줘", { callJsonImpl: async () => ({ body: "  " }) })
    ).rejects.toThrow();
  });

  it("스키마와 가짜 응답을 **자기 것으로** 넘긴다 — 안 넘기면 광고 시나리오가 온다", async () => {
    let seen = null;
    await rewriteWholePrompt(WHOLE, "고쳐 줘", {
      callJsonImpl: async (o) => { seen = o; return { body: "ok" }; },
    });
    expect(seen.schema.properties.body).toBeTruthy();
    expect(seen.fake().body).toBe(WHOLE);
    expect(seen.system).toBe(WHOLE_PROMPT_SYSTEM);
  });

  it("지시문은 **본문만** 돌려 달라고 말한다", () => {
    expect(WHOLE_PROMPT_SYSTEM).toContain("본문만");
    expect(WHOLE_PROMPT_SYSTEM).toContain("언어를 바꾸지 마라");
  });
});

describe("붙이던 자리가 남아 있지 않다", () => {
  // ★ 화면 둘이 같은 짓을 했다 — ④프롬프트의 applyNote 와 ⑤영상의 startClips.
  //   한 곳만 고치면 다른 쪽에서 그대로 붙는다.
  const files = [
    "app/reel/[id]/prompts/page.js",
    "app/reel/[id]/video/page.js",
  ];
  for (const f of files) {
    it(`${f} 가 적은 말을 프롬프트 끝에 잇지 않는다`, () => {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      // ★ 정규식이 아니라 **글자 그대로** 찾는다 — 붙이던 코드가 이 모양이었다.
      expect(src).not.toContain("[whole, ask]");
      expect(src).not.toContain("[wholePrompt, ask]");
    });
  }
});
