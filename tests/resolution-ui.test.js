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

// 이사 완료(2026-08-16) — 칩은 **①자료**(create/[id]/briefing)로 갔다. ②시나리오가 아니라
// ①인 이유: 길이·비율·모델·화풍이 이미 거기 모여 있고, 잠금 기준이 결제라 ③목소리 앞이면
// 어디든 성립한다. 아래 여섯이 그 이사의 유일한 그물이다.
describe("①자료 — 화질 선택", () => {
  const script = material;
  it("화질 목록을 lib/clip-limits 에서 읽는다 — 화면이 해상도 문자열을 적지 않는다", () => {
    expect(script).toMatch(/resolutionsForProject\(project\)/);
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

  it("지금 고른 값은 resolutionForProject 로 읽는다 — 저장값을 직접 읽지 않는다", () => {
    // 저장값을 직접 읽으면 모델과 어긋난 옛 값(Seedance 1080p → Kling)이 그대로 켜진 것처럼
    // 보인다. resolutionForProject 는 그 자리에서 그 모델의 기본값으로 떨어뜨린다.
    expect(script).toMatch(/resolutionForProject\(project\)/);
    expect(script, "settings.resolution 을 화면이 직접 읽는다")
      .not.toMatch(/settings\?\.resolution/);
  });

  it("칩마다 그 화질의 정가를 적는다 — 값이 달라지는 것이 고르는 이유다", () => {
    expect(script).toMatch(/videoPrice\([\s\S]{0,120}?\)/);
    // 셋째 인자로 그 칩의 해상도가 들어가야 한다. 안 넘기면 세 칩이 같은 값을 적는다.
    expect(script).toMatch(/videoPrice\(\s*[^)]*settings\?\.target_seconds[\s\S]{0,80}?,\s*r\s*\)/);
  });

  it("정가를 낸 뒤에는 잠긴다 — 낸 값과 만드는 값이 어긋나지 않게", () => {
    // 판정은 서버가 장부에서 내려 준 project.charged 하나다(③목소리 화면과 같은 값).
    // 화면이 장부를 추측하지 않는다.
    expect(script).toMatch(/project\.charged/);
    expect(script, "잠겼는데 칩을 누를 수 있다").toMatch(/disabled=\{[^}]*Locked/);
  });

  it("PATCH 로 settings.resolution 을 저장한다 — 사이즈·컨셉과 같은 경로", () => {
    expect(script).toMatch(/settings:\s*\{\s*resolution\s*\}/);
    expect(script, "저장 실패를 삼킨다").toMatch(/화질을 저장하지 못했어요/);
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
  // 읽는다. 값은 중립이다(생략도 720p 열로 떨어진다).
  it("자료 화면은 기본 화질을 명시로 넘긴다", () => {
    expect(create).toMatch(/videoPrice\([\s\S]{0,80}?DEFAULT_RESOLUTION/);
  });
  it("빠른 생성도 기본 화질을 명시로 넘긴다", () => {
    const calls = quick.match(/videoPrice\([\s\S]{0,120}?\)/g) || [];
    expect(calls.length).toBe(2);
    for (const c of calls) expect(c).toMatch(/DEFAULT_RESOLUTION/);
  });
});
