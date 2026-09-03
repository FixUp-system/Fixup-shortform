// **여러 줄 입력칸은 글 길이만큼 자란다** (2026-09-03 사장님 지시).
//
// ★★★ 뿌리 — 공용 규칙 `textarea.field` 가 `overflow-y: hidden` 을 건다. 그것은 칸이
//   **자라는 것을 전제한** 설정인데, 단계별(app/reel/new)에는 자라게 하는 코드가 아예
//   없었다. 그래서 132px(min-height)를 넘긴 글이 **스크롤바도 없이 잘렸고**, 사장님은
//   "방향키로는 올라가는데 드래그가 전체를 잡은 건지 보이는 데까지만 잡은 건지 모르겠다"
//   고 했다. 안 보이는 글이 있는데 그것을 알려 주는 표시가 하나도 없었던 것이다.
//
// ★ 그래서 이 판은 **셋을 함께** 잰다 — 하나만 빠져도 증상이 돌아온다:
//   ① 자라는 규칙이 훅 하나다(화면마다 복사하면 새 화면이 또 빠진다)
//   ② 그 훅을 세 화면이 **실제로 부른다** · textarea 가 ref 를 물고 있다
//   ③ 선택 하이라이트가 눈에 보인다(잘리지 않게 한 뒤에도 범위는 보여야 한다)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 소스 판 규율(OUTSTANDING §7-10): 줄 주석을 먼저 걷고 블록 주석을 걷는다.
const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const src = (p) => strip(readFileSync(p, "utf8"));

// 여러 줄 입력칸을 든 화면 셋. 새 화면이 늘면 여기 함께 적는다.
const SCREENS = [
  "app/create/page.js",
  "app/ads/new/page.js",
  "app/reel/new/page.js",
];

describe("자라는 규칙은 훅 하나다", () => {
  it("★★ 훅이 있고, height 를 auto 로 되돌린 뒤 잰다 — 안 그러면 지워도 안 줄어든다", () => {
    const s = src("components/useAutoGrow.js");
    expect(s).toMatch(/export function useAutoGrow/);
    expect(s).toMatch(/style\.height\s*=\s*"auto"/);
    expect(s).toMatch(/scrollHeight/);
  });

  it("★★★ 화면이 그 계산을 손으로 다시 적지 않는다 — 베끼면 새 화면이 또 빠진다", () => {
    for (const p of SCREENS) {
      expect(src(p), `${p} 가 scrollHeight 를 직접 만진다`).not.toMatch(/scrollHeight/);
    }
  });
});

describe("세 화면이 실제로 자란다", () => {
  for (const p of SCREENS) {
    it(`★★★ ${p} — 훅을 부르고 textarea 가 ref 를 문다`, () => {
      const s = src(p);
      expect(s, "훅을 안 부른다").toMatch(/useAutoGrow\(\s*textRef\s*,/);
      expect(s, "ref 가 textarea 에 안 붙어 있으면 훅이 잴 대상이 없다")
        .toMatch(/<textarea[\s\S]{0,200}?ref=\{textRef\}/);
    });
  }
});

describe("선택 범위가 눈에 보인다", () => {
  const css = readFileSync("app/globals.css", "utf8");

  it("★★ ::selection 바탕색 규칙이 있다", () => {
    expect(css).toMatch(/::selection\s*\{[^}]*background:\s*var\(--sel\)/);
  });

  it("★★ --sel 이 **두 테마 모두** 정의돼 있다 — 한쪽만 있으면 다른 테마에서 안 보인다", () => {
    const hits = css.match(/--sel:\s*[^;]+;/g) || [];
    expect(hits.length, `--sel 정의가 ${hits.length}개다`).toBeGreaterThanOrEqual(2);
  });
});
