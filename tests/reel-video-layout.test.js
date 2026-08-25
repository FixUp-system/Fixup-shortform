// ⑤영상 버튼 배치 — **이전은 완성하기와 같은 줄 왼쪽**(2026-08-25 사장님 지시).
//
// ★ 전에는 [← 이전]이 [영상 만들기]와 같은 줄이었다. 만드는 버튼과 되돌아가는 링크가
//   나란히 있으면 둘 다 "지금 할 일"처럼 읽힌다 — 만들기는 그 줄에 혼자 있어야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const page = readFileSync("app/reel/[id]/video/page.js", "utf8");
const clean = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("이전 링크가 완성하기 줄에 있다", () => {
  it("영상 만들기 버튼보다 뒤에 온다", () => {
    const make = clean.indexOf("startClips");
    const prev = clean.indexOf("<ReelBack");
    expect(make, "만들기 버튼을 못 찾았다").toBeGreaterThan(-1);
    expect(prev, "이전 링크를 못 찾았다").toBeGreaterThan(-1);
    expect(prev, "이전이 만들기와 같은 줄이거나 위에 있다").toBeGreaterThan(make);
  });

  it("완성으로 링크와 같은 블록에 있다", () => {
    const prev = clean.indexOf("<ReelBack");
    // ★ 상단의 `const doneStep = …` 선언이 아니라 **링크를 그리는 자리**를 찾는다.
    const doneLink = clean.indexOf("reelStepHref(doneStep");
    expect(doneLink).toBeGreaterThan(-1);
    // 같은 step-actions 안이면 사이에 </div> 로 끝나는 블록 경계가 하나뿐이다.
    const between = clean.slice(Math.min(prev, doneLink), Math.max(prev, doneLink));
    expect(between, "둘이 다른 블록에 있다").not.toContain('<div className="step-actions">');
  });
});
