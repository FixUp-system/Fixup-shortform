// ★ 두 가지 손질(2026-08-14 사용자 요청).
//
// ① 길이의 "자동 · 자료에 맞춰"를 뺀다. 값이 길이로 정해지는데(정가·크레딧) 자동이면
//    사장님이 만들기 전에 얼마인지 모른다 — 화면도 "값은 30초 기준"이라고 에두르고 있었다.
//
// ② 보관함 제목이 너무 짧게 잘렸다. 자르는 자리가 **둘**이다: 서버가 40자에서 자르고,
//    카드 CSS 가 한 줄(nowrap)로 또 자른다. 둘 다 풀어야 실제로 더 보인다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const createPage = read("app/create/page.js");
const store = read("lib/store/supabase.js");
const css = read("app/globals.css");

describe("길이 — 자동을 뺀다", () => {
  it("자동 칩이 없다", () => {
    expect(createPage, "'자동 · 자료에 맞춰' 칩이 남아 있다").not.toContain("자동 · 자료에 맞춰");
  });

  it("★ 기본 길이가 정해져 있다 — null 로 두면 값이 얼마인지 못 적는다", () => {
    // 크레딧 표시(videoPrice)가 seconds 를 받는다. null 이면 30초로 떨어져 실제와 갈린다.
    expect(createPage).toMatch(/useState\(30\)/);
  });

  it("'값은 30초 기준' 이라는 에두른 안내도 사라진다 — 이제 고른 값이 곧 그 값이다", () => {
    // ★ 화면에 그리는 문구만 잰다. 주석은 그 문구를 **인용**한다(왜 없앴는지 남겨야 하므로) —
    //   낱말로만 세면 그 주석이 걸려 거짓으로 빨개진다(처음에 그랬다).
    expect(createPage, "그 안내를 아직 화면에 그린다").not.toMatch(/&&\s*" · 값은 30초 기준/);
  });
});

describe("보관함 제목 — 두 자리를 다 푼다", () => {
  it("★ 서버가 40자에서 안 자른다", () => {
    expect(store, "목록 제목이 아직 40자에서 잘린다").not.toMatch(/material_text \|\| ""\)\.slice\(0, 40\)/);
    // 무제한도 아니다 — 목록 응답이 커지면 안 된다
    expect(store).toMatch(/material_text \|\| ""\)\.slice\(0, (8|9|1[0-2])\d\)/);
  });

  // ★★★ 2026-09-15 — **이 결정은 뒤집혔다.** 카드에서 제목 줄을 통짜로 걷고
  //   만든 날짜를 둔다(사장님 결정, tests/archive-card-date.test.js).
  //   두 줄로 늘리는 것으로는 문제가 안 풀렸다 — 「제목」이 사장님이 적은 원문
  //   앞 100자라, 비슷한 편끼리는 **앞머리 자체가 같아서** 한 줄이든 두 줄이든
  //   구별이 안 됐다. 그래서 이 시험은 「두 줄」이 아니라 **그 자리가 비었는가**를 재는 것으로
  //   바뀐다. 서버가 100자로 자르는 것은 그대로다 — 그 값은 지우기 다이얼로그와
  //   그림의 대체 텍스트(alt)가 아직 쓴다.
  it("★ 카드에는 제목 규칙이 아예 없다 — 그 자리는 날짜가 썼다", () => {
    expect(css.indexOf(".project-meta .title"), "옛 제목 규칙이 남아 있다").toBe(-1);
    expect(css.indexOf(".project-meta .when"), "날짜 규칙이 없다").toBeGreaterThan(-1);
  });
});

// ★ 영상 모델을 맨 위로(2026-08-14 사용자 요청).
//
// 모델이 **정가를 정하는 축**이고 만든 뒤에는 못 바꾼다 — 그런데 길이·사이즈 아래에 있었다.
// 되돌릴 수 없는 선택일수록 먼저 보여야 한다.
//
// ⚠️ 길이 목록은 모델로 안 거른다. 단계별은 컷을 여러 개 이어 붙이므로 모델의 클립 상한
//    (Seedance 15초)에 전체 길이가 안 묶인다 — 컷 하나의 상한은 8초(CONTENT_MAX_SECONDS)라
//    15초에 닿을 일도 없다. 한 번에 통짜로 만드는 **광고**는 다르고, 거기는 이미 모델별로
//    거르고 있다(/ads/new 의 adSecondsFor).
describe("①자료 — 영상 모델이 맨 위다", () => {
  const src = readFileSync("app/create/page.js", "utf8");

  it("모델 줄이 길이·사이즈보다 먼저 온다", () => {
    const model = src.indexOf('<span className="tray-label">영상 모델</span>');
    const length = src.indexOf('<span className="tray-label">길이</span>');
    const size = src.indexOf('<span className="tray-label">사이즈</span>');
    expect(model, "영상 모델 줄을 못 찾겠다").toBeGreaterThan(-1);
    expect(model, "모델이 길이보다 뒤에 있다").toBeLessThan(length);
    expect(model, "모델이 사이즈보다 뒤에 있다").toBeLessThan(size);
  });

  it("길이 목록은 여전히 넷이다 — 모델로 거르지 않는다", () => {
    expect(src).toMatch(/TARGET_CHOICES\.map/);
    expect(src, "길이를 모델로 거르고 있다").not.toMatch(/TARGET_CHOICES\.filter/);
  });
});
