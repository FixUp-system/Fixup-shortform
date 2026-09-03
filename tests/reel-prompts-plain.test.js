// ④영상 프롬프트 — **설명을 걷어낸다**(2026-08-25 사장님 지시).
//
// ★ 사장님 말: "밑에 부연설명 넣지마 … 위에도 영상 만들기 전이니까요 있는 문장 전부 제외하고
//   스토리보드라고 되어 있는 타이틀도 제외해줘"
// ★★ 화면이 스스로를 설명하지 않는다 — 그림과 입력 칸이 보이면 무엇을 하는 자리인지 안다.
//   "이 한 장을 통째로 넘겨 …" 같은 문장은 **구조를 설명하는 말**이지 사장님이 할 일이 아니다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const page = readFileSync("app/reel/[id]/prompts/page.js", "utf8");
// 주석은 남긴다 — 왜 그렇게 했는지는 코드에 남아야 한다. 화면에 뜨는 글자만 잰다.
const clean = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("화면이 스스로를 설명하지 않는다", () => {
  it("한 장을 통째로 넘긴다는 설명이 없다", () => {
    expect(clean).not.toContain("통째로 넘겨");
    expect(clean).not.toContain("한 편으로 만들어요");
    expect(clean).not.toContain("컷마다 따로 굽지 않아요");
  });

  it("준비됐다는 안내가 없다", () => {
    expect(clean).not.toContain("준비됐어요");
  });

  it("값이 안 든다는 안내가 없다", () => {
    expect(clean).not.toContain("여기서 고치는 것은 무료");
    expect(clean).not.toContain("칸 밖을 누르면");
  });

  it("스토리보드라는 제목이 없다", () => {
    expect(clean).not.toMatch(/<h3>스토리보드<\/h3>/);
  });
});

// ★ 칸은 이제 `<AutoTextarea>` 다(components/AutoTextarea.jsx — 스스로 자란다).
//   raw `<textarea>` 도 함께 인정한다 — 이 판이 재는 것은 **그 자리에 여러 줄 칸이
//   있는가**이지 태그 이름이 아니다.
describe("남길 것은 남는다", () => {
  // ★ 그림·입력 칸·버튼은 그대로다 — 걷어내는 것은 **설명**이지 기능이 아니다.
  it("스토리보드 그림과 프롬프트 칸은 그대로다", () => {
    expect(clean).toContain("sheet-view");
    expect(clean).toMatch(/<(?:Auto)?[Tt]extarea/);
  });

  // ★ 아직 못 하는 상태를 알리는 말은 남는다 — 그건 설명이 아니라 **막힌 이유**다.
  it("먼저 해야 할 일이 있으면 말해 준다", () => {
    expect(clean).toContain("먼저 만들어 주세요");
  });
});
