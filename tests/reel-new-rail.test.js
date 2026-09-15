// ①입력 — **설정을 왼쪽 레일로** (2026-09-15 사장님 결정, B안).
//
// ★★★ 왜: 첫 화면이 한 번에 **31개**를 물었다(컨셉 7 · 분위기 4 · 화풍 9 · 언어 3 ·
//   모델 2 · 사이즈 3 · 화질 2 · 길이 1) — 여덟 줄이 같은 무게로 쌓여 무엇이 중요한지
//   화면이 말해 주지 않았다. 참조 셋(PixVerse·Lumina·Higgsfield)은 같은 자리에서
//   4~6개만 보여 주고 나머지는 접는다.
//
// ★★★ 레일을 고른 이유는 **자리의 연속**이다. ②~⑥에 이미 「이 영상의 설정」 레일이
//   같은 자리에 서 있다. ①도 거기에 두면 첫 화면부터 끝까지 설정이 한 곳이고,
//   시작하는 순간 **그 레일이 그대로 「잠김」을 말하는 레일로 바뀐다** — 고른 자리와
//   잠기는 자리가 같아진다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync("app/reel/new/page.js", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

// 레일에 겉으로 서는 줄 셋, 접히는 줄 다섯.
const FRONT = ["사이즈", "길이", "화풍"];
const FOLDED = ["화질", "모델", "컨셉", "분위기", "언어"];
const at = (label) => page.indexOf(`>${label}</span>`);

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

  it("★★★ 겉에 서는 줄은 셋이다 — 자주 바꾸는 것만", () => {
    for (const l of FRONT) expect(at(l), `${l} 줄이 없다`).toBeGreaterThan(-1);
    // 겉 셋이 접힘 다섯보다 **앞**에 있다.
    const lastFront = Math.max(...FRONT.map(at));
    const firstFolded = Math.min(...FOLDED.map(at));
    expect(firstFolded, "접히는 줄이 겉 줄보다 앞에 있다").toBeGreaterThan(lastFront);
  });

  it("★★★ 나머지 다섯은 **접힌다** — 펴는 단추가 있고, 접힌 줄이 그 뒤에 온다", () => {
    const more = page.indexOf("rp-more");
    expect(more, "펴는 단추가 없다").toBeGreaterThan(-1);
    const firstFolded = Math.min(...FOLDED.map(at));
    expect(firstFolded, "접힌 줄이 단추보다 앞에 있다 — 늘 펴져 있는 것이다").toBeGreaterThan(more);
    // 상태로 여닫는다 — 늘 그려 두고 CSS 로만 감추면 첫 화면이 그대로 길다.
    expect(page, "접힘이 상태가 아니다").toMatch(/more\s*&&/);
  });

  it("★★★ **시작하면 잠긴다**는 것을 고르는 자리에서 말한다", () => {
    // 참조 셋에는 없는, 우리에게만 있는 사정이다 — ②에 가서야 처음 보면 늦다.
    expect(page, "잠김 안내가 없다").toMatch(/잠겨요|잠깁니다|잠긴다/);
  });

  // ★★★ 2026-09-15 사장님 지시 — 「이 영상의 설정에 사이즈에 맞춰서 입력 폼도 유지」.
  //   실측: 레일 355px · 적는 칸 135px 로 바닥이 크게 어긋났다. ②에서 글·그림 카드를
  //   맞춘 것과 같은 요구다.
  //   ★ `.rw-grid` 를 통째로 stretch 로 바꾸면 안 된다 — ②~⑥에서는 **설정 패널이 본문
  //     길이를 따라 늘어나면 안 된다**(빈 흰 기둥이 된다). 거기엔 판까지 있다
  //     (reel-workbench-layout 의 「왼쪽 설정 패널은 작업대 길이를 따라 늘어나지 않는다」).
  //     그래서 **이 화면에서만** 여는 표식을 따로 둔다.
  it("★★★ 두 칸의 **바닥이 맞는다** — 이 화면에서만", () => {
    expect(page, "높이를 맞추는 표식이 없다").toMatch(/rw-grid[^"`]*rw-grid--even/);
    const m = /\.rw-grid--even\s*\{([^}]*)\}/.exec(css);
    expect(m, "그 표식의 규칙이 없다").toBeTruthy();
    expect(m[1], "바닥을 안 맞춘다").toMatch(/align-items:\s*stretch/);
    // ②~⑥ 의 바탕 규칙은 그대로 start 여야 한다.
    const base = /\.rw-grid\s*\{([^}]*)\}/.exec(css);
    expect(base[1], "바탕 격자가 stretch 가 됐다 — ②~⑥의 설정 패널이 빈 기둥이 된다")
      .toMatch(/align-items:\s*start/);
  });

  it("★★ 늘어난 높이는 **적는 칸이 가져간다** — 빈 면을 늘리지 않는다", () => {
    const m = /\.rw-grid--even[^{]*\.composer-text\s*\{([^}]*)\}/.exec(css);
    expect(m, "적는 칸이 남는 높이를 안 가져간다 — 카드 아래가 빈 면이 된다").toBeTruthy();
    expect(m[1], "늘어나지 않는다").toMatch(/flex:\s*1|height:\s*100%/);
  });

  it("★★ 레일 안에서는 줄이 **세로로** 선다 — 340px 에 라벨과 칩을 나란히 못 둔다", () => {
    const m = /\.rp-panel\s+\.tray-row\s*\{([^}]*)\}/.exec(css);
    expect(m, "레일 안 줄 규칙이 없다").toBeTruthy();
    expect(m[1], "레일 안에서도 가로로 선다").toMatch(/flex-direction:\s*column/);
  });
});
