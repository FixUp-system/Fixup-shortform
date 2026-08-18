// 수정사항을 적는 자리는 **접힌 칸 아래**에, 그리고 **두 화면 모두**에 있다.
//
// 사장님 지시(2026-08-18): "영상 이미지 모두 수정사항을 입력할 수 있는 폼을 추가해줘.
// 이 컷에 실제로 보내는 지시 보기 아래에."
//
// 왜 아래인가: 사장님이 무엇을 고칠지 정하려면 **지금 무엇을 보내고 있는지**를 먼저 본다.
// 폼이 위에 있으면 프롬프트를 펼치기도 전에 빈 칸부터 마주친다 — ④이미지가 그 모양이었다.
//
// ⑤영상에는 그 칸이 **아예 없었다.** [다시 만들기]만 있어서, 무엇이 마음에 안 드는지 말할
// 길이 없었다 — 같은 프롬프트로 한 번 더 사는 것이 전부였다(컷당 8크레딧).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const PAGES = [
  ["④이미지", read("app/create/[id]/images/page.js"), "이 이미지에서"],
  ["⑤영상", read("app/create/[id]/video/page.js"), "이 영상에서"],
];

describe("수정사항 입력 — 두 화면 모두, 접힌 칸 아래에", () => {
  for (const [step, src, hint] of PAGES) {
    it(`★ ${step} — 고치고 싶은 점을 적는 칸이 있다`, () => {
      expect(src, "수정사항을 적을 자리가 없다").toMatch(new RegExp(hint));
      // 적은 글이 실제로 재생성에 실려야 한다 — 칸만 있고 안 보내면 "적을 수 있는 척"이다
      expect(src, "적은 글을 다시 만들기에 안 싣는다").toMatch(/onRegen\([^)]*instr|regen\([^)]*instr/);
    });

    it(`★ ${step} — 그 칸이 접힌 칸(실제로 보내는 지시) **아래**에 있다`, () => {
      const fold = src.indexOf("<details");
      const foldEnd = src.indexOf("</details>", fold);
      const form = src.indexOf(hint);
      expect(fold, "접힌 칸을 못 찾았다").toBeGreaterThan(-1);
      expect(form, "수정사항 칸을 못 찾았다").toBeGreaterThan(-1);
      expect(form, "수정사항 칸이 접힌 칸보다 위에 있다 — 지금 보내는 글을 보기 전에 빈 칸부터 만난다")
        .toBeGreaterThan(foldEnd);
    });
  }

  // ★ ⑤영상은 지시를 서버까지 실어 보내야 한다(④는 이미 그렇게 한다).
  it("★ ⑤영상 — 적은 지시를 재생성 요청에 싣는다", () => {
    const [, video] = PAGES[1];
    const fn = video.match(/async function regen\([\s\S]*?\n  \}/)?.[0] || "";
    expect(fn, "regen 을 못 찾았다").toBeTruthy();
    expect(fn, "지시를 인자로 안 받는다").toMatch(/async function regen\(\s*idx\s*,\s*\w+/);
    expect(fn, "요청 본문에 지시를 안 싣는다").toMatch(/instruction/);
  });
});
