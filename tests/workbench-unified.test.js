// ④이미지와 ⑤영상은 **같은 작업대**다.
//
// 사장님 지시(2026-08-18): "영상 만들기와 이미지 만들기 부분 ui를 통일하고 깔끔하게 배치해줘.
// 실제로 보내는 지시 보기 위치나 배치도 적절하게."
//
// 두 화면은 같은 일을 한다 — 컷을 고르고, 결과를 보고, 고치고, 필요하면 지시문을 들여다본다.
// 그런데 따로 자라며 어긋났다: 한쪽은 우측이 카드이고 한쪽은 맨 바닥, 라벨이 다르고,
// **⑤영상은 재생성 버튼이 좌·우 두 자리에 있었다**(같은 일을 하는 버튼이 둘이면 어디를
// 눌러야 하는지 갈린다).
//
// 통일 규칙 하나: **좌측은 고르는 곳, 우측은 하는 곳.** 그리고 우측은 언제나 같은 세 단이다 —
// ① 결과 → ② 고치기 → ③ 들여다보기. 이 차례가 곧 사장님이 하는 일의 차례다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const images = read("app/create/[id]/images/page.js");
const video = read("app/create/[id]/video/page.js");
const css = read("app/globals.css");
const PAGES = [["④이미지", images], ["⑤영상", video]];

describe("두 화면은 같은 작업대를 쓴다", () => {
  it("★ 우측 패널이 같은 그릇이다 — 한쪽만 카드이면 두 화면이 다른 제품처럼 보인다", () => {
    for (const [step, src] of PAGES) {
      expect(src, `${step} 의 우측 패널이 panel 카드가 아니다`)
        .toMatch(/className="panel preview-pane"/);
    }
  });

  it("★ 접힌 칸 이름이 같다 — 같은 것을 두 이름으로 부르지 않는다", () => {
    for (const [step, src] of PAGES) {
      expect(src, `${step} 의 접힌 칸 이름이 다르다`).toMatch(/<summary>실제로 보내는 지시<\/summary>/);
    }
  });

  // ★ 조작은 **우측 한 자리**다. 좌측 카드는 고르는 곳이라 누르면 그 컷이 열리기만 한다.
  it("★ ⑤영상 — 좌측 컷 카드에 재생성 버튼이 없다", () => {
    const list = video.slice(video.indexOf('className="images-col"'), video.indexOf('className="preview-pane"'));
    expect(list, "좌측 목록을 못 찾았다").toBeTruthy();
    expect(list, "좌측 카드에 재생성 버튼이 남아 있다 — 같은 일을 하는 버튼이 두 자리다")
      .not.toMatch(/onClick=\{\(\) => regen\(/);
  });

  // ★ 세 단의 차례가 두 화면에서 같아야 한다: 미리보기 → 고치기 → 지시문.
  for (const [step, src, hint] of [["④이미지", images, "이 이미지에서"], ["⑤영상", video, "이 영상에서"]]) {
    it(`★ ${step} — 결과 → 고치기 → 들여다보기 차례다`, () => {
      const frame = src.indexOf('className="preview-frame"');
      const form = src.indexOf(hint);
      const fold = src.indexOf("<details");
      expect(frame, "미리보기를 못 찾았다").toBeGreaterThan(-1);
      expect(form, "고치는 칸을 못 찾았다").toBeGreaterThan(frame);
      expect(fold, "지시문 칸이 고치는 칸보다 위다").toBeGreaterThan(form);
    });
  }

  it("★ 단 사이를 같은 규칙으로 가른다", () => {
    expect(css, "작업대 단 구분 규칙이 없다").toMatch(/\.workbench-step/);
  });
});
