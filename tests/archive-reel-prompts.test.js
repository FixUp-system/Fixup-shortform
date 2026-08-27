// 보관함 상세가 **만들어진 방식대로** 말한다 (2026-08-27 사장님 지시).
//
// 겪은 일 — reel 상세에 "장면 4개 — 컷별 지시"가 떠서 컷마다 문장·화면·움직임을 보여 줬다.
// 그런데 이 흐름은 이제 **스토리보드 한 장**을 그리고 그 한 장을 통째로 넘겨 굽는다.
// 컷별 표는 **컷마다 따로 굽던 시절**의 것이라, 그대로 두면 이 화면이 "이 영상이 어떻게
// 만들어졌는가"를 잘못 말한다. 사장님 말: "이미지 생성 프롬프트와 영상 프롬프트로 변경해줘".
//
// ★ 광고(ad)·단계별은 그대로다 — 그 둘은 여전히 장면·컷 단위로 만든다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync("app/archive/[id]/page.js", "utf8");
const clean = src
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("reel 은 프롬프트 둘을 보여 준다", () => {
  it("이미지 생성 프롬프트 — 한 장을 그린 글", () => {
    expect(clean).toContain("이미지 생성 프롬프트");
    // 각인은 칸마다 같은 값이다 — 첫 값 하나를 판다.
    expect(clean).toMatch(/c\.image\?\.of/);
  });

  it("영상 프롬프트 — 굽기에 넘긴 글", () => {
    expect(clean).toContain("영상 프롬프트");
  });

  it("★ 고친 프롬프트가 보인다 — 시나리오 원문을 그냥 쓰면 고쳐도 옛 글이 뜬다", () => {
    expect(clean, "reelWholePrompt 를 안 쓴다").toContain("reelWholePrompt");
  });

  it("★ 갈래 판정은 lib 하나다 — 화면이 초를 다시 세면 제작 화면과 갈린다", () => {
    expect(clean).toContain("planReelBake");
  });
});

describe("컷별 지시 표는 reel 에서 사라졌다", () => {
  it("reel 이면 안 그린다", () => {
    const at = clean.indexOf("컷별 지시");
    expect(at, "컷별 지시 표를 못 찾았다").toBeGreaterThan(-1);
    // 그리는 조건에 !isReel 이 있어야 한다.
    const cond = clean.slice(Math.max(0, at - 400), at);
    expect(cond, "reel 을 안 가른다").toContain("!isReel");
  });

  it("광고·단계별은 그대로 본다 — 그 둘은 여전히 장면·컷 단위다", () => {
    const at = clean.indexOf("컷별 지시");
    const cond = clean.slice(Math.max(0, at - 400), at + 200);
    expect(cond).toContain("isAd ? doc.scenario");
  });
});
