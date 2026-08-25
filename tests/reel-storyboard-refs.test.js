// 스토리보드에도 **레퍼런스 사진을 싣는다** (2026-08-25 사장님 실측으로 생겼다:
// "레퍼런스 제품 이미지를 첨부해서 이미지 생성을 진행했는데 완전 다른 제품 이미지가
// 반영이 되었어").
//
// ★★ 원인이 **둘 겹쳐** 있었다 — 하나만 고치면 안 된다:
//   ① 시나리오는 사진이 있으면 제품 생김새를 **글로 안 쓴다**(lib/ad/scenario.js —
//      "사진이 정한다, look·shows 에서는 '그 제품'이라고 가리키기만 한다"). 글이 사진을
//      이겨 없던 것이 그려지는 사고를 막으려고 넣은 규칙이라 이쪽은 그대로 둔다.
//   ② 스토리보드 갈래는 그 사진을 **안 실었다**(옛 주석: "컷 하나의 참조를 통째로 실으면
//      다른 칸까지 그 사진을 닮는다").
//   합치면 **제품을 정의하는 것이 아무것도 없다** → 모델이 지어낸다.
//
// ★ 옛 걱정은 **인물 사진** 이야기다. 제품은 반대로 모든 칸에 같은 것이 나와야 맞으므로,
//   격자에서는 그 성질이 부작용이 아니라 **목적**이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { buildStoryboardPrompt } from "../lib/reel/storyboard.js";

const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const grid = { rows: 2, cols: 2, canvas: "9:16" };
const cuts = [0, 1, 2, 3].map((i) => ({ idx: i, shows: `panel ${i}`, seconds: 4 }));
const project = {
  kind: "reel",
  settings: { mood: "bright", style: "photo", target_seconds: 15 },
  scenario: { look: "the product", environment: "a small bakery" },
  material: { photos: [{ id: "p1", url: "/api/uploads/a.jpg", filename: "a.jpg" }] },
};

describe("지문이 사진을 가리킨다", () => {
  it("★ 참조가 없으면 그 줄이 아예 없다 — 예전과 글자 그대로다", () => {
    const p = buildStoryboardPrompt(project, cuts, grid, "");
    expect(p).not.toMatch(/reference/i);
  });

  it("★★ 참조가 있으면 **그대로 그리라**고 말한다 — 사진만 실으면 분위기 참고로 읽는다", () => {
    const p = buildStoryboardPrompt(project, cuts, grid, "", [{ key: "a.jpg" }]);
    expect(p).toMatch(/reference image shows/i);
    expect(p).toMatch(/exactly as it appears/i);
    // 지어내지 말라고 **명시**한다 — 이것이 사장님이 겪은 그 사고다.
    expect(p).toMatch(/invent a different one/i);
  });

  it("★ 모든 칸에서 같아야 한다고 말한다 — 격자에서는 그것이 목적이다", () => {
    const p = buildStoryboardPrompt(project, cuts, grid, "", [{ key: "a.jpg" }]);
    expect(p).toMatch(/identical in every panel/i);
  });

  it("여러 장이면 복수로 말한다 — 한 장짜리 문장이 어색하게 남지 않는다", () => {
    const p = buildStoryboardPrompt(project, cuts, grid, "", [{ key: "a.jpg" }, { key: "b.jpg" }]);
    expect(p).toMatch(/reference images show/i);
  });

  it("수정 요청과 함께 와도 둘 다 실린다", () => {
    const p = buildStoryboardPrompt(project, cuts, grid, "더 밝게 해 줘", [{ key: "a.jpg" }]);
    expect(p).toMatch(/reference image shows/i);
    expect(p).toContain("더 밝게 해 줘");
  });
});

describe("배선 — 라우트가 실제로 실어 보낸다", () => {
  const route = strip(readFileSync("app/api/reel/[id]/images/route.js", "utf8"));

  it("★★ 스토리보드 호출에 refs 가 실린다 — 지문만 고치면 사진은 여전히 안 간다", () => {
    expect(route).toContain("loadStoryboardRefs");
    const at = route.indexOf("loadStoryboardRefs(project)");
    expect(at, "스토리보드 갈래에서 안 부른다").toBeGreaterThan(-1);
    // generateImage 호출이 그 아래에 있고 refs 를 받는다.
    const call = route.indexOf("generateImage({", at);
    expect(call).toBeGreaterThan(at);
    expect(route.slice(call, call + 300)).toMatch(/^\s*refs,\s*$/m);
  });

  it("지문도 같은 refs 를 받는다 — 사진은 갔는데 말은 안 하는 상태를 막는다", () => {
    expect(route).toMatch(/buildStoryboardPrompt\([^)]*refs\)/);
  });

  it("컷별 갈래는 예전 그대로다 — loadCutRefs 를 계속 쓴다", () => {
    expect(route).toContain("loadCutRefs(cut, project)");
  });
});
