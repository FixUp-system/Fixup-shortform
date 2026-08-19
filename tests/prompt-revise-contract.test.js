// 고쳐 쓰기가 **한 번도 성공한 적이 없었다** (2026-08-19 실측).
//
// 프로젝트 aec197c6 원장: "프롬프트 수정" 이 00:37:06 · 00:37:15 에 두 번 찍혔다(9초 간격
// — callJson 의 파싱 실패 재시도다). 그런데 컷에는 image_prompt 가 **없다**. 값은 나가고
// 결과는 버려졌다.
//
// 어긋난 자리: 지시는 "**지시문 한 덩어리만** 낸다. 설명·머리말·따옴표·목록을 붙이지 마라"
// 라고 **맨 글**을 요구하는데, 받는 쪽(lib/llm.js callJson)은 `JSON.parse(textOf(data))` 로
// **JSON** 을 기대한다. 맨 글은 JSON.parse 에서 반드시 던진다.
//
// ⚠️ 왜 아무도 몰랐나 — 가짜 모드가 `{ prompt: "…[수정됨]" }` 이라는 **객체**를 돌려준다.
//    테스트는 전부 가짜로 도니 늘 통과했고, 맨 글을 내는 것은 진짜 모델뿐이라 그 경로는
//    값이 들어 아무도 안 돌려 봤다. 그래서 이 파일은 **지시문 자체**를 잰다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildPromptReviseMessages } from "../lib/prompt-revise.js";

const msgs = buildPromptReviseMessages({ current: "A woman holds a bag.", instruction: "인형을 작게" });

describe("고쳐 쓰기 — 지시와 파싱이 같은 것을 말한다", () => {
  it("★ 받는 쪽이 JSON.parse 를 한다 (이 테스트의 전제)", () => {
    const llm = readFileSync("lib/llm.js", "utf8");
    expect(llm, "callJson 이 더는 JSON.parse 를 안 한다면 아래 단언의 근거가 바뀐다")
      .toMatch(/JSON\.parse\(textOf\(data\)\)/);
  });

  it("★ 그러므로 지시는 JSON 으로 답하라고 말해야 한다", () => {
    expect(msgs.system, "맨 글을 요구하면 JSON.parse 가 반드시 던진다 — 값만 나가고 결과는 버려진다")
      .toMatch(/JSON/);
  });

  it("★ 받는 쪽이 읽는 칸 이름(prompt)을 지시가 알려 준다", () => {
    // lib/pipeline.js 는 out?.prompt 만 읽는다. 칸 이름이 안 맞으면 조용히 null 이 된다.
    expect(msgs.system, "칸 이름을 안 알려 주면 모델이 제 마음대로 짓는다").toMatch(/"prompt"/);
  });

  it("★ 머리말 금지는 그대로 남는다 — 그 글자가 그림 프롬프트가 된다", () => {
    expect(msgs.system).toMatch(/머리말|설명/);
  });

  it("★ 실패는 조용하지만 흔적은 남아야 한다 — 부르는 쪽이 로그를 남긴다", () => {
    const pipe = readFileSync("lib/pipeline.js", "utf8");
    expect(pipe, "실패를 아무 데도 안 남기면 다음 사람도 값만 태우고 모른다")
      .toMatch(/고쳐 쓰기 실패/);
  });
});
