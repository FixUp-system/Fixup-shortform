// 수정사항을 적는 자리가 **먼저**이고, 실제로 보내는 지시는 그 아래 곁길이다 — 두 화면 모두.
//
// 사장님 지시가 하루에 두 번 왔고, **두 번째가 첫 번째를 뒤집었다.**
//  ① "수정사항 폼을 추가해줘. 이 컷에 실제로 보내는 지시 보기 아래에" → 폼을 접힌 칸 밑으로
//  ② "실제로 보내는 지시보기 부분을 수정 텍스트 아래에 배치" → 지금 자리(폼이 먼저)
//
// 뒤집힌 이유가 이 자리의 교훈이다: 화면을 **실물로 보면** 무엇이 주경로인지가 달라 보인다.
// 사장님이 먼저 만나야 하는 것은 **고치고 싶은 말을 적는 칸**이고, 프롬프트는 궁금할 때만
// 펼치는 곁길이다. 배치를 글로 정하면 첫 번째가 맞아 보이고, 눈으로 보면 두 번째가 맞다.
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

describe("수정사항 입력 — 두 화면 모두, 접힌 칸보다 위에", () => {
  for (const [step, src, hint] of PAGES) {
    it(`★ ${step} — 고치고 싶은 점을 적는 칸이 있다`, () => {
      expect(src, "수정사항을 적을 자리가 없다").toMatch(new RegExp(hint));
      // 적은 글이 실제로 재생성에 실려야 한다 — 칸만 있고 안 보내면 "적을 수 있는 척"이다
      expect(src, "적은 글을 다시 만들기에 안 싣는다").toMatch(/onRegen\([^)]*instr|regen\([^)]*instr/);
    });

    // ★★ 자리가 **뒤집혔다**(2026-08-18 사장님 지시, 같은 날 두 번째 판):
    //    "이 그림에 실제로 보내는 지시보기 부분을 수정 텍스트 아래에 배치."
    //    앞선 판에서는 폼을 접힌 칸 아래에 뒀는데(지금 무엇을 보내는지 먼저 보라는 뜻),
    //    실물을 보니 사장님이 먼저 만나는 것은 **고치고 싶은 말을 적는 칸**이어야 했다 —
    //    프롬프트는 궁금할 때만 펼치는 곁길이다.
    it(`★ ${step} — 접힌 칸이 수정사항 칸 **아래**에 있다`, () => {
      const fold = src.indexOf("<details");
      const form = src.indexOf(hint);
      expect(fold, "접힌 칸을 못 찾았다").toBeGreaterThan(-1);
      expect(form, "수정사항 칸을 못 찾았다").toBeGreaterThan(-1);
      expect(fold, "접힌 칸이 수정사항 칸보다 위에 있다 — 곁길이 주경로 앞을 막는다")
        .toBeGreaterThan(form);
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
