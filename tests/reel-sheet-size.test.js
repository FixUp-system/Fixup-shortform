// 스토리보드 화면 — **크기 상한**과 **가짜 모드의 실물 표본**(2026-08-25 사장님 지적).
//
// ★ 상한이 없으면 2×2(9:16 세로) 한 장이 화면을 넘긴다 — 폭 100% 뿐이라 세로가 그대로 늘어난다.
// ★ 가짜 모드의 플레이스홀더는 비율이 달라(640×360 등) 실제로 어떻게 보이는지 알 수 없다.
//   오늘 실제로 만든 스토리보드를 표본으로 두면 0원으로 진짜 화면을 본다.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";

const css = readFileSync("app/globals.css", "utf8");

describe("크기에 상한이 있다", () => {
  it("세로가 화면을 넘지 않는다", () => {
    const at = css.indexOf(".sheet-view");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 500)).toMatch(/max-height/);
  });

  // ★ 상한에 걸려 줄어들 때 가로가 남으므로 가운데로 모은다.
  // ★ 2026-08-25 — 잘라 보는 길이(500자)를 쓰지 않는다. 규칙에 주석이 붙자 그 창을
  //   벗어나 **멀쩡한 CSS 가 실패로 나왔다.** 규칙 블록 끝까지를 본다.
  it("가운데로 모인다", () => {
    const at = css.indexOf(".sheet-view {");
    expect(at, ".sheet-view 규칙을 못 찾겠다").toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf("}", at) + 1);
    expect(block).toMatch(/margin[^;]*auto|justify-content|align-items/);
  });
});

describe("가짜 모드가 실물 표본을 쓴다", () => {
  it("표본 파일이 있다", () => {
    expect(existsSync("public/samples/storyboard-2x2.jpg")).toBe(true);
    expect(existsSync("public/samples/storyboard-3x3.jpg")).toBe(true);
  });

  // ★★ 격자로 그리는 호출(imageSize 를 받는 것)일 때만 표본을 준다 —
  //   컷별 그림까지 스토리보드로 주면 화면이 거짓말을 한다.
  it("격자 호출에만 표본을 준다", () => {
    const src = readFileSync("lib/imagegen.js", "utf8");
    expect(src).toContain("samples/storyboard");
    const at = src.indexOf("samples/storyboard");
    expect(src.slice(Math.max(0, at - 400), at)).toMatch(/imageSize/);
  });
});

describe("표본을 자를 수 있다", () => {
  // ★★ 표본 주소는 `/samples/…` 상대 경로다 — 서버에서 fetch 하면 **절대 URL 이
  //   아니라서 죽는다.** 그러면 가짜 모드에서 자르기 단계가 통째로 깨진다 —
  //   0원으로 배선 전체를 돌려 보는 것이 이 저장소의 유일한 공짜 검증인데 그것을 잃는다.
  it("상대 경로 표본을 바이트로 읽는다", async () => {
    const { fetchImageBytes } = await import("../lib/reel/storyboard.js");
    const bytes = await fetchImageBytes("/samples/storyboard-2x2.jpg");
    expect(bytes.length, "바이트가 비었다").toBeGreaterThan(1000);
  });
});
