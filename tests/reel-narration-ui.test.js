// ②시나리오 화면이 **내레이션 한 벌**을 보여 준다.
//
// ★ 이 저장소의 화면 계약은 소스 문자열로 잰다(tests/*-ui.test.js) — 그 방식은 문법이
//   깨진 파일을 못 잡으므로, 화면을 손댔으면 **한 번 굽거나 라이브 200 으로 갈음**한다
//   (CLAUDE.md).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync("app/reel/[id]/scenario/page.js", "utf8");

describe("한 벌을 보여 준다", () => {
  it("판독은 lib/reel/narration.js 하나를 쓴다 — 화면이 필드를 손으로 읽지 않는다", () => {
    expect(src).toMatch(/from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/reel\/narration"/);
    expect(src).toMatch(/reelNarration/);
  });

  it("글자 수를 함께 적는다 — 게이트가 재는 값과 **같은 함수**로", () => {
    expect(src).toMatch(/narrationLimit/);
  });

  it("★옛 문서에는 그 자리가 아예 안 뜬다 — 빈 칸을 만들지 않는다", () => {
    // reelNarration 이 null 이면 블록이 통째로 안 그려지는 모양이어야 한다
    expect(src).toMatch(/narration\s*&&/);
  });

  it("한 벌은 **읽는 글**이다 — 여기서 직접 고치는 칸을 만들지 않는다", () => {
    // reel 의 수정 축은 "한국어로 적어 고쳐 달라"는 칸 하나다(이 화면의 설계).
    // 한 벌만 따로 편집 칸을 열면 지시문(text)과 갈려 그림까지 어긋난다.
    expect(src).not.toMatch(/onChange=\{\(e\) => edit\(\{ narration/);
  });
});
