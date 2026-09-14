// ★ 보관함 상세의 손질(2026-08-14 사용자 요청).
//
// ① 세부 프롬프트(시나리오 지시문·원고·장면 목록)는 **접었다 편다.** 그 글이 길어서
//    (광고 시나리오는 4,000자까지다) 펼쳐 두면 설정 같은 짧은 정보가 저 아래로 밀린다.
//    ⚠️ 2026-09-14 — ①은 뒤집혔다: 접힘 칸 자체를 걷었다(아래 묶음 참고).
// ② 겉 테두리를 넓힌다 — 정보가 많은 화면이라 960px 상자 안에서 글이 답답하다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/archive/[id]/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
// 주석은 걷어내고 판정한다 — 걷은 이유를 적은 주석이 단정에 걸리면 안 된다.
const code = src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

// ★★ 2026-09-14 — **뒤집힌 판이다.** ①(세부 프롬프트는 접었다 편다)을 못 박았었는데, 사장님 지시
//   (사용자에게 불필요한 정보 제거)로 접힘 칸 넷(광고 프롬프트 · reel 이미지/영상 프롬프트 ·
//   단계별 원고 · 장면별 컷 지시)을 통째로 걷었다. 전부 모델에게 넘긴 영어 지시문이라 손님이
//   읽을 글이 아니었다. 문서에는 그대로 남는다 — 화면에서만 뺐다.
describe("보관함 상세 — 프롬프트 접힘 칸이 없다", () => {
  it("★ 접힘 칸(<details>·lib-fold)이 없다", () => {
    expect(code, "접힘 칸이 돌아왔다").not.toMatch(/<details/);
    expect(code).not.toContain("lib-fold");
  });

  it("★ 모델에 넘긴 글(시나리오·원고·컷별 지시)을 그리지 않는다", () => {
    expect(code, "광고/reel 시나리오 원문을 그린다").not.toMatch(/\{doc\.scenario\.text\}/);
    expect(code, "단계별 원고를 그린다").not.toMatch(/\{doc\.script\.text\}/);
    expect(code, "컷별 지시 표가 돌아왔다").not.toContain("컷별 지시");
    expect(code).not.toContain("plan-list");
  });

  it("설정 요약(모델·길이·화질)은 남는다", () => {
    expect(code).toContain("spec-chip");
    expect(code).toMatch(/<b>모델<\/b>/);
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

  // ★ 2026-09-14 — '사용자 입력' → '내가 적은 내용'(사장님 지시: 손님이 읽는 말로).
  //   '사용자 입력'은 만드는 쪽이 부르는 이름이었다.
  it("'사장님이 준 것'·'사용자 입력' 이 아니라 '내가 적은 내용' 이다", () => {
    expect(code).not.toContain("사장님이 준 것");
    expect(code).not.toContain("사용자 입력");
    expect(code).toContain('label="내가 적은 내용"');
  });

  // (옛 판 "'시나리오' 가 아니라 '프롬프트' 다" 는 2026-09-14 접힘 칸 제거로 뜻을 잃어 걷어냈다 —
  //  칸이 없다는 것은 위 "프롬프트 접힘 칸이 없다" 묶음이 잰다.)

  // ★★ 2026-09-14 — **뒤집힌 판이다.** 그전에는 모델을 'Seedance 2.0' 같은 전체 이름으로 적게
  //   못 박았다. 사장님 지시로 업체 모델명은 안 적는다 — 원클릭(광고)만 표의 label(기본/프로)을
  //   적고, 단계별·reel 은 모델 칩 자체가 없다.
  it("★ 모델 칩은 광고만, 표의 label 로 — 업체 이름(name·I2V_MODELS 라벨)을 안 적는다", () => {
    const at = code.indexOf("const modelLabel");
    expect(at, "modelLabel 을 못 찾았다").toBeGreaterThan(-1);
    const expr = code.slice(at, code.indexOf(";", at));
    expect(expr).toMatch(/adModel\(s\.model\)\?\.label/);
    expect(expr, "광고에 업체 전체 이름(name)을 쓴다").not.toMatch(/\.name\b/);
    expect(expr, "단계별이 영상 모델 라벨(Kling v3 등)을 적는다").not.toContain("I2V_MODELS");
    expect(adModels, "광고 표의 label 이 기본/프로가 아니다").toMatch(/label:\s*"기본"/);
    expect(adModels).toMatch(/label:\s*"프로"/);
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
