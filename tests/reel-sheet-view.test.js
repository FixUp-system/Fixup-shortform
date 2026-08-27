// 스토리보드 원본 한 장을 **어디서 보여 주는가**.
//
// ★★ 2026-08-27 — ③에서 **크기가 줄고 짝이 생겼다**. 그날 한 번 통째로 뺐다가
//   ("기존에 4컷을 통합한건 제거해줘") 곧 되돌렸다("전체 4컷도 상단에 배치해줘").
//   지금 뜻: 통합본은 **전체 흐름을 한눈에**(작게, 맨 위), "어느 칸이 어느 문장인가"는
//   그 아래 컷별 목록이 맡는다. 뺐을 때 사라졌던 것이 앞의 일이었다.
//
// ★ **만드는 방식은 안 바뀌었다** — 여전히 한 장을 사서 칸을 자른다
//   (app/api/reel/[id]/images/route.js). 바뀐 것은 보여 주는 자리뿐이다.
// ★ ④프롬프트·⑤영상에서는 그대로 크게 보여 준다: 굽기에 **통째로 넘기는** 그 한 장이라
//   그 화면들에서는 그것이 본문이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const images = readFileSync("app/reel/[id]/images/page.js", "utf8");
const prompts = readFileSync("app/reel/[id]/prompts/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("③이미지 — 통합본은 맨 위, 그 아래가 컷별 목록", () => {
  // ★ 통합본은 "전체 흐름을 한눈에" 보는 자리다. "어느 칸이 어느 문장인가"는 아래
  //   컷별 목록이 맡는다(tests/reel-images-auto.test.js) — 둘의 일이 다르다.
  it("통합 한 장을 맨 위에 그린다", () => {
    expect(strip(images)).toContain("sheet-view");
  });

  // ★ 컷별 갈래(격자 밖 칸 수·한 칸만 다시 그리기)에는 칸마다 [다시 만들기]가 붙는다 —
  //   그 갈래의 상자는 그대로 살아 있어야 한다.
  it("컷별 갈래의 상자는 남는다", () => {
    expect(strip(images)).toContain("cut-shots");
  });
});

describe("④프롬프트 — 굽기에 넘기는 그 한 장이 본문이다", () => {
  const clean = strip(prompts);

  // ★★ 판독은 lib/reel/oneshot.js 의 reelSheetUrl 하나다 — 화면마다 손으로 찾으면
  //   ④·⑤가 "통짜로 구울 수 있는가"를 각자 다른 주소로 판정하게 된다.
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
});
