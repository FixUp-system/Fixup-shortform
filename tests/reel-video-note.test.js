// ⑤영상 — **수정 요청 폼**과 **선 없애기**(2026-08-25 사장님 지시).
//
// ★ 앞의 셋(②시나리오·③이미지·④프롬프트)과 같은 모양이다: 결과를 보여 주고
//   아래에서 한국어로 고쳐 달라고 적는다.
// ★ 영상은 값이 크다 — 요청을 적어 [다시 만들기]를 눌러야 나간다(자동으로 안 나간다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const page = readFileSync("app/reel/[id]/video/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const clean = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("영상과 버튼 사이 선이 없다", () => {
  // ★ .step-actions 의 border-top 은 다른 화면도 쓴다 — 여기만 끄는 갈래가 필요하다.
  it("선 없는 갈래가 CSS 에 있다", () => {
    expect(css).toMatch(/step-actions--bare|\.no-rule/);
  });

  it("만들기 줄이 그 갈래를 쓴다", () => {
    // ★ 만들기 버튼을 감싸는 줄을 찾는다 — 사이에 수정 폼이 들어와 거리가 멀다.
    const at = clean.lastIndexOf("startClips");
    const before = clean.slice(0, at);
    const lastActions = before.lastIndexOf("step-actions");
    expect(before.slice(lastActions, lastActions + 40), "만들기 버튼 줄이 선 없는 갈래를 안 쓴다").toContain("step-actions--bare");
  });
});

describe("수정 요청 폼", () => {
  it("여러 줄로 적을 수 있다", () => {
    expect(clean).toContain("textarea");
    expect(clean).toContain("note-form");
  });

  // ★★ 영상이 있을 때만 보인다 — 만들기 전에는 고칠 것이 없다.
  it("만든 뒤에만 보인다", () => {
    const at = clean.indexOf("<textarea");
    expect(at).toBeGreaterThan(-1);
    expect(clean.slice(Math.max(0, at - 300), at)).toMatch(/doneCount|hasVideo|videoUrl/);
  });

  // ★★ 값이 나가므로 **자동으로 안 보낸다** — 적고 버튼을 눌러야 나간다.
  it("요청은 다시 만들기 버튼으로 나간다", () => {
    expect(clean).toMatch(/note[\s\S]{0,200}startClips|startClips[\s\S]{0,400}note/);
  });
});
