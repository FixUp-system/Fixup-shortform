// 버튼 옆 설명 — **값과 구조를 설명하지 않는다**(2026-08-25 사장님 지시).
//
// ★ 기준은 ④에서 세운 것과 같다: **막힌 이유는 남기고**(왜 다음으로 못 가는지는 말해야 한다),
//   값이 얼마 나가는지·안쪽이 어떻게 도는지는 뺀다.
// ★ "만드는 중에는 다시 누를 수 없어요" 도 뺀다 — 버튼이 이미 잠겨 있어 눌러도 안 된다.
//   보이는 상태를 글로 또 말하는 것은 설명이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const read = (p) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const video = read("app/reel/[id]/video/page.js");
const done = read("app/reel/[id]/done/page.js");

describe("값 이야기를 안 한다", () => {
  it("⑤에 크레딧 안내가 없다", () => {
    expect(video).not.toContain("크레딧이 나가요");
    expect(video).not.toContain("되돌릴 수 없어요");
  });

  it("⑥에 무료 안내가 없다", () => {
    expect(done).not.toContain("합성은 무료예요");
  });
});

describe("보이는 상태를 글로 또 말하지 않는다", () => {
  it("만드는 중에는 못 누른다는 말이 없다", () => {
    expect(video).not.toContain("다시 누를 수 없어요");
    expect(done).not.toContain("다시 누를 수 없어요");
  });
});

describe("막힌 이유는 남는다", () => {
  // ★ 이건 설명이 아니라 **다음으로 못 가는 사유**다 — 없으면 사장님이 왜 안 되는지 모른다.
  it("④는 먼저 할 일을 말해 준다", () => {
    expect(read("app/reel/[id]/prompts/page.js")).toContain("먼저 만들어 주세요");
  });
});
