// ③이미지 생성 — **수정 요청**과 **자동 생성 한 번**(2026-08-25 사장님 결정).
//
// ★ 수정은 **전체 한 장 단위**다. 스토리보드가 한 장이라 그 단위가 맞고, 칸 하나만 다시
//   만들면 그 칸만 컷별로 돌아 인물이 다른 칸과 달라진다(08-21 에 하루를 쓴 그 문제).
// ★ 자동 생성은 **시나리오가 처음 만들어진 직후 한 번**뿐이다 — 이미지는 돈이 나가므로
//   (한 장 $0.401) 화면을 열 때마다 도는 시나리오 자동 생성과 성질이 다르다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { buildStoryboardPrompt } from "../lib/reel/storyboard.js";

const project = {
  scenario: { look: "red box", environment: "kitchen" },
  settings: { mood: "warm", style: "photo" },
};
const cuts = [{ idx: 0, shows: "a" }, { idx: 1, shows: "b" }, { idx: 2, shows: "c" }, { idx: 3, shows: "d" }];
const grid = { rows: 2, cols: 2, canvas: "9:16" };
const NOTE = "전체적으로 더 밝게 해 줘";

describe("수정 요청이 스토리보드 지문에 실린다", () => {
  it("사장님이 적은 말이 그대로 들어간다", () => {
    expect(buildStoryboardPrompt(project, cuts, grid, NOTE)).toContain(NOTE);
  });

  // ★★ 이 저장소가 여섯 번 쓴 처방 — 안 넘기면 예전과 글자 그대로.
  it("안 넘기면 지문이 예전과 같다", () => {
    const a = buildStoryboardPrompt(project, cuts, grid);
    const b = buildStoryboardPrompt(project, cuts, grid, "   ");
    expect(b).toBe(a);
  });
});

describe("라우트가 요청을 나른다", () => {
  const route = readFileSync("app/api/reel/[id]/images/route.js", "utf8");
  it("body 에서 note 를 읽는다", () => {
    // ★ 받는 값은 늘 수 있다(auto 등) — 재는 것은 "note 를 읽는가" 하나다.
    const line = route.split("\n").find((l) => l.includes("await req.json"));
    expect(line, "body 를 읽는 줄을 못 찾았다").toBeTruthy();
    expect(line).toContain("note");
  });
  it("스토리보드 지문에 넘긴다", () => {
    // ★ 2026-08-31 — 판 그리기의 **몸통이 lib/reel/storyboard.js 의 drawStoryboardSheet 로
    //   옮겨 갔다**(초상 거절 자동 재시도가 같은 길로 다시 그린다). 재는 것은 그대로 두되
    //   **두 마디**로 나눈다: 라우트가 note 를 넘기는가 · 그 함수가 지문에 싣는가.
    //   한 마디만 재면 중간에서 끊겨도 그린이다.
    expect(route, "라우트가 note 를 안 넘긴다").toMatch(/drawStoryboardSheet\(\{[\s\S]{0,300}note/);
    const lib = readFileSync("lib/reel/storyboard.js", "utf8");
    expect(lib, "그 함수가 지문에 note 를 안 싣는다").toMatch(/buildStoryboardPromptImpl\([^)]*note/);
  });
});

describe("화면에 수정 폼이 있다", () => {
  const page = readFileSync("app/reel/[id]/images/page.js", "utf8");
  it("여러 줄로 적을 수 있다", () => {
    expect(page).toContain("textarea");
  });
  it("이미지가 있을 때만 보인다 — 없으면 고칠 것이 없다", () => {
    const at = page.indexOf("<textarea");
    expect(page.slice(Math.max(0, at - 300), at)).toMatch(/sheetUrl|hasImages/);
  });
});

describe("이미지 자동 생성은 한 번뿐이다", () => {
  const scenario = readFileSync("app/reel/[id]/scenario/page.js", "utf8");
  // ★ 시나리오가 **처음** 만들어진 직후에만 — 되돌아올 때마다 돌면 볼 때마다 돈이 나간다.
  it("시나리오를 만든 뒤 이미지 라우트를 부른다", () => {
    expect(scenario).toMatch(/\/images/);
  });
  it("자동 생성 여부가 문서에 남는다 — 두 번 안 돈다", () => {
    expect(scenario).toMatch(/autoImage|imagesAuto|autoImagedRef/);
  });
});
