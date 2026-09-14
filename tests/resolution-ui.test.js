// 화질(해상도) 선택 화면 — 소스에서 배선을 판정한다.
// 이 저장소에 React 렌더 테스트가 없다(credits-ui·staleness-ui·quick-create-ui 와 같은 방식).
//
// ★ 왜 앞쪽 화면인가: 정가는 ③목소리에서 걷힌다. 화질이 값을 바꾸므로(720p 160 vs 1080p 360)
//   고르는 자리는 반드시 **결제 앞**이어야 한다. 모델 칩이 ⑤에 있어 사고가 났던 전례가
//   CLAUDE.md 에 남아 있다. 그 자리는 ②대본이었고 그 화면은 2026-08-16 에 사라졌다
//   — 그래서 칩은 ①자료로 옮겼다(아래 묶음).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p) => strip(readFileSync(p, "utf8"));

const voice = read("app/create/[id]/voice/page.js");
const images = read("app/create/[id]/images/page.js");
const video = read("app/create/[id]/video/page.js");
const create = read("app/create/page.js");
const material = read("app/create/[id]/briefing/page.js");
const quick = read("components/QuickCreate.jsx");

// ★★ 두 번째 이사(2026-08-18, 사용자 지시) — 칩은 **첫 화면**(/create)으로 갔다.
//    ①자료에 있던 것이 첫 화면에서 이미 받은 값(길이·비율·모델·컨셉)을 **두 번 묻는**
//    자리였기 때문이다. 결제 앞이라는 원래 조건은 그대로 성립한다(만들기 전이 가장 앞이다).
//    바뀐 것이 하나 있다: 여기는 아직 프로젝트가 없어 **잠금(project.charged)이 없다.**
//    그 자리를 대신 지키는 못이 "모델을 바꾸면 그 모델에 없는 화질이 남지 않는다"다 —
//    잠금이 없는 대신, 고른 값이 모델과 어긋날 수 없어야 한다.
describe("첫 화면 — 화질 선택", () => {
  const script = create;
  it("화질 목록을 lib/clip-limits 에서 읽는다 — 화면이 해상도 문자열을 적지 않는다", () => {
    expect(script).toMatch(/resolutionsForModel\(model\)/);
    // 큰따옴표만 잡으면 작은따옴표·백틱·JSX 텍스트로 박아 넣고 빠져나간다.
    // (주석은 strip 이 먼저 걷어내므로 여기 남는 것은 전부 화면이 적은 값이다.)
    expect(script, "해상도 값을 화면에 박았다 — 모델이 여는 목록은 표가 안다")
      .not.toMatch(/['"`]\s*(480p|720p|1080p)\s*['"`]|>[^<>]*\b(480p|720p|1080p)\b/);
  });

  it("고를 수 있는 값이 없으면(Kling·LTX) 아무것도 안 그린다", () => {
    // "고를 수 있는 척"이 가장 나쁘다 — Kling 에는 resolution 파라미터가 아예 없어
    // 고른 순간 fal 이 거절한다. 그리는 자리가 목록 길이로 잠겨 있어야 한다.
    // ★ 문자열이 있는지만 보면 안 된다 — 안 쓰는 변수에 남겨 두고 칩을 무조건 그려도
    //   통과한다. 그 길이 판정 **뒤에 칩 그리기가 실제로 매달려 있는지**까지 묶어 잰다.
    expect(script).toMatch(/resolutions\.length\s*>\s*0\s*&&\s*\(?\s*<[\s\S]{0,800}?resolutions\.map\(/);
  });

  // ★ 잠금이 없는 자리의 유일한 방어선이다. 모델을 Seedance(1080p 있음) → Kling(없음) 으로
  //   바꿔도 1080p 가 상태에 남아 있으면, 그 값이 그대로 생성 요청에 실려 **400** 이거나
  //   (검증을 못 지나면) fal 이 거절하는 값으로 저장된다.
  it("★ 모델을 바꾸면 그 모델에 없는 화질은 남지 않는다", () => {
    const fn = script.match(/function pickModel\([\s\S]*?\n  \}/)?.[0] || "";
    expect(fn, "모델 고르기를 함수로 두지 않아 화질을 함께 못 맞춘다").toBeTruthy();
    expect(fn, "모델을 바꿀 때 화질 목록을 다시 안 본다").toMatch(/resolutionsForModel\(/);
    expect(fn, "모델에 없는 화질을 그대로 둔다").toMatch(/setResolution\(/);
  });

  it("칩마다 그 화질의 정가를 적는다 — 값이 달라지는 것이 고르는 이유다", () => {
    expect(script).toMatch(/videoPrice\([\s\S]{0,120}?\)/);
    // 셋째 인자로 그 칩의 해상도가 들어가야 한다. 안 넘기면 세 칩이 같은 값을 적는다.
    expect(script).toMatch(/videoPrice\(\s*seconds\s*,\s*model\s*,\s*r\s*\)/);
  });

  it("만들 때 고른 화질을 함께 보낸다 — 안 보내면 말없이 기본값이 된다", () => {
    const submit = script.match(/async function submit\([\s\S]*?\n  \}/)?.[0] || "";
    expect(submit, "submit 을 못 찾았다").toBeTruthy();
    expect(submit, "화질을 안 실어 보낸다").toMatch(/resolution/);
  });
});

// 화면에 적는 숫자와 실제로 깎이는 숫자가 갈리면 안 된다 — 1080p 를 고른 사장님이
// 160 을 보고 360 이 깎이는 것이 최악이다. 청구 경로는 T5 가 맞췄고, 여기는 표시 층이다.
describe("표시용 가격도 화질을 본다", () => {
  it("③목소리 정가", () => {
    expect(voice).toMatch(/videoPrice\([\s\S]{0,120}?resolutionForProject\(project\)/);
  });
  it("④이미지 정가", () => {
    expect(images).toMatch(/videoPrice\([\s\S]{0,160}?resolutionForProject\(project\)/);
  });
  it("⑤영상 클립 재생성 값", () => {
    expect(video).toMatch(/regenPrice\("clip"[\s\S]{0,160}?resolutionForProject\(project\)/);
  });

  // 프로젝트가 아직 없는 자리(자료 화면·빠른 생성)는 저장된 화질이 없다.
  // 그래도 기본값을 **명시**로 넘긴다 — 인자를 비우면 다음 사람이 "해상도를 안 보는 자리"로
  // 읽는다.
  // ★★ 2026-08-31 — 넘기는 값이 **전역 720p → 그 모델의 기본**으로 바뀌었다. 그전에는
  //   "값은 중립이다(생략도 720p 열로 떨어진다)" 가 참이었는데, 기본 모델이 H3 로 옮겨
  //   가면서 720p 는 **그 모델에 없는 값**이 됐다(768P·2K). 재는 것은 그대로다 —
  //   **명시로 넘기는가**.
  it("자료 화면은 그 모델의 기본 화질을 명시로 넘긴다", () => {
    expect(create).toMatch(/videoPrice\([\s\S]{0,80}?defaultResolutionForModel/);
  });
  it("빠른 생성도 그 모델의 기본 화질을 명시로 넘긴다", () => {
    const calls = quick.match(/videoPrice\([\s\S]{0,140}?\)/g) || [];
    expect(calls.length).toBe(2);
    for (const c of calls) expect(c).toMatch(/defaultResolutionForModel/);
  });
});
