// **돌고 있다는 것이 보여야 한다** — 네 화면이 같은 규칙을 쓴다 (2026-08-25 사장님 지적).
//
// ★★ 사장님이 이 회차에 세 번 겪었다:
//   · ②시나리오 — [이대로 고치기]를 눌렀는데 화면이 그대로라 "프로덕션에 반영이 안 되는
//     것 같다"고 했다. **정상적으로 돌았고 컷도 바뀌어 있었다**(재시도 1→3회, 컷 5→6개).
//   · ③이미지 — "로딩 마크가 안 떠서 사용자가 인지하기가 어려울 것 같아"
//   · ⑥완성 — "이대로 완성하기 누르면 지금 진행되고 있는지 잘 모르겠어"
//   ⑤영상만 같은 날 고쳐져 있었다. 나머지 셋이 그 규칙을 안 따랐다.
//
// ★ 규칙은 둘이다:
//   ① 도는 표시(`.spinner`)가 문구와 **함께** 뜬다 — 글자만 있으면 멎은 것과 구별이 안 된다
//   ② **버튼을 감추지 않는다.** 자리가 비면 눌렸는지조차 알 수 없다 — 그 자리에
//      "…중" 을 남긴다(②시나리오가 `busy ? null` 로 통째로 감추던 것이 그 사고다)
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const read = (p) => strip(readFileSync(p, "utf8"));

const SCREENS = [
  ["②시나리오", "app/reel/[id]/scenario/page.js"],
  ["③이미지", "app/reel/[id]/images/page.js"],
  ["⑤영상", "app/reel/[id]/video/page.js"],
  ["⑥완성", "app/reel/[id]/done/page.js"],
];

describe("돌고 있으면 도는 표시가 뜬다", () => {
  for (const [label, path] of SCREENS) {
    it(`${label} 가 .spinner 를 쓴다`, () => {
      expect(read(path), `${label} 에 도는 표시가 없다`).toContain('className="spinner"');
    });
  }

  it("CSS 에 그 표시가 있다 — 클래스만 적고 스타일이 없으면 아무것도 안 돈다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/^\.spinner \{/m);
  });
});

// ★★ 2026-08-27 — ②시나리오만 규칙이 **한 칸 옮겨졌다**(사장님 지시).
//   08-25 에는 버튼 자리에 "쓰는 중…"을 남기게 했는데, 그러면 도는 표시가 **두 곳**에
//   생겼다 — 시나리오 자리와 [이전으로] 옆이다. 사장님: "이전으로 옆에는 표시될 필요가
//   없다 · 다시 쓸 때는 원래 시나리오 자리에 '시나리오를 다시 쓰고 있어요'만 보이면 된다."
//   ★ 지켜야 하는 것은 여전히 규칙 ①이다: **쓰는 동안 아무 표시도 없어서는 안 된다.**
//     그 사고(사장님이 "반영이 안 되는 것 같다"고 한 것)의 원인은 침묵이었지 자리가 아니다.
//     지금은 말하는 자리가 시나리오 칸 하나로 모였다.
describe("②시나리오 — 쓰는 동안 말하는 자리는 하나다", () => {
  const src = read("app/reel/[id]/scenario/page.js");

  it("★★ 쓰는 동안 도는 표시와 문구가 시나리오 자리에 뜬다 — 침묵이 원래의 사고였다", () => {
    const at = src.indexOf("busy ? (");
    expect(at, "busy 로 가르는 자리가 없다").toBeGreaterThan(-1);
    const block = src.slice(at, at + 400);
    expect(block, "도는 표시가 없다").toContain('className="spinner"');
    expect(block).toMatch(/다시 쓰고 있어요/);
    expect(block).toMatch(/쓰고 있어요/);
  });

  it("★ 다시 쓰는 동안에는 옛 시나리오를 안 보여 준다 — 곧 사라질 글이다", () => {
    const at = src.indexOf("busy ? (");
    // 옛 글(script-src)은 busy 가 아닐 때만 그린다 — 그 갈래보다 **뒤**에 있어야 한다.
    expect(src.indexOf("script-src"), "옛 글이 busy 갈래보다 앞에 있다").toBeGreaterThan(at);
  });

  it("★ [이전으로] 옆에는 아무 표시도 없다 — 진행은 위에서 이미 말했다", () => {
    const at = src.indexOf("<ReelBack");
    expect(at).toBeGreaterThan(-1);
    const row = src.slice(at, at + 300);
    expect(row, "되돌아가는 버튼 옆에 도는 표시가 남아 있다").not.toMatch(/쓰는 중|spinner/);
  });
});

describe("⑥완성 — 누른 직후의 빈 구간이 없다", () => {
  const src = read("app/reel/[id]/done/page.js");

  // ★★ 누른 직후에는 busy 만 참이다. reel.status 가 "rendering" 이 되고 폴링이 그것을
  //   읽어 오기 전까지는 rendering 이 아직 거짓이라, 문구가 rendering 만 보면 그 사이
  //   **아무 표시도 없다.** 버튼만 잠겨 있어 눌렸는지 알 수 없다.
  it("★ 진행 문구가 busy 도 함께 본다", () => {
    const at = src.indexOf("이어 붙이는 중");
    expect(at, "진행 문구를 못 찾겠다").toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, at - 200), at), "rendering 만 본다").toMatch(/busy/);
  });
});

describe("③이미지 — 그리는 동안 그림 자리에도 표시가 있다", () => {
  const src = read("app/reel/[id]/images/page.js");

  // ⑤영상이 같은 날 쓴 처방 — 덮개(.frame-busy)는 그림을 지우지 않고 그 위에서 돈다.
  it("★ 덮개를 쓴다 — 옛 그림을 지우지 않는다", () => {
    expect(src).toContain("frame-busy");
  });
});
