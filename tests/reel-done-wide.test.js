// ⑥완성 — **폭을 제대로 준다** (2026-09-15, B안 마무리).
//
// ★★★ 이 화면은 **이미 두 칸**이었다(자막 조절판 ↔ 영상, .done-stage 격자). 새로 짤 것이
//   없고 폭만 모자랐다: 무대가 필요로 하는 폭은 조절판 약 335 + 간격 24 + 영상 최대 560
//   = **919px** 인데, 카드가 `.panel--wide`(880) 에 갇혀 안쪽이 **832px** 였다.
//   2026-09-03 에 "영역을 벗어나고 있고"로 한 번 잡힌 자리이고, 그때는 `minmax(0, auto)` 로
//   **줄어들 수 있게** 해서 넘침만 막았다 — 근본은 폭이었다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync("app/reel/[id]/done/page.js", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

describe("⑥완성 — 무대가 눌리지 않는다", () => {
  it("★★★ 겉틀이 폭을 푼다 — 832px 로는 무대(919px)가 안 들어간다", () => {
    expect(page, "폭을 안 푼다").toMatch(/className="panel[^"]*rv-wide"/);
  });

  it("★★ 무대는 여전히 **줄어들 수 있다** — 폭을 풀어도 그 보험은 남긴다", () => {
    // 좁은 화면에서는 여전히 모자란다. 2026-09-03 의 minmax(0, auto) 를 지우면
    // 그때의 넘침이 그대로 돌아온다.
    const m = /\.done-stage\s*\{([^}]*)\}/.exec(css);
    expect(m, ".done-stage 규칙이 없다").toBeTruthy();
    expect(m[1], "무대가 줄어들 수 없다 — 좁은 화면에서 넘친다").toMatch(/minmax\(0,\s*auto\)/);
  });
});
