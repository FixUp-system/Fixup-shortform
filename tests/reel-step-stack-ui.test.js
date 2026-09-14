// 화면 계약 — 이 저장소에는 렌더 인프라가 없어 **소스 문자열**로 잰다.
//
// ★ 그 방식은 깨진 문법을 못 잡는다(CLAUDE.md 의 경고). 그래서 이 파일은 부품을 **실제로
//   import** 한다 — 파일이 파싱조차 안 되면 이 판이 수집 단계에서 먼저 빨개진다.
//   덤으로 접힌 요약(stepSummary)은 모양이 아니라 **값**으로 잰다: 요구가 "문서에서
//   파생한다"라서, 소스 모양만 재면 갈래가 죽어도 초록일 수 있다(Ruling 11 과 같은 이유).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { stepSummary } from "../components/reel/StepStack.jsx";

const src = readFileSync("components/reel/StepStack.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("누적 작업대", () => {
  it("★★★ 단계 표를 **하나만** 본다 — 목록을 손으로 적지 않는다", () => {
    expect(code, "REEL_STEPS 를 안 읽는다").toMatch(/REEL_STEPS/);
    expect(code, "단계 이름을 화면에 손으로 적었다").not.toMatch(/["'`](시나리오|이미지 생성|영상 프롬프트)["'`]/);
  });

  it("★★★ 못 가는 단계는 열지 않는다 — 가드와 같은 판정을 쓴다", () => {
    expect(code, "isReelStepReachable 을 안 쓴다").toMatch(/isReelStepReachable\s*\(/);
    // 화면이 열림 조건을 **다시 만들면** 판정이 두 벌이 된다(가드가 닫는 문과 화면이 여는
    // 문이 갈리는 그 모양). 그래서 굽기 게이트도 컷 순회도 여기서는 못 쓴다.
    expect(code, "화면이 열림 조건을 다시 만든다 — 판정이 두 벌이 된다")
      .not.toMatch(/canBakeReel|isPromptsReady/);
  });

  it("★★ 지금 단계에만 children 을 꽂는다 — 끝난 단계는 접힌 머리줄뿐", () => {
    expect(code, "children 을 안 받는다").toMatch(/\{\s*children\s*\}/);
    expect(code, "현재 단계 판정을 안 쓴다").toMatch(/currentReelStepKey|reelStepFromPathname/);
    // children 을 꽂는 자리가 둘이면 단계 페이지가 두 번 그려진다(폴링도 두 벌이 된다).
    // ★ 매개변수 `({ children })` 도 글자 모양이 같다 — **그리는 자리**만 잘라서 센다.
    const jsx = code.slice(code.lastIndexOf("return ("));
    expect([...jsx.matchAll(/\{\s*children\s*\}/g)].length, "children 을 여러 자리에 꽂는다").toBe(1);
  });

  it("끝난 단계는 그 단계 주소로 간다", () => {
    expect(code, "reelStepHref 를 안 쓴다").toMatch(/reelStepHref\s*\(/);
  });

  it("★★★ 링크는 **갈 수 있는 단계에만** 붙는다 — 못 가는 줄을 눌러도 되돌려진다", () => {
    // 링크를 무조건 그리면 사장님이 아직 못 여는 단계를 눌러 들어가고, 레이아웃 가드가
    // 조용히 되돌린다 — 눌렀는데 아무 일도 안 난 것처럼 보인다.
    const links = [...code.matchAll(/<Link[\s>]/g)].length;
    expect(links, "링크를 그리는 자리가 하나가 아니다").toBe(1);
    // ★ `reachable` 이라는 **낱말이 어딘가 있다**로 재면 안 된다. 클래스 이름을 짓는
    //   `${reachable ? "" : " is-todo"}` 한 줄이 그 단정을 영원히 통과시킨다 — 실제로
    //   갈래를 `true ?` 로 갈아 봤는데 판이 그대로 초록이었다(2026-09-14 변이 실측).
    //   그래서 **링크 바로 앞의 갈래**인지까지 잰다.
    expect(code, "도달 판정이 링크 갈래를 안 가른다").toMatch(/reachable\s*\?[\s\S]{0,120}?<Link/);
  });

  // ★★★ 사장님 규칙 — 값·크레딧은 ⑤영상에서만 말한다(tests/reel-ui.test.js 의 같은 단정).
  //   이 틀은 ①~⑥ 어느 단계에서나 서 있어서, 여기서 값을 말하면 "돈이 나가는 자리는 ⑤
  //   하나"라는 신호가 통째로 흐려진다.
  it("★★★ 값을 말하지 않는다 — 가격표를 import 하지도 않는다", () => {
    expect(code, "화면이 값을 말한다").not.toContain("크레딧");
    expect(code, "가격표를 끌어왔다").not.toMatch(/lib\/pricing/);
    expect(code, "가격 문구 만들기를 끌어왔다").not.toContain("priceLabel");
    expect(code, "정가 계산을 끌어왔다").not.toContain("videoPrice");
  });

  it("규칙: 색·치수는 토큰이다", () => {
    const at = css.indexOf(".rs-stack");
    expect(at, ".rs-stack 규칙이 없다").toBeGreaterThan(-1);
    // ★★ **끝 표식까지만** 자른다(설정 패널 판과 같은 관용구). app/globals.css 는 여러
    //   세션이 끝에 덧붙이는 파일이라, 파일 끝까지 재면 남이 뒤에 붙인 hex 가 이 판을
    //   빨갛게 만들고 메시지는 엉뚱하게 내 블록을 가리킨다.
    const rest = css.slice(at);
    const end = rest.indexOf("/* ──");
    expect(end, "블록 끝 표식이 없다 — 경계가 없으면 남의 CSS 까지 재게 된다").toBeGreaterThan(-1);
    const rules = rest.slice(0, end);
    expect(rules, "hex 를 적었다").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // 앱층에서 액센트는 사이드바 스테퍼의 몫이다 — 지금 단계 강조는 --ink 계열로 한다.
    expect(rules, "앱층에서 액센트를 썼다").not.toMatch(/var\(--accent/);
    // --ink-faint 는 :root 에 **없는** 토큰이다. 쓰면 오류 없이 상속색으로 그려져
    // "회색으로 적었는데 검게 나오는" 자리가 된다.
    expect(rules, "없는 토큰을 썼다 — --ink-soft 다").not.toMatch(/--ink-faint/);
  });

  it("★★ 지금 단계 자리는 카드를 또 그리지 않는다 — 단계 페이지가 스스로 .panel 이다", () => {
    // app/reel/[id]/*/page.js 여섯이 전부 `<section className="panel panel--wide">` 다.
    // 여기서 또 면을 깔면 카드 안에 카드가 앉아 테두리가 두 겹이 된다.
    const at = css.indexOf(".rs-card.is-open");
    expect(at, ".rs-card.is-open 규칙이 없다").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule, "펼친 자리가 그림자를 지우지 않는다").toMatch(/box-shadow:\s*none/);
    // ★ `is-open` 과 `is-todo` 는 따로 붙어서 **둘이 같이 설 수 있다**(주소가 아직 못
    //   여는 단계를 가리키는 순간). 그때 .is-todo 의 opacity 가 살아남으면 펼쳐진 단계
    //   페이지가 통째로 흐려진다 — 가드가 되돌리기 전 한 프레임이라도 그렇게 보인다.
    expect(rule, "펼친 자리가 흐림을 되돌리지 않는다").toMatch(/opacity:\s*1/);
  });

  it("★★ 아직 못 여는 단계에는 요약을 안 붙인다 — 「컷 0/3」이 '멎었다'로 읽힌다", () => {
    // 흐린 줄은 **앞으로 남은 것**만 말한다. 거기에 0 을 달면 "아직 못 연다"가
    // "0개 만들었다"로 읽혀 진행이 멎은 것처럼 보인다.
    expect(code, "요약이 도달 판정을 안 본다").toMatch(/!open\s*&&\s*reachable\s*&&/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 접힌 머리줄의 한 줄 요약 — **문서에서 파생한다.**
//
// 새 저장 값을 만들면 그 값이 문서와 갈리는 날이 오고, 갈린 쪽은 아무도 못 고친다.
// 그래서 요약은 저장하지 않고 **그릴 때마다 문서에서 만든다** — 이 갈래를 값으로 잰다.
// ────────────────────────────────────────────────────────────────────────
describe("접힌 요약은 문서에서 파생한다", () => {
  const 문서 = {
    material: { text: "동네 정육점 20년, 손님이 줄 서는 이유", photos: [{ url: "a" }, { url: "b" }] },
    scenario: { text: "장면 1 …" },
    cuts: [
      { image: { url: "i1" }, clip_prompt: "걸어간다", video: { url: "v1" } },
      { image: { url: "i2" }, clip_prompt: "돌아본다" },
      { clip_prompt: "" },
    ],
  };

  it("①입력 — 사장님이 쓴 글과 올린 사진 수가 보인다", () => {
    const s = stepSummary("material", 문서);
    expect(s, "사장님이 쓴 글이 안 보인다").toContain("동네 정육점");
    // ★★★ **파생 문구를 통째로** 잰다. 숫자 하나만 재면 검체 글의 "20년" 이 그 단정을
    //   영원히 통과시킨다 — 사진 갈래를 통째로 지워도 초록이었다(2026-09-14 변이 실측,
    //   §링크 갈래와 같은 병이다). 문구를 통째로 재면 조각을 잇는 갈래까지 함께 문다.
    expect(s, "사진 수가 안 보인다").toContain("사진 2장");
  });

  it("★ 사진이 없으면 그 조각을 **떨어뜨린다** — 빈 자리가 구분점으로 남으면 안 된다", () => {
    const s = stepSummary("material", { material: { text: "글만 있다" } });
    expect(s, "빈 조각이 구분점을 달고 남았다").toBe("글만 있다");
  });

  it("②시나리오 — 장면 수는 컷에서 센다", () => {
    expect(stepSummary("scenario", 문서), "컷 수에서 안 센다").toContain("3");
  });

  it("③이미지 — 그린 컷과 전체를 함께 센다", () => {
    const s = stepSummary("images", 문서);
    expect(s, "그린 컷 수가 틀리다").toContain("2");
    expect(s, "전체 컷 수가 안 보인다").toContain("3");
  });

  it("★ 빈 문서에서도 던지지 않는다 — 요약 한 줄 때문에 화면이 죽으면 안 된다", () => {
    for (const 빈것 of [undefined, null, {}, { cuts: [] }]) {
      for (const step of ["material", "scenario", "images", "prompts", "video", "done"]) {
        expect(() => stepSummary(step, 빈것), `${step} 가 빈 문서에서 던진다`).not.toThrow();
      }
    }
  });

  it("★★ 문서를 고치지 않는다 — 요약은 읽기만 한다", () => {
    const 언것 = Object.freeze({ ...문서, cuts: Object.freeze([...문서.cuts]) });
    for (const step of ["material", "scenario", "images", "prompts", "video", "done"]) {
      expect(() => stepSummary(step, 언것), `${step} 가 문서에 쓴다`).not.toThrow();
    }
  });

  it("모르는 단계는 빈 줄이다 — 없는 말을 지어내지 않는다", () => {
    expect(stepSummary("없는단계", 문서)).toBe("");
  });
});
