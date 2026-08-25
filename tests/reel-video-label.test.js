// ⑤영상 — 버튼 이름은 **하는 일**을 말한다(2026-08-25 사장님 지시).
//
// ★ "굽기"는 우리끼리 쓰는 말이다(코드·주석에서는 그대로 쓴다 — 그쪽은 뜻이 정확하다).
//   화면은 사장님 말로 적는다: 이 버튼을 누르면 **영상이 만들어진다**.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const page = readFileSync("app/reel/[id]/video/page.js", "utf8");
// 주석은 뺀다 — 화면에 뜨는 글자만 잰다(코드 주석의 "굽기"는 그대로 둔다).
const clean = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("버튼이 하는 일을 말한다", () => {
  it("굽기라는 말이 화면에 없다", () => {
    const shown = [...clean.matchAll(/"([^"]*굽기[^"]*)"/g)].map((m) => m[1]);
    expect(shown, `화면 문구에 굽기가 남아 있다: ${shown.join(" · ")}`).toEqual([]);
  });

  it("영상 만들기라고 적는다", () => {
    expect(clean).toContain("영상 만들기");
  });

  // ★ 이미 만든 뒤에는 다른 말이어야 한다 — 같은 말이면 무엇이 달라지는지 모른다.
  it("이미 만든 뒤에는 다시 만든다고 말한다", () => {
    expect(clean).toContain("다시 만들기");
  });
});
