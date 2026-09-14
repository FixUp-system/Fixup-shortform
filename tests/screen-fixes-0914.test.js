// 2026-09-14 화면 정리 C·B — 고친 자리가 되돌아가지 않게 문다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const src = (f) => readFileSync(f, "utf8");

describe("C1 보관함 카드 — 영어 상태값이 새지 않는다", () => {
  it("reel 은 완성본이 있으면 완성, 없으면 광고 표로 읽고, 모르는 값은 '진행 중'이다", () => {
    const s = src("components/ProjectCards.jsx");
    expect(s).toMatch(/isReel\s*\n?\s*\?\s*\(p\.video_url \? "완성" : AD_STATUS_LABEL\[p\.status\] \|\| "진행 중"\)/);
    expect(s).not.toMatch(/\|\| p\.status\)/);
  });
});

describe("C2 단계별 ①입력 — 컨셉은 고른 값(settings.concept)이다", () => {
  it("광고 포맷(format)이 아니라 REEL_CONCEPTS 로 읽는다", () => {
    const s = src("app/reel/[id]/briefing/page.js");
    expect(s).toContain("labelOf(REEL_CONCEPTS, normalizeReelConcept(s.concept ?? s.format))");
    expect(s).not.toContain("labelOf(AD_FORMATS, s.format)");
  });
});

describe("C3 홈 영상 벽 — 남의 상세로 가는 링크가 없다", () => {
  it("타일이 /archive/<id> 로 가지 않는다", () => {
    expect(src("components/HomeMade.jsx")).not.toMatch(/href=\{`\/archive\/\$\{t\.id\}`\}/);
  });
});

describe("C4 다시 만들기 값 — 서버와 같은 식으로 버튼에 적는다", () => {
  it("③이미지: sheet/image 회차 값", () => {
    const s = src("app/reel/[id]/images/page.js");
    expect(s).toMatch(/regenPrice\("sheet", prior/);
    expect(s).toMatch(/regenPrice\("image", prior/);
    expect(s).toMatch(/me\?\.gated === true/);
  });
  it("⑤영상: clip 회차 값", () => {
    const s = src("app/reel/[id]/video/page.js");
    expect(s).toMatch(/regenPrice\("clip", Number\(c\.clip_regen_count\) \|\| 0/);
    expect(s).toMatch(/me\?\.gated === true/);
  });
});

describe("B ④영상 프롬프트 — 영어 지시문을 직접 고치는 칸이 없다", () => {
  it("컷마다 clip_prompt 를 담은 입력칸이 없다", () => {
    expect(src("app/reel/[id]/prompts/page.js")).not.toContain('defaultValue={c.clip_prompt || ""}');
  });
});
