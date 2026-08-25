// 버튼 자리 — **모든 화면에서 같다**(2026-08-25 사장님 지시: "페이지마다 위치가 전부 달라").
//
// 규칙 둘:
//   ① 되돌아가는 버튼은 이름이 늘 **"이전으로"**이고, **그 화면 맨 아래 왼쪽 끝**에 선다.
//   ② 프롬프트를 고치는 버튼은 **그 프롬프트 칸 안 오른쪽 아래**에 선다.
//
// ★★ 이름이 고정이라 앞 단계 이름을 빌리지 않는다 — 그래서 조사 계산(euroRo)이
//   화면에서 사라진다. 화면마다 이름이 달라 같은 버튼으로 안 읽힌 것이 원래 문제였다.
// ★★ 그리는 곳은 하나다(components/ReelBack.jsx) — 여섯 군데에 손으로 적으면
//   다음에 또 어긋난다. 지금이 바로 그렇게 어긋난 자리다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const BACK_PAGES = ["scenario", "images", "prompts", "video", "done"];
// ★ ⑤영상은 빠졌다 — 거기에는 수정 요청만 따로 저장하는 버튼이 없다.
//   적은 말은 [영상 만들기]를 누를 때 함께 반영된다(startClips 가 굽기 전에 PATCH).
//   그 버튼은 돈이 나가는 버튼이라 **그 줄에 혼자** 서야 한다(2026-08-25 사장님 지적).
const NOTE_PAGES = ["scenario", "images", "prompts"];
const read = (p) => readFileSync(`app/reel/[id]/${p}/page.js`, "utf8");

describe("이전으로 — 이름도 자리도 하나다", () => {
  for (const p of BACK_PAGES) {
    it(`${p}: 공용 조각으로만 그린다`, () => {
      const src = read(p);
      expect(src, `${p}: ReelBack 을 안 쓴다`).toContain("<ReelBack");
      expect(src, `${p}: 화면이 직접 앞 단계를 캔다`).not.toContain("reelPrevStep");
      expect(src, `${p}: 앞 단계 이름을 빌려 쓴다`).not.toContain("euroRo");
    });

    it(`${p}: 딱 한 번만 그린다`, () => {
      expect(read(p).split("<ReelBack").length - 1, `${p}: 여러 번 그린다`).toBe(1);
    });

    it(`${p}: 맨 아래에 있다 — 프롬프트 칸보다 뒤다`, () => {
      const src = read(p);
      const back = src.indexOf("<ReelBack");
      const note = src.lastIndexOf('className="note-form"');
      if (note > -1) expect(back, `${p}: 이전이 프롬프트 칸보다 위에 있다`).toBeGreaterThan(note);
    });

    it(`${p}: 왼쪽 끝이다 — 오른쪽 줄(.fwd)보다 앞이다`, () => {
      const src = read(p);
      const back = src.indexOf("<ReelBack");
      const fwd = src.lastIndexOf('className="fwd"');
      if (fwd > -1) expect(back, `${p}: 이전이 다음보다 뒤에 있다`).toBeLessThan(fwd);
    });
  }
});

describe("프롬프트 고치는 버튼 — 그 칸 안 오른쪽 아래다", () => {
  for (const p of NOTE_PAGES) {
    it(`${p}: note-act 로 감싼다`, () => {
      const src = read(p);
      const note = src.indexOf('className="note-form"');
      const act = src.indexOf('className="note-act"');
      expect(note, `${p}: 프롬프트 칸이 없다`).toBeGreaterThan(-1);
      expect(act, `${p}: 고치는 버튼이 칸 밖에 있다`).toBeGreaterThan(note);
    });
  }

  it("오른쪽으로 민다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const at = css.indexOf(".note-act {");
    expect(at, ".note-act 규칙이 없다").toBeGreaterThan(-1);
    expect(css.slice(at, at + 200)).toMatch(/justify-content:\s*flex-end/);
  });
});
