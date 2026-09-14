// 화면이 움직임 세 축을 **축별로** 보여 주는가 — 소스에서 배선을 판정한다.
//
// 이 저장소에 React 렌더 테스트가 없다(resolution-ui·staleness-ui·credits-ui 와 같은 방식).
// ⚠️ 그래서 이 파일은 **컴파일을 안 한다** — 화면을 손대면 반드시
//    `SHOTFORM_DIST_DIR=.next-verify npx next build` 로 한 번 굽는다.
//
// ★ 왜 화면인가: 사장님이 못 읽으면 고칠 수도 없다. 세 축이 클립 프롬프트를 만드는데
//   화면이 옛 `motion` 하나만 보여 주면, 고친 것과 실제로 만들어지는 것이 갈린다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { MOTION_AXES } from "../lib/motion.js";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p) => strip(readFileSync(p, "utf8"));

const cuts = read("lib/cuts.js");
const archive = read("app/archive/[id]/page.js");

// ★ ②대본 화면을 재던 묶음은 지웠다(2026-08-16) — 그 화면이 원고와 함께 사라졌다.
// 단계별 흐름에서 컷의 움직임을 그리던 마지막 화면(보관함 상세)도 2026-09-14 에 그 표를 걷었다(아래 묶음).
// 남긴 것은 화면이 아니라 **라우트**를 재는 것 하나다 — 축 이름이 두 벌이 되지 않게 하는 그물이라
// 화면과 생멸을 같이 하지 않는다.
describe("컷 수정 라우트 — 움직임 세 축", () => {
  it("★ 라우트의 컷 허용 목록이 MOTION_AXES 에서 파생된다 — 축 이름이 두 벌이 되지 않는다", () => {
    // 손으로 적으면 목록에서 축 한 줄을 빼도 이 문만 계속 열려 있다(되돌리기가 안 된다).
    // 값이 실제로 저장되는가는 tests/routes.test.js 가 라우트를 통과시켜 잰다 —
    // 여기는 **어디서 이름을 파는가**만 본다.
    const route = read("app/api/projects/[id]/route.js");
    expect(route).toMatch(/import\s*\{[^}]*\bMOTION_AXES\b[^}]*\}\s*from\s*["'][^"']*lib\/motion/);
    expect(route).toMatch(/for\s*\(const key of\s*\[[^\]]*MOTION_AXES/);
    for (const a of MOTION_AXES) {
      expect(route, `축 id("${a.id}")를 라우트에 박았다 — MOTION_AXES 에서 파생시켜라`)
        .not.toMatch(new RegExp(`["'\`]${a.id}["'\`]`));
    }
  });

});

// 보관함 상세 — **일곱째 자리**였다(최종 리뷰 I-1).
// 클립 프롬프트는 축으로 만들어지는데 화면은 옛 motion 을 "움직임"으로 적어서, 축을
// axesOf 로 받아 MOTION_AXES 의 label 로 그리게 못 박았었다.
// ★★ 2026-09-14 — **그 표를 통째로 걷었다**(사장님 지시: 사용자에게 불필요한 정보 제거).
//   컷별 지시(문장·화면·움직임)는 모델에게 넘긴 글이라 손님이 읽을 것이 아니었다.
//   묶음을 조용히 지우지 않고 **돌아오지 않는가**만 잰다 — 돌아온다면 위 어긋남(옛 motion 을
//   적는 것)부터 다시 막아야 한다. axesOf·buildClipPrompt 자체는 lib 테스트가 잰다.
describe("보관함 상세 — 움직임 표가 없다 (2026-09-14)", () => {
  it("컷의 움직임(축·옛 motion·폴백)을 그리지 않는다", () => {
    expect(archive, "축 렌더가 돌아왔다").not.toMatch(/axesOf\(\s*c\s*\)/);
    expect(archive, "옛 motion 을 그린다").not.toMatch(/c\.motion/);
    expect(archive).not.toContain("거의 정지");
    expect(archive).not.toMatch(/<b>움직임<\/b>/);
    for (const a of MOTION_AXES) {
      expect(archive, `축 이름("${a.label}")이 보관함에 돌아왔다`)
        .not.toMatch(new RegExp(`>\\s*${a.label}\\s*<`));
    }
  });
});

// 화면 말고 **사람이 읽는 자리**가 하나 더 있다 — 두 모델을 나란히 비교하는 측정 스크립트가
// 프롬프트를 buildClipPrompt(축)로 만들면서 머리말에는 옛 motion 을 적었다. 유료 비교인데
// 머리말이 실제로 보낸 지시와 다르면 결과를 잘못 읽는다(보관함과 같은 종류의 어긋남이다).
describe("측정 — 두 모델 비교의 머리말", () => {
  const cmp = read("scripts/measure/compare-clip-models.mjs");
  it("축을 lib/motion 에서 파서 적는다 — 축 이름을 손으로 적지 않는다", () => {
    expect(cmp).toMatch(/import\s*\{[^}]*\baxesOf\b[^}]*\}\s*from\s*["'][^"']*lib\/motion\.js["']/);
    expect(cmp).toMatch(/axesOf\(\s*cut\s*\)/);
    expect(cmp).toMatch(/motionAxisFor\([\s\S]{0,40}?\)[\s\S]{0,20}?\.label/);
    for (const a of MOTION_AXES) {
      expect(cmp, `축 id("${a.id}")를 측정 스크립트에 박았다`)
        .not.toMatch(new RegExp(`["'\`]${a.id}["'\`]`));
    }
  });
});
