import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const layout = () => readFileSync("app/film/[id]/layout.js", "utf8");
// ⚠️ 읽는 자리는 **컨텍스트**다(레이아웃이 아니다). 처음에 이 시험이 레이아웃 소스에서
//   `/api/film/${id}` 를 찾았는데, 그 문자열은 거기 **주석에만** 있었다 — 즉 주석을 재고
//   있었다. 재야 하는 것은 "어느 문으로 두드리는가"이므로 실제로 두드리는 파일을 본다.
//   (오늘 이 저장소에서 같은 종류의 거짓 통과를 세 번 밟았다: 옷차림 규칙 창 둘, 여기 하나.)
const io = () => readFileSync("components/FilmProjectContext.jsx", "utf8");

describe("film 레이아웃", () => {
  it("★ 프로젝트는 film 전용 문으로 읽는다 — /api/projects/[id] 는 kind 를 막는다", () => {
    // 주석을 빼고 **코드에서** 찾는다 — 주석에 적힌 경로는 두드리지 않는다.
    const code = io().replace(/\/\/[^\n]*/g, "");
    expect(code).toMatch(/fetch\(`\/api\/film\/\$\{id\}`\)/);
    expect(code).not.toMatch(/\/api\/projects\//);
    // 레이아웃은 자기 fetch 를 따로 갖지 않는다 — 두 벌이면 한쪽이 낡는다.
    expect(layout().replace(/\/\/[^\n]*/g, "")).not.toMatch(/fetch\(/);
  });

  it("★ 단계 표를 직접 적지 않고 lib/film/steps 에서 읽는다", () => {
    expect(layout()).toMatch(/from ".*lib\/film\/steps"/);
  });

  it("★ 못 연 단계로 들어오면 되돌려 보낸다", () => {
    const src = layout();
    expect(src).toMatch(/isFilmStepReachable/);
    expect(src).toMatch(/router\.replace/);
  });

  it("★ 폴링은 lib/poll 을 쓴다 — 화면에서 setInterval 을 직접 돌리지 않는다", () => {
    expect(layout()).not.toMatch(/setInterval/);
  });
});

// ★★ 모르는 방식을 **조용히 떨어뜨리지 않는다**(2026-08-20).
//
// `/film/<id>/nope/images` 로 들어오면 레이아웃이 mode 를 FILM_MODES[0](=order)로 떨어뜨려
// order 화면을 보여 준다. 사장님은 자기가 무엇을 보고 있는지 모른 채 그 방식으로 그림을
// 그리고 굽는다 — 값이 나간 뒤에야 다른 방식이었다는 것이 드러난다.
//
// lib/film/mode.js 의 filmMode 가 던지는 이유가 정확히 이것이다:
//   "조용히 한쪽으로 떨어뜨리면 사장님이 고른 방식과 다른 것이 구워지고, 그 회차는
//    실험으로 못 쓴다 — 그런데 값은 이미 나간 뒤다."
// 옛 한 화면(app/film/one/[mode]/page.js)은 "모르는 방식이에요" 화면을 줬는데, 단계별
// 흐름에는 그 자리가 없었다.
describe("모르는 방식으로 들어오면 말해 준다", () => {
  const src = () => readFileSync("app/film/[id]/layout.js", "utf8").replace(/\/\/[^\n]*/g, "");

  it("★ 주소의 방식이 표에 없으면 그렇게 말한다 — 조용히 한쪽으로 떨어뜨리지 않는다", () => {
    expect(src()).toMatch(/모르는 방식/);
  });

  it("★ 나갈 길을 함께 준다 — 문구만 덩그러니 두면 거기서 막힌다", () => {
    const s = src();
    const at = s.indexOf("모르는 방식");
    expect(s.slice(Math.max(0, at - 400), at + 400)).toMatch(/FILM_MODES|filmStepHref/);
  });
});

// ★★★ 스테퍼가 **본문에 그려지고 있었다**(2026-08-21 사장님 지적).
//
// 이 저장소의 규약은 "단계 목록은 **사이드바**가 그린다"이다 — 단계별 흐름은
// components/Sidebar.jsx 의 StepList 가, 광고는 AdStepList 가 그린다. film 만 레이아웃
// 본문에 그렸고, 게다가 **사이드바용 클래스**(side-steps/side-step)를 본문에 써서
// 모양이 깨졌다.
//
// 원인은 배치가 아니라 **공급자 위치**였다: ProjectProvider·AdProjectProvider 는
// app/layout.js(루트)에 있어 사이드바가 읽는데, FilmProjectProvider 만 app/film/[id]/
// layout.js 안에 있어 사이드바보다 아래였다 — 읽을 방법이 없으니 본문에 그린 것이다.
describe("film 스테퍼는 사이드바가 그린다", () => {
  const side = () => readFileSync("components/Sidebar.jsx", "utf8");

  it("★ 사이드바가 film 단계 목록을 그린다 — 다른 두 흐름과 같은 자리다", () => {
    expect(side()).toMatch(/FilmStepList/);
  });

  it("★ 사이드바가 film 단계 표를 읽는다", () => {
    expect(side()).toMatch(/lib\/film\/steps/);
  });

  // ⚠️ 주석을 걷고 본다 — 왜 여기서 안 그리는지를 주석으로 남겨 두었는데, 그대로 재면
  //   그 설명 때문에 빨개진다(오늘 여러 번 밟은, 시험이 주석을 재는 함정의 반대편이다).
  it("★ 레이아웃 본문에는 단계 목록이 없다 — 사이드바용 클래스를 본문에 쓰면 깨진다", () => {
    // JSX 주석({/* … */})과 줄 주석(//) 둘 다 걷는다. 줄 주석은 줄머리(^ + m)로 끊는다 —
    // 이스케이프를 쓰면 스크립트로 넣을 때 한 겹 먹힌다(이 저장소가 반복해 밟은 함정).
    const code = layout()
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(code).not.toMatch(/side-steps/);
  });

  it("★ 공급자가 루트에 있다 — 사이드바보다 아래면 읽을 방법이 없다", () => {
    expect(readFileSync("app/layout.js", "utf8")).toMatch(/FilmProjectProvider/);
  });

  it("★ 레이아웃이 공급자를 다시 감싸지 않는다 — 두 벌이면 사이드바와 화면이 서로 다른 프로젝트를 본다", () => {
    expect(layout()).not.toMatch(/<FilmProjectProvider/);
  });
});
