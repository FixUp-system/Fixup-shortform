// ④영상 프롬프트 — **글 ↔ 그림** (2026-09-15, B안 이어서).
//
// ★ ②시나리오와 **같은 짝**이다: 왼쪽은 내가 고치는 글, 오른쪽은 기계가 내놓은 그림.
//   여기엔 아직 영상이 없다 — 움직임 지시(글)를 읽으며 같은 스토리보드를 본다.
//   두 화면이 같은 일을 하는데 배치가 다르면 손이 화면마다 다시 배워야 한다
//   (이 저장소가 ②·④의 "같은 형식"을 지켜 온 이유 — 2026-08-25·08-27 사장님 지시).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync("app/reel/[id]/prompts/page.js", "utf8"));

describe("④영상 프롬프트 — 글 ↔ 그림", () => {
  it("★★★ ②와 같은 틀을 쓴다 — 두 칸 격자", () => {
    expect(page, "두 칸 격자를 안 쓴다").toContain("rv-split");
    expect(page, "겉틀을 안 쓴다").toContain("rv-page");
    // 그림이 있을 때만 두 칸이다 — 없으면 한 칸으로 돌아간다(②와 같은 규칙).
    expect(page, "그림 유무가 칸 수를 안 가른다").toMatch(/sheetUrl\s*\?[\s\S]{0,60}?is-two/);
  });

  it("★★★ 보드 안에 보드를 앉히지 않는다 — 겉이 이미 카드다", () => {
    // 그전에는 겉(.panel--wide) 안에 또 <section className="panel"> 이 있었다.
    // ★ **통짜 갈래만** 잰다 — 컷별 갈래의 컷 카드 목록은 카드가 맞다(목록이지 겉틀이 아니다).
    const a = page.indexOf("oneShot ? (");
    const b = page.indexOf('saving === "all"', a);
    expect(a, "통짜 갈래를 못 찾았다 — 화면 모양이 바뀌었나").toBeGreaterThan(-1);
    expect(b, "컷별 갈래로 넘어가는 자리를 못 찾았다").toBeGreaterThan(a);
    expect(page.slice(a, b), "안쪽 카드가 남아 있다 — 테두리가 두 겹이다")
      .not.toMatch(/className="panel"/);
  });

  it("★★ 고치는 칸은 격자 **밖**이다 — 아래에서 전체 폭을 쓴다", () => {
    const split = page.indexOf("rv-split");
    const sheet = page.indexOf("sheet-view");
    const note = page.indexOf("note-form");
    expect(split, "격자가 없다").toBeGreaterThan(-1);
    expect(note, "고치는 칸이 없다").toBeGreaterThan(sheet);
  });

  it("★★ 그림이 있으면 폭을 푼다 — ②와 같은 표식 하나", () => {
    expect(page, "폭을 푸는 표식을 안 쓴다").toMatch(/sheetUrl\s*\?[\s\S]{0,40}?rv-wide/);
  });
});
