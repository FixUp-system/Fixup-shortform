// ③이미지 생성 — **스토리보드 원본 한 장을 크게** 보여 준다(2026-08-25 사장님 결정).
//
// ★★ 잘라낸 칸이 아니라 원본을 보여 주는 이유: 스토리보드는 **전체 흐름을 한눈에 보는
//   물건**이다. 칸으로 흩어 놓으면 그 성질이 사라진다 — 컷 순서도, 인물이 같은지도
//   한 장에서 읽힌다.
// ★ 원본 주소는 이미 저장돼 있다(라우트가 `sheet: out.url`). 화면이 그것을 읽기만 한다.
// ★ 컷별 갈래(격자 밖 칸 수·한 칸만 다시 그리기)에는 sheet 가 없다 — 그때는 칸을 보여 준다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const page = readFileSync("app/reel/[id]/images/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const clean = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("스토리보드 원본을 보여 준다", () => {
  // ★★ 2026-08-25 — 판독이 화면 밖으로 갔다(lib/reel/oneshot.js 의 reelSheetUrl).
  //   ④·⑤ 화면도 같은 주소를 읽어 "통짜로 구울 수 있는가"를 판정하므로, 화면마다 손으로
  //   찾으면 세 벌이 된다. 단정은 **주소가 어디서 오는지**를 그대로 따라간다.
  it("저장된 sheet 주소를 읽는다", () => {
    expect(clean).toContain("reelSheetUrl");
    expect(readFileSync("lib/reel/oneshot.js", "utf8")).toMatch(/image\?\.sheet/);
  });

  it("원본이 있으면 그것을 그린다", () => {
    expect(clean).toContain("sheet-view");
    expect(css, "CSS 에 .sheet-view 가 없다").toContain(".sheet-view");
  });

  // ★★ 비율을 강제하지 않는다 — 격자 캔버스는 칸 수마다 다르다(9:16 · 3:4 · 4:5 · 16:9).
  //   9:16 으로 잡으면 3칸(가로 한 줄) 스토리보드가 잘려 보인다.
  it("비율을 강제하지 않는다", () => {
    const at = css.indexOf(".sheet-view");
    expect(css.slice(at, at + 400)).not.toMatch(/aspect-ratio/);
  });

  // ★ 컷별 갈래에는 원본이 없다 — 그때 빈 화면이 되면 안 된다.
  it("원본이 없으면 칸을 보여 준다", () => {
    expect(clean).toContain("cut-shots");
  });
});
