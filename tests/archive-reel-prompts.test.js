// 보관함 상세가 **만들어진 방식대로** 말한다 (2026-08-27 사장님 지시).
//
// 겪은 일 — reel 상세에 "장면 4개 — 컷별 지시"가 떠서 컷마다 문장·화면·움직임을 보여 줬다.
// 그런데 이 흐름은 이제 **스토리보드 한 장**을 그리고 그 한 장을 통째로 넘겨 굽는다.
// 컷별 표는 **컷마다 따로 굽던 시절**의 것이라, 그대로 두면 이 화면이 "이 영상이 어떻게
// 만들어졌는가"를 잘못 말한다. 사장님 말: "이미지 생성 프롬프트와 영상 프롬프트로 변경해줘".
//
// ★★ 2026-09-14 — **뒤집힌 판이다.** 위 지시로 reel 에는 프롬프트 둘(이미지 생성 · 영상)을,
//   광고·단계별에는 컷별 지시 표를 보였는데, 사장님 지시(사용자에게 불필요한 정보 제거)로
//   **전부** 걷었다. 모델에게 넘긴 영어 지시문이라 손님이 읽을 글이 아니었다.
//   ★ 만드는 방식·각인·문서는 안 바뀌었다 — 바뀐 것은 이 화면이 보여 주는 것뿐이다.
//   그래서 이 판은 "다시 돌아오지 않는가"만 잰다(조용히 지우지 않고 그물로 남긴다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync("app/archive/[id]/page.js", "utf8");
const clean = src
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("보관함 상세에는 프롬프트가 없다 (2026-09-14)", () => {
  it("reel 의 이미지 생성 프롬프트를 그리지 않는다", () => {
    expect(clean, "이미지 생성 프롬프트 칸이 돌아왔다").not.toContain("이미지 생성 프롬프트");
    expect(clean).not.toMatch(/\{reelImagePrompt\}/);
  });

  it("reel 의 영상 프롬프트를 그리지 않는다 — 통짜도 컷별도", () => {
    expect(clean, "영상 프롬프트 칸이 돌아왔다").not.toContain("영상 프롬프트");
    expect(clean).not.toMatch(/\{reelWhole\}/);
    expect(clean).not.toMatch(/reelCutPrompts\.map\(/);
  });

  it("광고·단계별의 컷별 지시 표(역할·카메라·문장·화면·움직임)를 그리지 않는다", () => {
    expect(clean, "컷별 지시 표가 돌아왔다").not.toContain("컷별 지시");
    for (const label of ["역할", "카메라", "문장", "화면", "움직임"]) {
      expect(clean, `컷 지시 라벨("${label}")이 돌아왔다`).not.toMatch(new RegExp(`<b>${label}</b>`));
    }
  });
});
