// ③그림 — 값·횟수 문구를 걷어내고 그림을 **크게** 본다(2026-08-25 사장님 지시).
//
// ★★ .up 은 86×86 이다 — 그건 **사장님이 올린 사진**을 늘어놓는 칸이라 그 크기가 맞다.
//   만들어진 그림은 검토 대상이라 같은 칸을 쓰면 무엇이 그려졌는지 알아볼 수가 없다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const page = readFileSync("app/reel/[id]/images/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const clean = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("값·횟수 안내를 걷어낸다", () => {
  it("컷마다 한 장 · 정가 문구가 없다", () => {
    expect(clean).not.toContain("컷마다 한 장");
    expect(clean).not.toContain("영상 정가에 포함");
  });

  it("남은 횟수 안내가 없다", () => {
    expect(clean).not.toContain("다시 그릴 수 있는 횟수가");
    expect(clean).not.toContain("횟수를 다 썼어요");
    expect(clean).not.toContain("너무 많이 다시 그렸어요");
  });

  // ★★ 문구만 걷어낸다 — **상한 자체는 살아 있어야 한다.** canDraw 가 라우트와 같은 판정을
  //   보고 버튼을 잠근다. 판정까지 지우면 400 이 날 때까지 계속 누를 수 있고 그 사이 돈이 나간다.
  it("상한 판정은 그대로 살아 있다", () => {
    expect(clean).toContain("canDraw");
  });
});

describe("그림을 크게 본다", () => {
  it("86px 썸네일 칸(.up)을 쓰지 않는다", () => {
    expect(clean).not.toMatch(/className="up /);
  });

  it("큰 그림용 클래스를 쓰고 그 클래스가 CSS 에 있다", () => {
    const m = clean.match(/className="(cut-shots?[a-z- ]*)"/g);
    expect(m, "cut-shot 계열 클래스를 못 찾았다").toBeTruthy();
    for (const raw of m) {
      for (const cls of raw.replace(/className="|"/g, "").split(" ").filter(Boolean)) {
        expect(css, `CSS 에 .${cls} 가 없다`).toContain("." + cls);
      }
    }
  });

  // ★ 세로 영상이다 — 가로 비율로 보여 주면 잘린 것처럼 읽힌다.
  it("9:16 로 보여 준다", () => {
    const at = css.indexOf(".cut-shot");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 500)).toMatch(/aspect-ratio:\s*9\s*\/\s*16/);
  });
});
