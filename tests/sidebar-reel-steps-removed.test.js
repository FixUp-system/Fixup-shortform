// 같은 말이 두 곳에 있으면 언젠가 한쪽만 고쳐진다. 단계는 이제 작업대가 말한다.
//
// ★★ 재는 자리가 **두 벌**이다. 이 회차에 "주석에 적은 글자 때문에 판정이 통과"하는
//   거짓 초록을 실제로 밟아서다.
//   · "없다"는 **날 것**에서 잰다 — 주석에 남은 부품 이름도 위반이다. 지운 부품 이름이
//     주석에 남으면 다음 사람이 grep 해서 없는 것을 찾아 헤맨다. 날 것이 더 엄한 쪽이다.
//   · "있다"는 **주석을 걷고** 잰다 — 이유를 주석에 적는 것이 이 저장소 문화라,
//     날 것에서 재면 코드를 통째로 지워도 주석 한 줄이 판을 초록으로 만든다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/Sidebar.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
// 줄 주석·JSX 주석·블록 주석을 걷는다(tests/reel-sidebar-ui.test.js 와 같은 자리).
const code = src
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("사이드바", () => {
  it("★★★ reel 단계 목록이 없다 — 작업대가 그 말을 한다", () => {
    expect(src, "ReelStepList 가 남아 있다").not.toMatch(/ReelStepList/);
  });

  it("★★★ 다른 흐름의 스테퍼는 **그대로 있다** — 같이 지우면 길을 잃는다", () => {
    expect(code, "광고 스테퍼가 사라졌다").toMatch(/adStepIndex/);
    expect(code, "film 스테퍼가 사라졌다").toMatch(/filmStepFromPathname/);
    expect(code, "옛 단계별 스테퍼가 사라졌다").toMatch(/stepsFor\s*\(/);
  });

  it("★★ 두 항목이 무엇을 해 주는지 한 줄로 말한다", () => {
    expect(code).toMatch(/손쉽게 한 번에/);
    expect(code).toMatch(/보면서 고쳐요/);
  });
});

// ★★ 부제는 **화면에서** 틀리기 쉬운 자리다 — 판은 초록인데 눈으로 보면 어긋나는
//   모양이 둘 있어서, 그 둘을 판으로 못 박는다.
describe("부제 한 줄이 실제로 두 줄로 선다", () => {
  it("★★★ 세로로 쌓는 칸 안에 있다 — .side-item 은 가로 flex 다", () => {
    // `.side-item { display:flex; align-items:center }` 라, 부제를 그 직계 자식으로
    // 그냥 넣으면 `display:block` 이 안 먹고 **아이콘·제목·부제가 한 줄에 나란히** 선다.
    const pairs = code.match(/side-item-text[\s\S]*?side-item-sub/g) || [];
    expect(pairs.length, "쌓는 칸 없이 부제만 있다 — 한 줄에 나란히 선다").toBe(2);

    const col = css.match(/\.side-item-text\s*\{[^}]*\}/);
    expect(col, ".side-item-text 규칙이 없다").not.toBeNull();
    expect(col[0], "세로로 안 쌓는다").toMatch(/flex-direction:\s*column/);
  });

  it("★★★ 부제 색이 **있는 토큰**이다 — --ink-faint 는 :root 에 없다", () => {
    // 없는 토큰을 쓰면 색이 상속값으로 떨어져 부제가 본문과 같은 색이 된다.
    // 판은 초록인데 화면만 틀리는 종류다.
    const rule = css.match(/\.side-item-sub\s*\{[^}]*\}/);
    expect(rule, ".side-item-sub 규칙이 없다").not.toBeNull();
    expect(rule[0], "없는 토큰을 쓴다").not.toMatch(/--ink-faint/);
    expect(rule[0]).toMatch(/color:\s*var\(--ink-soft\)/);
    // `.side-item.on { font-weight: 600 }` 이 부제까지 굵게 만들지 않게 한다.
    expect(rule[0], "선택된 항목에서 부제까지 굵어진다").toMatch(/font-weight:\s*400/);
  });

  it("★ :root 가 그 토큰을 실제로 정의한다 — 이 판이 전제하는 것이다", () => {
    expect(css).toMatch(/--ink-soft:\s*#[0-9a-fA-F]{3,8}\s*;/);
    expect(css, "--ink-faint 가 생겼다면 이 판이 낡았다").not.toMatch(/--ink-faint:\s*/);
  });
});
