// 이 저장소의 화면 계약은 **소스 문자열**로 잰다(렌더 테스트 인프라가 없다).
// 그래서 단정은 "이름이 적혀 있나"가 아니라 "코드가 그렇게 생겼나"를 본다.
//
// ★ 브리프의 판에서 셋이 달라졌다 — 앞 회차에서 사실이 확인된 것들이다:
//   ① `STYLES` 라는 이름은 없다. lib/styles.js 가 내보내는 것은 `STYLE_PRESETS` 다.
//   ② 길이 칩은 `TARGET_CHOICES` 가 아니라 `secondsForModel(저장된 모델)` 에서 온다.
//      TARGET_CHOICES(15·30·45·60)를 그대로 그리면 **화면에는 보이는데 서버가 400 으로
//      막는** 칸이 생긴다(app/api/reel/[id]/settings/route.js 의 「결과 쌍」 검사).
//   ③ 잠긴 축은 **값이 같아도 409** 다 — 그래서 몸통에는 **바뀐 축 하나만** 실어야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/reel/SettingsPanel.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("설정 패널", () => {
  it("★★★ 잠금은 **한 곳**에서 판정한다 — 화면이 신호를 다시 읽지 않는다", () => {
    expect(code, "lockedAxes 를 안 쓴다").toMatch(/lockedAxes\s*\(/);
    expect(code, "화면이 잠금 신호를 직접 읽는다 — 판정이 두 벌이 된다")
      .not.toMatch(/scenario\?\.text|image\?\.url|video\?\.url/);
  });

  it("★★★ 값 목록을 손으로 적지 않는다 — 표에서 온다", () => {
    for (const t of ["ASPECTS", "STYLE_PRESETS"]) {
      expect(code, `${t} 를 안 읽는다`).toContain(t);
    }
    expect(code, "화면에 초 숫자를 손으로 적었다").not.toMatch(/["'`]15초["'`]/);
  });

  it("★★★ 길이 칩은 **그 모델이 한 번에 만드는 길이**만 그린다", () => {
    // TARGET_CHOICES 를 그대로 그리면 seedance-2.0 프로젝트에 30·45·60 칸이 서고,
    // 눌러도 서버가 400 으로 막는다 — 화면과 서버가 같은 표를 봐야 한다.
    expect(code, "secondsForModel 을 안 쓴다").toMatch(/secondsForModel\s*\(/);
    expect(code, "길이 칩을 모델과 무관하게 그린다").not.toContain("TARGET_CHOICES");
  });

  it("★★★ 고친 축 **하나만** 보낸다 — 잠긴 축은 값이 같아도 409 다", () => {
    expect(code, "몸통이 축 하나가 아니다 — 전체 설정을 보내면 잠긴 축 때문에 늘 409 다")
      .toMatch(/JSON\.stringify\(\s*\{\s*\[axis\]:\s*value\s*\}\s*\)/);
  });

  it("★★ 정가는 가격표가 낸다 — 화면이 계산하지 않는다", () => {
    expect(code, "videoPrice 를 안 쓴다").toMatch(/videoPrice\s*\(/);
    expect(code, "화면에 크레딧 숫자를 손으로 적었다").not.toMatch(/\b\d{2,3}\s*크레딧/);
  });

  it("★★ 잠긴 축은 **값이 계속 보인다** — 무엇으로 만들었는지가 사라지면 안 된다", () => {
    expect(code, "잠기면 통째로 감춘다").not.toMatch(/locked\s*&&\s*null/);
    expect(code, "잠긴 이유를 안 보여 준다").toMatch(/\.reason/);
  });

  it("★★ 잠긴 이유는 **한 번만** 보인다 — 네 축이 같은 문구를 쓴다", () => {
    // 비율·길이·모델·화질은 전부 "시나리오를 확정해서 잠겼어요"다(lib/reel/locks.js).
    // 축마다 그 줄을 그리면 사장님 화면에 같은 말이 줄줄이 선다.
    const sites = [...code.matchAll(/rp-why/g)].length;
    expect(sites, "사유를 그리는 자리가 하나가 아니다").toBe(1);
    expect(code, "사유 목록이 중복을 안 걷는다 — 같은 말이 축 수만큼 보인다")
      .toMatch(/new Set\(/);
  });

  it("열린 축을 고치면 그 문으로 보낸다", () => {
    expect(code, "설정 문을 안 부른다").toMatch(/\/settings["'`]/);
    expect(code, "PATCH 가 아니다").toMatch(/method:\s*["'`]PATCH["'`]/);
  });

  it("★★ 서버가 거절하면 그 문구를 사장님에게 보여 준다 — 조용히 삼키지 않는다", () => {
    // 라우트는 403(등급)·400(값)·409(잠김)로 답한다. 삼키면 칩이 안 바뀌는 이유를
    // 사장님이 영영 모른다.
    expect(code, "실패 갈래가 없다").toMatch(/!res\.ok/);
    expect(code, "서버 문구를 안 읽는다").toMatch(/\.error/);
    expect(code, "오류를 그리는 자리가 없다").toMatch(/rp-err/);
  });

  it("규칙: 색·치수는 토큰이다", () => {
    const at = css.indexOf(".rp-panel");
    expect(at, ".rp-panel 규칙이 없다").toBeGreaterThan(-1);
    const rules = css.slice(at);
    expect(rules, "hex 를 적었다").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // 고른 칩은 --ink 바탕이다 — 앱층에서 액센트는 사이드바 스테퍼의 몫이고,
    // tests/design-system.test.js 가 그것을 판으로 막는다.
    expect(rules, "앱층에서 액센트를 썼다").not.toMatch(/var\(--accent/);
  });
});
