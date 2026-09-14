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
// ★★★ Ruling 11 — 이 갈래 하나만은 **함수를 실제로 돌려** 잰다. 요구가 "코드가 그렇게
//   생겼나"가 아니라 **"값이 화면에 남나"**라서, 모양만 재면 갈래가 죽어도 초록일 수 있다.
import { withSavedValue } from "../components/reel/SettingsPanel.jsx";

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

  // ★★★ 2026-09-14 Ruling 10 — **뒤집혔다.** 여기에는 "정가는 가격표가 낸다"(videoPrice 를
  //   쓰라)는 단정이 있었다. 사장님 규칙은 그 반대다 — 값·크레딧 문구는 ⑤영상에서만 말한다
  //   (docs/superpowers/specs/2026-09-08-light-theme-mcs-design.md · tests/reel-ui.test.js).
  //   이 패널은 ①~⑥ 어느 단계에서나 서 있어서, 정가 줄을 달면 "돈이 나가는 자리는 ⑤ 하나"가
  //   통째로 흐려진다. 남겨 두면 판이 지시와 정반대인 문구를 강제한다.
  it("★★★ 값을 말하지 않는다 — 값·크레딧은 ⑤영상에서만 말한다", () => {
    // ★ 주석을 걷고 잰다 — 왜 뺐는지는 주석에 남아야 하고(그러려면 "크레딧"이라는 말을
    //   써야 한다), 그 글자가 단정에 걸리면 안 된다. tests/reel-ui.test.js 의 같은 관용구다.
    //   ⚠️ `code` 는 이 파일 머리에서 이미 주석을 걷은 것이다.
    expect(code, "가격표를 다시 끌어왔다").not.toContain("videoPrice");
    expect(code, "가격 문구 만들기를 다시 끌어왔다").not.toContain("priceLabel");
    expect(code, "화면이 아직 값을 말한다").not.toContain("크레딧");
  });

  it("★★ 잠긴 축은 **값이 계속 보인다** — 무엇으로 만들었는지가 사라지면 안 된다", () => {
    expect(code, "잠기면 통째로 감춘다").not.toMatch(/locked\s*&&\s*null/);
    expect(code, "잠긴 이유를 안 보여 준다").toMatch(/\.reason/);
  });

  it("★★★ 세 축 **모두** 표 밖 저장값 갈래를 지나고, 그 칩은 못 누른다", () => {
    // 한 축만 빠뜨려도 그 축에서 값이 사라진다 — 축마다 따로 못 박는다.
    expect(code, "비율이 그 갈래를 안 지난다").toMatch(/withSavedValue\(\s*ASPECTS/);
    expect(code, "길이가 그 갈래를 안 지난다").toMatch(/withSavedValue\(\s*secondsForModel/);
    expect(code, "화풍이 그 갈래를 안 지난다").toMatch(/withSavedValue\(\s*STYLE_PRESETS/);
    expect(code, "표 밖 값을 누를 수 있다 — 서버는 400 이라 거짓말이 된다")
      .toMatch(/disabled=\{[^}]*it\.off/);
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
    // ★★ **끝 표식까지만** 자른다. app/globals.css 는 여러 세션이 끝에 덧붙이는 파일이라,
    //   파일 끝까지 재면 **남이 뒤에 붙인 hex 가 이 판을 빨갛게** 만들고 메시지는 엉뚱하게
    //   "hex 를 적었다"로 내 블록을 가리킨다(남의 작업을 망치는 자리다).
    const rest = css.slice(at);
    const end = rest.indexOf("/* ──");
    expect(end, "블록 끝 표식이 없다 — 경계가 없으면 남의 CSS 까지 재게 된다").toBeGreaterThan(-1);
    const rules = rest.slice(0, end);
    expect(rules, "hex 를 적었다").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // 고른 칩은 --ink 바탕이다 — 앱층에서 액센트는 사이드바 스테퍼의 몫이고,
    // tests/design-system.test.js 가 그것을 판으로 막는다.
    expect(rules, "앱층에서 액센트를 썼다").not.toMatch(/var\(--accent/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Ruling 11 — **표 밖 저장값은 비활성 칩으로 남는다.**
//
// 왜 여기만 함수를 돌리나: 요구가 "값이 화면에서 사라지지 않는다"라서, 소스 모양만 재면
// 갈래가 조용히 죽어도 초록일 수 있다. 실재하는 문서로 판을 세운다 —
// app/api/reel/[id]/settings/route.js 의 Ruling 9 주석이 그런 문서의 존재를 단언한다
// ("08-25 이전 reel 문서에는 길이가 모델 상한 위이거나 아예 없는 것이 있다").
// 지금 secondsForModel("seedance-2.0") 은 [15] 하나다.
// ────────────────────────────────────────────────────────────────────────
describe("표 밖 저장값 (Ruling 11)", () => {
  const 초 = (v) => `${v}초`;
  const 길이표 = [{ id: 15, text: "15초" }];

  it("★★★ 2.0 + 30초 옛 문서 — 30초가 칩으로 남고 · 못 누르고 · 골라진 것으로 보인다", () => {
    const items = withSavedValue(길이표, 30, 초);
    const saved = items.find((it) => it.id === 30);
    expect(saved, "저장값이 화면에서 사라졌다 — 30초짜리가 15초처럼 읽힌다").toBeTruthy();
    expect(saved.text, "라벨이 저장값이 아니다").toBe("30초");
    expect(saved.off, "누를 수 있다 — 서버는 400 이라 고르게 두면 거짓말이다").toBe(true);
    // 선택 표시는 화면이 `it.id === value` 로 붙인다. 그 값이 그대로 있어야 `on` 이 된다.
    expect(saved.id, "id 가 저장값과 다르면 선택 표시가 안 붙는다").toBe(30);
    expect(items[0], "표의 값을 밀어냈다").toEqual(길이표[0]);
  });

  it("표 밖 화풍·비율도 같은 규칙이다 — 축을 안 가린다", () => {
    const 화풍표 = [{ id: "photo", text: "실사" }];
    const 지워진화풍 = withSavedValue(화풍표, "claymation", String).find((it) => it.id === "claymation");
    expect(지워진화풍.text, "모르는 화풍은 그 id 를 그대로 보여 준다").toBe("claymation");
    expect(지워진화풍.off).toBe(true);

    const 비율표 = [{ id: "9:16", text: "세로 9:16" }];
    const 옛비율 = withSavedValue(비율표, "3:2", String).find((it) => it.id === "3:2");
    expect(옛비율.text).toBe("3:2");
    expect(옛비율.off).toBe(true);
  });

  it("표 안의 값은 칩을 안 늘린다 — 같은 값이 두 번 서면 안 된다", () => {
    expect(withSavedValue(길이표, 15, 초)).toHaveLength(1);
  });

  it("값이 아예 없으면 **지어내지 않는다**", () => {
    for (const 빈값 of [undefined, null, ""]) {
      expect(withSavedValue(길이표, 빈값, String), `${String(빈값)} 에서 칩을 지어냈다`).toHaveLength(1);
    }
  });
});
