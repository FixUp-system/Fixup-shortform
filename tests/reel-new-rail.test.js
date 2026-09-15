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
    expect(page, "높이를 맞추는 표식이 없다").toContain("rw-grid--even");
    // ★★★ 2026-09-15 사장님 지적 — 「더 보기 했을 때 입력 폼이 너무 길어져」.
    //   펼치면 레일이 길어지는데 바닥을 맞춰 두면 **적는 칸이 그걸 그대로 따라간다.**
    //   그래서 **접혔을 때만** 맞춘다. 펼친 뒤에는 레일만 길어지고 폼은 제 높이를 지킨다.
    expect(page, "펼쳐도 폼이 레일을 따라간다 — 너무 길어진다")
      .toMatch(/(more|allStyles)[\s\S]{0,60}?rw-grid--even/);
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

  // ★★★ 2026-09-15 사장님 지적 — 「레일이 깔끔하지 않다」. 실측: 레일 355px 중 화풍
  //   한 줄이 **122px(34%)** 를 먹었다(칩 3줄 + 설명).
  //   ★ 한 번 **레일 폭을 420px 로 넓혀 봤다가 되돌렸다** — 사장님이 짚은 대로 ①과 ②~⑥ 은
  //     레일에 담기는 양이 다르다(저쪽은 잠긴 값 몇 개뿐). 폭을 화면마다 달리하면
  //     「같은 자리」가 깨진다. **폭이 아니라 내용을 줄인다.**
  it("★★★ 화풍은 겉에 **넷만** 선다 — 나머지는 눌러서 편다", () => {
    expect(page, "화풍을 줄이는 수가 없다").toMatch(/STYLE_HEAD|styleHead/);
    expect(page, "펴는 표식이 없다").toContain("rp-more-inline");
  });

  it("★★★ **고른 화풍은 접혀도 보인다** — 숨으면 무엇을 골랐는지 알 수 없다", () => {
    // 고른 것이 뒤쪽 다섯 중 하나일 수 있다. 그때도 겉에 서야 한다.
    // ★ 글자 그대로 잰다 — 정규식으로 느슨하게 재려다 `` 가 heredoc 에서 먹혀 한 번
    //   헛돌았다(이 저장소의 알려진 함정). 겉 넷을 거르는 그 자리에서 고른 것을 함께 남긴다.
    expect(page, "고른 것이 숨을 수 있다").toContain("|| s.id === style");
  });

  it("★★ 고를 게 하나뿐인 줄은 **안 그린다** — 줄만 차지한다", () => {
    // 길이는 모델에 따라 하나뿐일 때가 있다(지금 15초 하나).
    expect(page, "하나뿐인 줄을 그대로 그린다").toMatch(/secondsForModel\(model\)\.length\s*>\s*1/);
  });

  // ★★★ 2026-09-15 사장님 지적 — 「접고 펼친다고 해도 너무 길어져」. 실측: 펼치면 레일이
  //   **1,093px** 였다. 접힌 다섯이 전부 칩 줄이라 칩 18개 + 설명이 한꺼번에 펼쳐진다.
  //   ★ 그 다섯은 **자주 안 바꾸는 값**이다 — 칩은 자주 바꾸고 눈으로 고르는 것에 쓰고,
  //     이런 것은 **드롭다운**이 제 옷이다. 한 줄짜리 다섯이 되어 절반 아래로 준다.
  //   ★ 공용 부품(components/Select.jsx)을 쓴다 — 화면이 <select> 를 직접 쓰면 브라우저
  //     기본 화살표가 나와 "손으로 만든 화면"처럼 보인다(그 부품의 주석).
  it("★★★ 접힌 다섯은 **드롭다운**이다 — 칩 줄이면 펼쳤을 때 너무 길다", () => {
    expect(page, "공용 드롭다운을 안 쓴다").toMatch(/import\s+Select\s+from/);
    // 다섯 줄 전부 — 하나라도 칩으로 남으면 그 줄만 길어진다.
    const folded = page.slice(page.indexOf("rp-more"));
    for (const name of ["REEL_CONCEPTS", "AD_MOODS", "AD_LANGS", "models", "resolutionsForModel"]) {
      const at = folded.indexOf(name);
      expect(at, `${name} 줄이 접힘 안에 없다`).toBeGreaterThan(-1);
      expect(folded.slice(at - 200, at + 200), `${name} 이 아직 칩 줄이다`).not.toContain("chips");
    }
  });

  it("★★ 레일 안에서는 줄이 **세로로** 선다 — 340px 에 라벨과 칩을 나란히 못 둔다", () => {
    const m = /\.rp-panel\s+\.tray-row\s*\{([^}]*)\}/.exec(css);
    expect(m, "레일 안 줄 규칙이 없다").toBeTruthy();
    expect(m[1], "레일 안에서도 가로로 선다").toMatch(/flex-direction:\s*column/);
  });
});
