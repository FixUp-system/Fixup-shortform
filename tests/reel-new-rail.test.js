// ①입력 — **설정을 왼쪽 레일로, 접지 않고, 간략하게** (2026-09-15, B안).
//
// ★★★ 왜 레일인가 — **자리의 연속**이다. ②~⑥에 이미 같은 자리에 「이 영상의 설정」
//   레일이 서 있다. ①도 거기에 두면 첫 화면부터 끝까지 설정이 한 곳이고, 시작하는 순간
//   그 레일이 그대로 「잠김」을 말하는 레일로 바뀐다 — 고른 자리와 잠기는 자리가 같아진다.
//
// ★★★ 왜 접지 않는가(2026-09-15 사장님 결정) — 한 번 「+ 더 보기」로 다섯을 접었다가
//   되돌렸다: *"접기를 사용하면 안 되는 게, 사용자가 인지를 못 하고 진행할 수도 있는
//   부분이라서"*. 여기서 고른 값 중 다섯은 **시작하면 잠긴다** — 접어 두면 모른 채
//   지나가고 나중에 못 바꾼다. 그래서 **펼친 채로 최대한 간략하게**가 답이다.
//   줄이는 방법 둘: ① 자주 안 바꾸는 것은 드롭다운(한 줄) ② 라벨을 왼쪽으로 보내 줄
//   높이를 반으로.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync("app/reel/new/page.js", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

describe("①입력 — 설정은 왼쪽 레일에", () => {
  it("★★★ ②~⑥과 **같은 격자**에 선다 — 레일의 자리가 같아야 배운 것이 이어진다", () => {
    expect(page, "작업 화면 격자를 안 쓴다 — 레일이 다른 자리에 선다").toContain("rw-grid");
    expect(page, "설정 레일을 안 쓴다").toContain("rp-panel");
    expect(page, "적는 칸이 본문 칸에 없다").toContain("rw-work");
  });

  it("★★★ 레일이 먼저, 적는 칸이 나중이다 — 순서가 곧 좌우다", () => {
    const rail = page.indexOf("rp-panel");
    const work = page.indexOf("rw-work");
    expect(rail, "레일이 없다").toBeGreaterThan(-1);
    expect(work, "본문 칸이 없다").toBeGreaterThan(-1);
    expect(rail, "적는 칸이 레일보다 앞이다 — 좌우가 뒤집힌다").toBeLessThan(work);
  });

  it("★★★ 접는 자리가 **없다** — 숨기면 모른 채 지나가고, 그 값들은 시작하면 잠긴다", () => {
    expect(page, "접는 단추가 남아 있다").not.toContain("rp-more");
    expect(page, "화풍을 잘라서 보여 준다 — 나머지가 숨는다").not.toContain("STYLE_HEAD");
  });

  it("★★★ 자주 안 바꾸는 줄은 **드롭다운**이다 — 칩 줄이면 펼친 채로는 너무 길다", () => {
    expect(page, "공용 드롭다운을 안 쓴다").toMatch(/import\s+Select\s+from/);
    for (const name of ["AD_STYLES", "REEL_CONCEPTS", "AD_MOODS", "AD_LANGS", "models", "resolutionsForModel"]) {
      // ★ 배열은 `X.map`, 함수는 `X(model)` 로 쓰인다 — 둘 다 받는다(동적 정규식은 안 쓴다).
      const at = Math.max(page.indexOf(name + "."), page.indexOf(name + "("));
      expect(at, `${name} 줄이 없다`).toBeGreaterThan(-1);
      expect(page.slice(Math.max(0, at - 240), at + 240), `${name} 이 아직 칩 줄이다`)
        .not.toContain("chips");
    }
  });

  it("★★ 사이즈만 칩으로 남는다 — 셋뿐이고 **모양으로 고르는** 값이다", () => {
    const at = page.indexOf("ASPECTS.");
    expect(at, "사이즈 줄이 없다").toBeGreaterThan(-1);
    expect(page.slice(Math.max(0, at - 240), at + 240), "사이즈까지 드롭다운이 됐다").toContain("chips");
  });

  it("★★ 레일 안에서는 라벨이 **왼쪽**에 선다 — 줄 높이가 반이 된다", () => {
    const m = /\.rp-panel\s+\.tray-row\s*\{([^}]*)\}/.exec(css);
    expect(m, "레일 안 줄 규칙이 없다").toBeTruthy();
    expect(m[1], "라벨이 아직 위에 있다 — 줄마다 두 줄을 먹는다").not.toMatch(/flex-direction:\s*column/);
  });

  it("★★★ **시작하면 잠긴다**는 것을 고르는 자리에서 말한다", () => {
    // 참조 셋에는 없는, 우리에게만 있는 사정이다 — ②에 가서야 처음 보면 늦다.
    expect(page, "잠김 안내가 없다").toMatch(/잠겨요|잠깁니다|잠긴다/);
  });

  it("★★ 고를 게 하나뿐인 줄은 **안 그린다** — 줄만 차지한다", () => {
    expect(page, "하나뿐인 줄을 그대로 그린다").toMatch(/secondsForModel\(model\)\.length\s*>\s*1/);
  });

  it("★★★ 두 칸의 **바닥이 맞는다** — 이 화면에서만", () => {
    expect(page, "높이를 맞추는 표식이 없다").toContain("rw-grid--even");
    const m = /\.rw-grid--even\s*\{([^}]*)\}/.exec(css);
    expect(m, "그 표식의 규칙이 없다").toBeTruthy();
    expect(m[1], "바닥을 안 맞춘다").toMatch(/align-items:\s*stretch/);
    // ②~⑥ 의 바탕 규칙은 그대로 start 여야 한다(저기선 설정 패널이 늘어나면 빈 기둥이 된다).
    const base = /\.rw-grid\s*\{([^}]*)\}/.exec(css);
    expect(base[1], "바탕 격자가 stretch 가 됐다").toMatch(/align-items:\s*start/);
  });

  it("★★ 늘어난 높이는 **적는 칸이 가져간다** — 빈 면을 늘리지 않는다", () => {
    const m = /\.rw-grid--even[^{]*\.composer-text\s*\{([^}]*)\}/.exec(css);
    expect(m, "적는 칸이 남는 높이를 안 가져간다 — 카드 아래가 빈 면이 된다").toBeTruthy();
    expect(m[1], "늘어나지 않는다").toMatch(/flex:\s*1|height:\s*100%/);
  });
});
