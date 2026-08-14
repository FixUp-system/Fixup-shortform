// ★ 보관함 상세의 손질(2026-08-14 사용자 요청).
//
// ① 세부 프롬프트(시나리오 지시문·원고·장면 목록)는 **접었다 편다.** 그 글이 길어서
//    (광고 시나리오는 4,000자까지다) 펼쳐 두면 설정 같은 짧은 정보가 저 아래로 밀린다.
// ② 겉 테두리를 넓힌다 — 정보가 많은 화면이라 960px 상자 안에서 글이 답답하다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/archive/[id]/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("보관함 상세 — 세부는 접었다 편다", () => {
  it("★ 접기·펴기가 있다 — 브라우저가 주는 것을 쓴다(상태를 새로 만들지 않는다)", () => {
    // <details>/<summary> 는 키보드·스크린리더 동작이 이미 붙어 있다. useState 로 흉내 내면
    // 그 동작을 직접 만들어야 하고 대개 빠뜨린다.
    expect(src, "토글이 없다").toMatch(/<details/);
    expect(src).toMatch(/<summary/);
  });

  it("긴 글이 그 안에 들어간다 — 시나리오·원고·장면 목록", () => {
    const first = src.indexOf("<details");
    expect(first).toBeGreaterThan(-1);
    const rest = src.slice(first);
    for (const key of ["scenario", "script", "plan-list"]) {
      expect(rest, `${key} 가 접히는 자리 밖에 있다`).toContain(key);
    }
  });

  it("★ 설정(모델·길이·화질)은 접지 않는다 — 늘 보이는 요약이다", () => {
    const first = src.indexOf("<details");
    expect(src.slice(0, first), "설정이 접히는 자리 안으로 들어갔다").toMatch(/모델/);
  });
});

describe("보관함 상세 — 테두리를 넓힌다", () => {
  it("★ 전용 폭을 쓴다 — panel--stage(960)를 늘리면 ⑥완성 무대까지 넓어진다", () => {
    expect(src, "상세 전용 폭 클래스가 없다").toMatch(/panel--library/);
    const at = css.indexOf(".panel--library");
    expect(at, ".panel--library 규칙이 없다").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    const width = Number(/max-width:\s*(\d+)px/.exec(rule)?.[1]);
    expect(width, "예전(960)보다 넓지 않다").toBeGreaterThan(960);
    // 본문 기둥(1160)을 넘지 않는다 — 넘으면 가로 스크롤이 생긴다
    expect(width).toBeLessThanOrEqual(1160);
  });
});

// ★ 문구·표시 손질(2026-08-14 사용자 요청).
describe("보관함 상세 — 말과 표시를 다듬는다", () => {
  const page = readFileSync("app/archive/[id]/page.js", "utf8");
  const adModels = readFileSync("lib/ad/models.js", "utf8");

  it("'사장님이 준 것' 이 아니라 '사용자 입력' 이다", () => {
    expect(page).not.toContain("사장님이 준 것");
    expect(page).toContain("사용자 입력");
  });

  it("'시나리오' 가 아니라 '프롬프트' 다 — 모델에 넘긴 글이라는 뜻이 더 곧다", () => {
    expect(page, "아직 시나리오라고 부른다").not.toMatch(/<summary>시나리오/);
    expect(page).toMatch(/<summary>프롬프트/);
  });

  it("★ 모델을 'Seedance 2.0' 형식으로 적는다 — id('seedance-2.0')도 라벨('2.0')도 아니다", () => {
    // 단계별은 I2V_MODELS 에 이미 그 이름이 있다(label: "Seedance 2.0").
    expect(page, "단계별이 모델 id 를 그대로 쓴다").toMatch(/I2V_MODELS/);
    // 광고 표의 label 은 칩에 쓰는 짧은 이름("2.0")이라 그대로 쓰면 안 된다.
    expect(adModels, "광고 표에 전체 이름(name)이 없다").toMatch(/name:\s*"Seedance 2\.[05]"/);
  });

  it("★ 아래 버튼 셋의 치수가 같다 — .mini(12px)와 .cta(16px)가 섞여 있었다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const at = css.indexOf(".panel--library .step-actions");
    expect(at, "상세 화면의 버튼 치수를 맞추는 규칙이 없다").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toMatch(/font-size:\s*14px/);
    expect(rule).toMatch(/height:/);
  });
});
