// 걸음 띠 — 단계 여섯이 **화면 위에 한 줄로** 서고, 지금 단계 내용은 그 아래에 온다.
//
// ★ 왜 바꿨나(2026-09-14 밤, 사장님 지적): 쌓기 구조에서는 펼친 단계가 곧 주소라
//   ③처럼 긴 단계를 열면 ④⑤⑥ 줄이 그 내용 아래로 밀려났다. 다음 단계로 가려면
//   지금 단계를 끝까지 스크롤해야 했다 — 길잡이가 내용에 파묻히는 모양이다.
//   띠는 **늘 위에 붙어 있어서**(sticky) 어디까지 내려가 있든 한 번에 옮겨 간다.
//   이 파일은 옛 tests/reel-step-stack-ui.test.js 를 대체한다 — 살아남는 계약은
//   전부 여기로 옮겼고, 「펼친 줄」에만 있던 것(카드 안 카드·라벨 감추기)만 걷었다.
//
// ★ 재는 방식은 이 저장소의 관용구를 따른다 — 렌더 인프라가 없어 **소스 문자열**과
//   **CSS 파서**로 잰다. 다만 부품을 실제로 import 해서, 파일이 파싱조차 안 되면
//   이 판이 수집 단계에서 먼저 빨개지게 한다. 덤으로 요약(stepSummary)은 모양이 아니라
//   **값**으로 잰다: 요구가 "문서에서 파생한다"라서, 소스 모양만 재면 갈래가 죽어도
//   초록일 수 있다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { stepSummary } from "../components/reel/StepStack.jsx";

const src = readFileSync("components/reel/StepStack.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// ★★★ 내 CSS 블록을 **파서처럼** 읽는다(주석을 걷고 규칙으로 쪼갠다). 날 것 소스에서
//   글자를 찾으면 **주석 안의 글자**에도 맞아, 규칙이 죽어 있어도 초록이 된다 —
//   2026-09-14 에 실제로 그랬다(주석 누수로 규칙 하나가 첫 커밋부터 죽어 있었다).
function blockRules() {
  const at = css.indexOf(".rs-strip");
  if (at < 0) return [];
  const rest = css.slice(at);
  const end = rest.indexOf("/* ──");
  if (end < 0) return [];
  const body = rest.slice(0, end).replace(/\/\*[\s\S]*?\*\//g, "");
  return [...body.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    sel: m[1].trim().replace(/\s+/g, " "),
    body: m[2],
  }));
}
const rule = (sel) => blockRules().find((r) => r.sel === sel);

describe("걸음 띠 — 가로 한 줄", () => {
  it("★★★ 띠는 **가로**로 선다 — 세로로 쌓이면 옛 구조로 되돌아간 것이다", () => {
    const r = rule(".rs-strip");
    expect(r, ".rs-strip 규칙이 파서에 안 보인다").toBeTruthy();
    expect(r.body, "띠가 배치를 안 정한다").toMatch(/display:\s*flex/);
    // ★ `flex-direction` 을 안 적으면 기본값이 row 라 가로다. 적었는데 column 이면
    //   줄이 세로로 쌓여 **내용이 다시 띠를 밀어낸다** — 그것만 막는다.
    expect(r.body, "띠가 세로로 쌓인다 — 가로여야 한다").not.toMatch(/flex-direction:\s*column/);
  });

  it("★★★ 띠는 스크롤해도 **위에 붙어 있다** — 이게 이 개편의 전부다", () => {
    const r = rule(".rs-strip");
    expect(r, ".rs-strip 규칙이 파서에 안 보인다").toBeTruthy();
    expect(r.body, "띠가 안 붙는다 — 내용이 길면 다시 스크롤해야 단계가 보인다")
      .toMatch(/position:\s*sticky/);
    // sticky 는 top 이 없으면 **아무 데도 안 붙는다**(조용히 static 처럼 흐른다).
    expect(r.body, "sticky 인데 top 이 없다 — 붙을 자리를 안 정했다").toMatch(/top:/);
    // 띠 뒤로 내용이 비쳐 지나가면 글자가 겹쳐 읽힌다.
    expect(r.body, "띠에 바탕이 없다 — 지나가는 내용이 글자에 겹친다").toMatch(/background:/);
  });

  // ★★★ 앱 껍데기의 상단 벨트(.belt)가 이미 `top: 0` · 높이 42px 로 붙어 있다.
  //   띠를 0 에 붙이면 **벨트 밑으로 숨는다** — 붙긴 붙었는데 안 보이는, 가장 알아채기
  //   어려운 실패다. 그래서 두 수를 **같은 판에서** 묶어 잰다: 벨트가 높아지면 이 판이
  //   빨개져서 띠도 함께 내리라고 말해 준다.
  it("★★★ 띠는 상단 벨트 **아래**에 붙는다 — 0 이면 벨트에 가려 안 보인다", () => {
    const belt = css.slice(css.indexOf(".belt {"));
    const beltH = /height:\s*(\d+)px/.exec(belt.slice(0, belt.indexOf("}")));
    expect(beltH, "벨트 높이를 못 읽었다 — 이름이나 단위가 바뀌었다").toBeTruthy();
    const top = /top:\s*(\d+)(?:px)?/.exec(rule(".rs-strip").body);
    expect(top, "띠의 top 을 못 읽었다").toBeTruthy();
    expect(top[1], `띠가 벨트(${beltH[1]}px) 밑으로 숨는다`).toBe(beltH[1]);
    // 겹침 순서도 함께 — 띠가 벨트보다 위에 서면 띠가 벨트를 덮고 지나간다.
    const beltZ = Number(/z-index:\s*(\d+)/.exec(belt.slice(0, belt.indexOf("}")))?.[1]);
    const stripZ = Number(/z-index:\s*(\d+)/.exec(rule(".rs-strip").body)?.[1]);
    expect(stripZ, "띠에 겹침 순서가 없다").toBeGreaterThan(0);
    expect(stripZ, "띠가 벨트를 덮는다").toBeLessThan(beltZ);
  });

  // ★★★ 2026-09-15 — 이 자리에는 "children 이 띠를 **닫은 뒤**에 온다"를 재는 판이
  //   있었다. 그때는 이 부품이 띠와 본문을 함께 그렸기 때문이다. 지금은 띠가 격자
  //   **밖·위**로 나가면서 이 부품이 `children` 을 **아예 안 받는다** — 섞일 자리가
  //   구조적으로 사라졌다. 그래서 순서가 아니라 **그 사실 자체**를 못 박는다.
  //   (어디에 서는가는 tests/reel-workbench-layout.test.js 가 잰다.)
  it("★★★ 띠는 본문을 품지 않는다 — 품는 순간 단계 내용이 줄 사이에 낀다", () => {
    const at = code.indexOf("export function ReelStepStrip");
    expect(at, "띠 출구가 없다").toBeGreaterThan(-1);
    const sig = code.slice(at, code.indexOf(")", at) + 1);
    expect(sig, "띠가 children 을 받는다 — 본문이 띠 안으로 들어올 수 있다").not.toContain("children");
    const body = code.slice(at, code.indexOf("\n}", at));
    expect(body, "띠가 본문을 그린다").not.toMatch(/\{\s*children\s*\}/);
    expect(body, "띠 겉틀을 안 그린다").toContain("rs-strip");
  });

  // ★★★ 2026-09-14 낮에 이 자리에서 캐스케이드로 데었다 — `.is-open { opacity: 1 }` 로
  //   흐림을 되돌리려 했는데 특이도가 같아(0,2,0) 소스상 뒤가 이겨 **효력 0 인 채
  //   초록**이었다. 그래서 이제 **선언이 있는지가 아니라 누가 쥐고 있는지**를 잰다.
  it("★★★ 지금 서 있는 줄은 흐려지지 않는다 — 흐림은 규칙 하나가 쥔다", () => {
    const rules = blockRules();
    expect(rules.length, "블록을 못 읽었다 — 표식이나 이름이 바뀌었다").toBeGreaterThan(0);
    const dimmers = rules.filter((r) => /opacity:/.test(r.body)).map((r) => r.sel);
    expect(dimmers, "흐림은 규칙 하나가 쥐고, 그 선택자가 지금 줄을 비켜 가야 한다")
      .toEqual([".rs-step.is-todo:not(.is-now)"]);
  });

  // ★★★ 2026-09-14 밤 브라우저 실측 — ①입력의 요약(사장님이 쓴 글 40자)이 알약을
  //   통째로 늘려 **띠가 두 줄이 됐다.** 쌓기 시절에는 줄이 화면 폭을 다 썼으니 안 보이던
  //   문제다. 띠에서는 요약이 **길잡이를 밀어내면 안 된다** — 이름이 먼저다.
  it("★★★ 요약은 폭 상한이 있다 — 없으면 긴 요약 하나가 띠를 두 줄로 민다", () => {
    const r = rule(".rs-sum");
    expect(r, ".rs-sum 규칙이 파서에 안 보인다").toBeTruthy();
    expect(r.body, "요약에 폭 상한이 없다 — 알약이 이름을 밀어낸다").toMatch(/max-width:/);
    // 상한만 있고 안 자르면 넘쳐서 옆 알약을 덮는다 — 셋이 한 벌이다.
    expect(r.body, "넘친 요약을 안 자른다").toMatch(/overflow:\s*hidden/);
    expect(r.body, "잘린 자리를 안 알려 준다").toMatch(/text-overflow:\s*ellipsis/);
  });

  // ★★★ 2026-09-14 밤 사장님 지시 — "상단 단계에 선택시 언더라인 안생기게".
  //   옛 쌓기의 머리줄 관용구(`a.rs-hd:hover .rs-lab { underline }`)를 그대로 가져왔던 것인데,
  //   줄이 **알약**이 되면서 안 맞게 됐다: 면과 테두리가 이미 "눌러도 된다"를 말하는데
  //   그 위에 밑줄이 뜨면 같은 자리가 버튼과 링크 글씨 **둘로** 읽힌다.
  it("★★★ 밑줄을 그리지 않는다 — 알약 위의 밑줄은 모양을 둘로 가른다", () => {
    const rules = blockRules();
    const 밑줄 = rules.filter((r) => /text-decoration:\s*underline/.test(r.body)).map((r) => r.sel);
    expect(밑줄, "띠에 밑줄을 그리는 규칙이 있다").toEqual([]);
    // ★ 밑줄을 뺐으면 **다른 응답**이 있어야 한다 — 아무 반응도 없으면 눌러도 되는
    //   자리인지 손이 모른다. 밑줄을 지우는 김에 응답까지 지우는 것이 흔한 실수다.
    const hover = rules.filter((r) => r.sel.includes(":hover"));
    expect(hover.length, "밑줄도 없고 손을 올렸을 때 아무 반응도 없다").toBeGreaterThan(0);
    // ★★ 지금 서 있는 줄은 **비켜 간다.** 색을 뒤집어 둔 자리라 손이 지나갈 때마다
    //   또 바뀌면 "지금 여기"라는 신호가 흔들린다. 캐스케이드로 겨루지 않고
    //   조건을 선택자에 넣는다(이 파일의 흐림 규칙과 같은 관용구).
    for (const r of hover) {
      expect(r.sel, `hover 가 지금 줄까지 건드린다: ${r.sel}`).toContain(":not(.is-now)");
    }
  });

  // ★★★ 2026-09-15 사장님 지적 — 「⑥완성만 그냥 텍스트로 보인다」.
  //   아직 못 가는 줄에서 `background: none` 과 `box-shadow: none` 을 **둘 다** 걷어
  //   알약 모양 자체가 사라졌다. 흐린 것과 **없는 것**은 다른 말인데, 그렇게 두면
  //   여섯 줄 중 하나만 다른 물건처럼 읽힌다.
  //   ★ 흐리게 하는 일은 opacity 하나가 맡는다 — 면은 그대로 둔다.
  it("★★★ 아직 못 가는 줄도 **알약 모양을 잃지 않는다** — 흐릴 뿐이다", () => {
    const r = rule(".rs-step.is-todo:not(.is-now)");
    expect(r, "잠긴 줄 규칙이 파서에 안 보인다").toBeTruthy();
    expect(r.body, "잠긴 줄이 흐려지지 않는다").toMatch(/opacity:/);
    expect(r.body, "잠긴 줄이 면을 잃는다 — 글자만 떠 보인다").not.toMatch(/background:\s*none/);
    expect(r.body, "잠긴 줄이 테두리를 잃는다 — 글자만 떠 보인다").not.toMatch(/box-shadow:\s*none/);
  });

  it("★★★ 주석이 선택자로 새지 않는다 — 새면 바로 아래 규칙이 통째로 죽는다", () => {
    // 2026-09-14 실측: 주석 안의 경로에 있던 별표와 빗금이 주석을 일찍 닫았고,
    // 남은 한국어가 다음 규칙의 선택자에 붙어 그 규칙이 **첫 커밋부터 죽어 있었다.**
    for (const r of blockRules()) {
      expect(r.sel, `주석이 선택자로 샜다 — 이 규칙은 죽는다: ${r.sel.slice(0, 70)}`)
        .not.toMatch(/[가-힣]/);
    }
  });
});

describe("걸음 띠 — 지키던 계약은 그대로다", () => {
  it("★★★ 단계 표를 **하나만** 본다 — 목록을 손으로 적지 않는다", () => {
    expect(code, "REEL_STEPS 를 안 읽는다").toMatch(/REEL_STEPS/);
    expect(code, "단계 이름을 화면에 손으로 적었다")
      .not.toMatch(/["'`](시나리오|이미지 생성|영상 프롬프트)["'`]/);
  });

  it("★★★ 못 가는 단계는 열지 않는다 — 가드와 같은 판정을 쓴다", () => {
    expect(code, "isReelStepReachable 을 안 쓴다").toMatch(/isReelStepReachable\s*\(/);
    // 화면이 열림 조건을 **다시 만들면** 판정이 두 벌이 된다(가드가 닫는 문과 화면이
    // 여는 문이 갈리는 그 모양). 그래서 굽기 게이트도 컷 순회도 여기서는 못 쓴다.
    expect(code, "화면이 열림 조건을 다시 만든다 — 판정이 두 벌이 된다")
      .not.toMatch(/canBakeReel|isPromptsReady/);
  });

  it("★★ 지금 단계는 **주소가 먼저** 정한다", () => {
    expect(code, "현재 단계 판정을 안 쓴다").toMatch(/currentReelStepKey|reelStepFromPathname/);
  });

  it("다른 단계는 그 단계 주소로 간다", () => {
    expect(code, "reelStepHref 를 안 쓴다").toMatch(/reelStepHref\s*\(/);
  });

  it("★★★ 링크는 **갈 수 있는 단계에만** 붙는다 — 못 가는 줄을 눌러도 되돌려진다", () => {
    const links = [...code.matchAll(/<Link[\s>]/g)].length;
    expect(links, "링크를 그리는 자리가 하나가 아니다").toBe(1);
    // ★ `reachable` 이라는 낱말이 어딘가 있다로 재면 안 된다 — 클래스 이름을 짓는
    //   삼항 한 줄이 그 단정을 영원히 통과시킨다(2026-09-14 변이 실측).
    expect(code, "도달 판정이 링크 갈래를 안 가른다").toMatch(/reachable\s*\?[\s\S]{0,160}?<Link/);
  });

  it("★★ 아직 못 여는 단계에는 요약을 안 붙인다 — 「컷 0/3」이 '멎었다'로 읽힌다", () => {
    // 흐린 줄은 **앞으로 남은 것**만 말한다. 거기에 0 을 달면 "아직 못 연다"가
    // "0개 만들었다"로 읽혀 진행이 멎은 것처럼 보인다.
    // ★ 링크 판과 같은 관용구 — 낱말이 어딘가 있다가 아니라 그 갈래가 **요약을
    //   감싸는지**까지 묶는다.
    expect(code, "요약이 도달 판정을 안 본다").toMatch(/!now\s*&&\s*reachable\s*&&[\s\S]{0,60}?rs-sum/);
  });

  it("★★★ 값을 말하지 않는다 — 가격표를 import 하지도 않는다", () => {
    expect(code, "화면이 값을 말한다").not.toContain("크레딧");
    expect(code, "가격표를 끌어왔다").not.toMatch(/lib\/pricing/);
    expect(code, "가격 문구 만들기를 끌어왔다").not.toContain("priceLabel");
    expect(code, "정가 계산을 끌어왔다").not.toContain("videoPrice");
  });

  it("규칙: 색·치수는 토큰이다", () => {
    const at = css.indexOf(".rs-strip");
    expect(at, ".rs-strip 규칙이 없다").toBeGreaterThan(-1);
    // ★★ **끝 표식까지만** 자른다. app/globals.css 는 여러 세션이 끝에 덧붙이는
    //   파일이라, 파일 끝까지 재면 남이 뒤에 붙인 hex 가 이 판을 빨갛게 만들고
    //   메시지는 엉뚱하게 내 블록을 가리킨다.
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
});

// ────────────────────────────────────────────────────────────────────────
// 줄의 한 줄 요약 — **문서에서 파생한다.**
//
// 새 저장 값을 만들면 그 값이 문서와 갈리는 날이 오고, 갈린 쪽은 아무도 못 고친다.
// 그래서 요약은 저장하지 않고 **그릴 때마다 문서에서 만든다** — 이 갈래를 값으로 잰다.
// ────────────────────────────────────────────────────────────────────────
describe("요약은 문서에서 파생한다", () => {
  const 문서 = {
    material: { text: "동네 정육점 20년, 손님이 줄 서는 이유", photos: [{ url: "a" }, { url: "b" }] },
    scenario: { text: "장면 1 …" },
    cuts: [
      { image: { url: "i1" }, clip_prompt: "걸어간다", video: { url: "v1" } },
      { image: { url: "i2" }, clip_prompt: "돌아본다" },
      { clip_prompt: "" },
    ],
  };

  // ★★★ 2026-09-14 밤 — ①입력의 요약에서 **자료 글 앞머리를 걷었다**(사장님 지시).
  //   쌓기 시절에는 줄이 화면 폭을 다 써서 40자가 그대로 보였는데, 띠로 옮기면서 자리가
  //   1/4 로 줄었다(폭 상한 11ch). 1,583자짜리 콘티가 「아래는 이미 하…」로 잘려
  //   **아무것도 말하지 않는 줄**이 됐다.
  //   ★ 나머지 다섯은 전부 **수**다(장면 4개 · 컷 4/4). ①만 글 조각이라 어법도 혼자 달랐다.
  //     자료 글은 ①을 눌러 들어가면 통째로 보인다 — 띠는 길잡이지 내용을 보여 주는 자리가 아니다.
  it("①입력 — 올린 사진 수만 말한다", () => {
    expect(stepSummary("material", 문서)).toBe("사진 2장");
  });

  it("★ 사진이 없으면 **빈 줄**이다 — 자료 글로 자리를 채우지 않는다", () => {
    expect(stepSummary("material", { material: { text: "글만 있다" } })).toBe("");
  });

  it("②시나리오 — 장면 수는 컷에서 센다", () => {
    expect(stepSummary("scenario", 문서)).toBe("장면 3개");
  });

  it("③이미지 — 그린 컷과 전체를 함께 센다", () => {
    expect(stepSummary("images", 문서)).toBe("컷 2/3");
    expect(stepSummary("prompts", 문서)).toBe("컷 2/3");
    expect(stepSummary("video", 문서)).toBe("컷 1/3");
  });

  it("★ 빈 문서에서도 던지지 않는다 — 요약 한 줄 때문에 화면이 죽으면 안 된다", () => {
    for (const key of ["material", "scenario", "images", "prompts", "video", "done"]) {
      expect(() => stepSummary(key, null)).not.toThrow();
      expect(stepSummary(key, {}), `${key} 가 없는 말을 지어냈다`).toBe("");
    }
  });

  it("★★ 문서를 고치지 않는다 — 요약은 읽기만 한다", () => {
    const 사본 = JSON.parse(JSON.stringify(문서));
    for (const key of ["material", "scenario", "images", "prompts", "video", "done"]) stepSummary(key, 사본);
    expect(사본).toEqual(문서);
  });

  it("모르는 단계는 빈 줄이다 — 없는 말을 지어내지 않는다", () => {
    expect(stepSummary("없는단계", 문서)).toBe("");
  });
});
