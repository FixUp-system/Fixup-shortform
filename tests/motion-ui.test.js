// ②대본 화면이 움직임 세 축을 **축별로** 보여 주는가 — 소스에서 배선을 판정한다.
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

const script = read("app/create/[id]/script/page.js");
const cuts = read("lib/cuts.js");

describe("②대본 — 움직임 세 축", () => {
  it("화면이 lib/motion 을 직접 import 한다 — 축 목록이 두 벌이 되지 않는다", () => {
    expect(script).toMatch(/import\s*\{[^}]*\baxesOf\b[^}]*\}\s*from\s*["'][^"']*lib\/motion["']/);
    expect(script).toMatch(/import\s*\{[^}]*\bmotionAxisFor\b[^}]*\}\s*from\s*["'][^"']*lib\/motion["']/);
  });

  it("축을 axesOf 로 받아 하나씩 그린다", () => {
    // 축 하나가 한 줄이어야 사장님이 "어느 축을 고치는지" 안다.
    expect(script).toMatch(/axesOf\(\s*c\s*\)/);
    expect(script).toMatch(/axesOf\(\s*c\s*\)[\s\S]{0,400}?\.map\(/);
  });

  it("이름표는 MOTION_AXES 의 label 에서 온다 — 화면이 축 이름을 손으로 적지 않는다", () => {
    // 손으로 적으면 목록에서 축 한 줄을 빼도 화면에는 그대로 남는다(되돌리기가 안 된다).
    expect(script).toMatch(/motionAxisFor\([\s\S]{0,40}?\)[\s\S]{0,20}?\.label/);
    for (const a of MOTION_AXES) {
      expect(script, `축 이름("${a.label}")을 화면에 박았다 — MOTION_AXES 의 label 을 써라`)
        .not.toMatch(new RegExp(`>\\s*${a.label}\\s*<`));
      expect(script, `축 id("${a.id}")를 화면에 박았다 — axesOf 가 주는 id 를 써라`)
        .not.toMatch(new RegExp(`["'\`]${a.id}["'\`]`));
    }
  });

  it("★ 축은 고칠 수 있는 척하지 않는다 — 저장 경로가 없는 동안은 읽기 전용이다", () => {
    // PATCH /api/projects/[id] 의 컷 허용 목록은 ["sentence","shows","motion"] 이라
    // 축 이름으로 보낸 값을 **조용히 버린다**. 그 자리에 contentEditable 을 두면 사장님은
    // 고쳤다고 믿고 값을 치르는데 영상은 옛 축으로 만들어진다.
    const route = read("app/api/projects/[id]/route.js");
    const allows = /\[\s*"sentence"\s*,\s*"shows"\s*,\s*"motion"\s*\]/.test(route);
    if (allows) {
      // 축 렌더 블록 안에 편집 칸이 없어야 한다.
      const block = script.match(/const axes = axesOf\(\s*c\s*\)[\s\S]*?^\s*\}\)\(\)\}/m);
      expect(block, "축 렌더 블록을 못 찾았다 — 테스트가 화면을 놓쳤다").toBeTruthy();
      const axisPart = block[0].split("axes.length")[1].split("return (")[0];
      expect(axisPart, "저장 경로가 없는데 축에 편집 칸을 뒀다")
        .not.toMatch(/contentEditable/);
    } else {
      // 라우트가 축을 받게 됐다면 화면도 고칠 수 있어야 한다.
      expect(script).toMatch(/saveCut\(\s*c\.idx\s*,\s*\{\s*\[[^\]]+\]\s*:/);
    }
  });

  it("★ 순서가 buildClipPrompt 와 같다 — 축 → 옛 motion → 폴백", () => {
    // 화면과 프롬프트가 다른 것을 보여 주면 사장님이 고친 것과 만들어지는 것이 갈린다.
    // 프롬프트 쪽 순서(lib/cuts.js)를 여기서 함께 잰다 — 한쪽만 바뀌는 것을 막는다.
    expect(cuts).toMatch(/axisText\s*\|\|\s*motion\s*\|\|\s*["']거의 정지/);
    // 화면: 축이 있으면 축, 없으면 c.motion, 그것도 없으면 폴백 문구.
    expect(script).toMatch(/axes\.length\s*[>!]/);
    expect(script).toMatch(/c\.motion\s*\|\|\s*["']거의 정지/);
    // ★ 순서를 자리로 잰다 — 셋이 다 있어도 옛 motion 이 먼저면 축이 영영 안 보인다.
    const iAxes = script.search(/const axes = axesOf\(\s*c\s*\)/);
    const iLen = script.search(/axes\.length\s*[>!]/);
    const iMotion = script.search(/c\.motion\s*\|\|\s*["']거의 정지/);
    expect(iAxes).toBeGreaterThan(-1);
    expect(iLen, "축 판정이 axesOf 뒤여야 한다").toBeGreaterThan(iAxes);
    expect(iMotion, "옛 motion 이 축 판정보다 앞에 있다 — 축이 영영 안 보인다")
      .toBeGreaterThan(iLen);
  });
});
