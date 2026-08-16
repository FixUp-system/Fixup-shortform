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

// 보관함의 움직임 블록만 떼어낸다 — 같은 파일의 **광고 가지**가 `<b>카메라</b>` 를
// 손으로 적고 있는데(광고 shot 의 별개 필드 c.camera 다) 파일 전체에서 축 이름을 찾으면
// 그 자리가 걸린다. 재는 것은 "단계별 컷의 움직임을 무엇으로 그리는가" 하나다.
function motionBlockOf(src, why) {
  const m = src.match(/const axes = axesOf\(\s*c\s*\)[\s\S]*?^\s*\}\)\(\)\}/m);
  expect(m, why).toBeTruthy();
  return m[0];
}

// ★ ②대본 화면을 재던 묶음은 지웠다(2026-08-16) — 그 화면이 원고와 함께 사라졌다.
// 단계별 흐름에서 컷의 움직임을 그리는 화면은 지금 **보관함 상세 하나뿐이다**(아래 묶음).
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

// 보관함 상세 — **일곱째 자리**다(최종 리뷰 I-1).
// 계획이 화면을 "②대본" 하나로 잡아서 아무도 여기를 지목하지 않았다. 돈이 새지는 않지만
// (읽기 전용 화면이다) 만들어지는 것과 다른 값을 보여 준다: 클립 프롬프트는 축으로
// 만들어지는데 화면은 프롬프트가 **안 쓰는** 옛 motion 을 "움직임"으로 적었고,
// 축만 있고 motion 이 없는 컷에서는 움직임 줄이 **통째로 사라졌다**.
describe("보관함 상세 — 움직임 세 축", () => {
  it("화면이 lib/motion 을 직접 import 한다 — 축 목록이 두 벌이 되지 않는다", () => {
    expect(archive).toMatch(/import\s*\{[^}]*\baxesOf\b[^}]*\}\s*from\s*["'][^"']*lib\/motion["']/);
    expect(archive).toMatch(/import\s*\{[^}]*\bmotionAxisFor\b[^}]*\}\s*from\s*["'][^"']*lib\/motion["']/);
  });

  it("축을 axesOf 로 받아 하나씩 그린다", () => {
    expect(archive).toMatch(/axesOf\(\s*c\s*\)/);
    expect(archive).toMatch(/axesOf\(\s*c\s*\)[\s\S]{0,400}?\.map\(/);
  });

  it("이름표는 MOTION_AXES 의 label 에서 온다 — 화면이 축 이름을 손으로 적지 않는다", () => {
    expect(archive).toMatch(/motionAxisFor\([\s\S]{0,40}?\)[\s\S]{0,20}?\.label/);
    const block = motionBlockOf(archive, "보관함의 축 렌더 블록을 못 찾았다");
    for (const a of MOTION_AXES) {
      expect(block, `축 이름("${a.label}")을 보관함에 박았다 — MOTION_AXES 의 label 을 써라`)
        .not.toMatch(new RegExp(`>\\s*${a.label}\\s*<`));
      expect(block, `축 id("${a.id}")를 보관함에 박았다 — axesOf 가 주는 id 를 써라`)
        .not.toMatch(new RegExp(`["'\`]${a.id}["'\`]`));
    }
  });

  it("★ 보관함은 보는 화면이다 — 축에 편집 칸을 두지 않는다", () => {
    // 고치는 자리는 ②대본이다. 여기에 편집 칸을 두면 "값이 나가는 문 앞에 서지 않게 한다"는
    // 이 화면의 존재 이유가 흐려지고, 저장 경로도 여기엔 없다.
    const block = motionBlockOf(archive, "보관함의 축 렌더 블록을 못 찾았다");
    expect(block, "보관함 축에 편집 칸을 뒀다").not.toMatch(/contentEditable/);
    expect(block, "보관함 축에 저장 호출을 뒀다").not.toMatch(/saveCut|fetch\(/);
  });

  it("★ 순서가 buildClipPrompt 와 같다 — 축 → 옛 motion → 폴백", () => {
    expect(archive).toMatch(/axes\.length\s*[>!]/);
    expect(archive).toMatch(/c\.motion\s*\|\|\s*["']거의 정지/);
    const iAxes = archive.search(/const axes = axesOf\(\s*c\s*\)/);
    const iLen = archive.search(/axes\.length\s*[>!]/);
    const iMotion = archive.search(/c\.motion\s*\|\|\s*["']거의 정지/);
    expect(iAxes).toBeGreaterThan(-1);
    expect(iLen, "축 판정이 axesOf 뒤여야 한다").toBeGreaterThan(iAxes);
    expect(iMotion, "옛 motion 이 축 판정보다 앞에 있다 — 축이 영영 안 보인다")
      .toBeGreaterThan(iLen);
    // ★ 옛 motion 만 조건부로 그리던 자리가 남아 있으면 안 된다 — 그 모양이면 축을 가진
    //   컷에서 프롬프트가 안 쓰는 값이 "움직임"으로 나오고, motion 이 없으면 줄이 사라진다.
    expect(archive, "옛 motion 만 보고 움직임 줄을 그린다").not.toMatch(/\{\s*c\.motion\s*&&/);
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
