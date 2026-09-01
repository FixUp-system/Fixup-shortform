// reel 의 단계 목록(①~⑥)을 **사이드바가 그린다** (2026-08-25 사장님 지시).
//
// ★★ film 이 먼저 같은 길을 갔다(tests/film-layout-ui.test.js 아래쪽 describe 참고).
//   이 저장소의 규약은 "단계 목록은 사이드바가 그린다"이고 — 단계별 흐름은 StepList,
//   광고는 AdStepList, film 은 FilmStepList — reel 만 레이아웃 **본문**에 그렸다.
//   게다가 사이드바용 클래스(side-steps/side-step)를 본문에 쓴 셈이라 모양이 깨진다.
//
//   원인은 배치가 아니라 **공급자 위치**였다: ReelProjectProvider 가
//   app/reel/[id]/layout.js 안에 있어 사이드바보다 아래였다 — 읽을 방법이 없으니 본문에
//   그린 것이다. 그래서 옆의 셋과 같은 자리(app/layout.js 루트)로 올린다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const read = (p) => readFileSync(p, "utf8");
// 줄 주석·블록 주석·JSX 주석을 걷는다 — 왜 이렇게 했는지는 주석에 남아야 하고, 그 글자가
// 단정에 걸리면 안 된다(이 저장소가 반복해 밟은 "시험이 주석을 재는" 함정).
const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const sidebar = () => read("components/Sidebar.jsx");
const layout = () => read("app/reel/[id]/layout.js");
const rootLayout = () => read("app/layout.js");
const ctx = () => read("components/ReelProjectContext.jsx");

describe("reel 스테퍼는 사이드바가 그린다", () => {
  it("★ 사이드바가 reel 단계 목록을 그린다 — 다른 셋과 같은 자리다", () => {
    expect(strip(sidebar())).toMatch(/function ReelStepList/);
    expect(strip(sidebar())).toMatch(/<ReelStepList/);
  });

  it("★ 판정을 새로 만들지 않고 lib/reel/steps 에서 읽는다", () => {
    const code = strip(sidebar());
    expect(code).toMatch(/lib\/reel\/steps/);
    for (const fn of ["REEL_STEPS", "isReelStepReachable", "currentReelStepKey", "reelStepHref", "reelStepFromPathname"]) {
      expect(code, `${fn} 를 안 쓴다`).toContain(fn);
    }
  });

  it("★ film 과 같은 클래스를 쓴다 — 모양이 갈리면 한 화면만 다르게 보인다", () => {
    const code = strip(sidebar());
    const at = code.indexOf("function ReelStepList");
    // ⚠️ 2026-09-01 — 여기는 `at + 1400` 이라는 **고정 창**이었다. 그 함수에 줄이 늘자
    //   `locked` 가 창 밖으로 밀려 빨개졌다 — 코드는 멀쩡한데 판이 틀린 경우다.
    //   창이 아니라 **함수 끝**까지 본다(맨 왼쪽 `}` 가 그 자리다).
    const end = code.indexOf("\n}", at);
    const body = code.slice(at, end > at ? end : code.length);
    expect(body).toContain("side-steps");
    expect(body).toContain("side-step");
    expect(body).toContain("locked");
    expect(body).toContain("passed");
  });

  it("★ 레이아웃 본문에는 단계 목록이 없다 — 사이드바용 클래스를 본문에 쓰면 깨진다", () => {
    expect(strip(layout())).not.toMatch(/side-steps/);
  });

  it("★ 공급자가 루트에 있다 — 사이드바보다 아래면 읽을 방법이 없다", () => {
    expect(rootLayout()).toMatch(/ReelProjectProvider/);
  });

  it("★ 레이아웃이 공급자를 다시 감싸지 않는다 — 두 벌이면 사이드바와 화면이 서로 다른 프로젝트를 본다", () => {
    expect(strip(layout())).not.toMatch(/<ReelProjectProvider/);
  });

  it("★ 프로젝트는 reel 전용 문으로 읽는다 — /api/projects/[id] 는 kind 를 막는다", () => {
    const code = strip(ctx());
    expect(code).toMatch(/fetch\(`\/api\/reel\/\$\{id\}`\)/);
    expect(code).not.toMatch(/\/api\/projects\//);
    // 레이아웃은 자기 fetch 를 따로 갖지 않는다 — 두 벌이면 한쪽이 낡는다.
    expect(strip(layout())).not.toMatch(/fetch\(/);
  });

  it("★ 화면들이 부르던 이름(useReelProject)이 그대로 산다", () => {
    // 다른 세션이 손대는 화면(scenario 등)이 `../layout` 에서 이 이름을 부른다 —
    // 옮기면서 그 문을 닫으면 그 화면들이 그 자리에서 죽는다.
    expect(strip(layout())).toMatch(/useReelProject/);
    expect(strip(ctx())).toMatch(/export function useReelProject/);
  });
});

// ★★ 오늘 생긴 SIDEBAR_FLOWS 표가 "무엇을 내보낼지"를 쥔다. 단계 목록도 그 조건 **안**에
//   있어야 한다 — 밖에 두면 흐름을 끈 뒤에도 단계 목록만 남는다.
describe("reel 은 표의 조건 안에서만 그려진다", () => {
  it("표가 reel 을 true 로 둔다", () => {
    expect(strip(sidebar())).toMatch(/reel:\s*true/);
  });

  it("진입 링크와 단계 목록이 둘 다 SIDEBAR_FLOWS.reel 조건 뒤에 있다", () => {
    const code = strip(sidebar());
    const cond = code.indexOf("SIDEBAR_FLOWS.reel &&");
    expect(cond, "조건문을 못 찾았다").toBeGreaterThan(-1);
    // ★ 2026-08-25 — 진입 링크가 고정 주소에서 **이어서 할 자리**로 바뀌면서
    //   변수 이름이 reelHref 가 됐다(lib/reel/resume.js). 재려는 것은 그대로다 —
    //   "링크가 표의 조건 안에 있는가".
    const link = code.indexOf("reelHref", cond);
    const list = code.indexOf("<ReelStepList", cond);
    expect(link, "진입 링크가 조건 밖이다").toBeGreaterThan(cond);
    expect(list, "단계 목록이 조건 밖이다").toBeGreaterThan(cond);
    // 보관함(다음 항목)보다 앞이어야 그 블록 안이다.
    const next = code.indexOf('href="/archive"', cond);
    expect(next).toBeGreaterThan(list);
  });
});

describe("새로 시작할 길이 화면에 있다", () => {
  // ★★ 2026-08-25 사장님 지적: "새로 만들 수가 없어."
  //   같은 날 진입 링크를 **이어서 할 자리**로 바꾸면서(makeReelHref) 새 프로젝트를
  //   시작할 길이 사이드바에서 통째로 사라졌다 — 주소를 직접 쳐야만 열렸다.
  //   옆의 둘(create·ad)은 이미 이 링크를 갖고 있어, reel 만 빠져 있던 것이다.
  it("reel 에도 + 새로 만들기 링크가 있다", () => {
    const code = strip(sidebar());
    const at = code.indexOf("SIDEBAR_FLOWS.reel");
    expect(at, "reel 블록을 못 찾겠다").toBeGreaterThan(-1);
    const next = code.indexOf('href="/archive"', at);
    const block = code.slice(at, next);
    expect(block, "새로 시작할 길이 없다").toContain('href="/reel/new"');
    expect(block).toContain("side-new");
  });

  it("옆의 둘과 같은 조건이다 — 프로젝트 안에서만 뜬다", () => {
    const code = strip(sidebar());
    const at = code.indexOf('href="/reel/new"');
    expect(at).toBeGreaterThan(-1);
    // 링크 바로 앞에 "프로젝트가 있는가" 판정이 있어야 한다(create·ad 와 같은 모양).
    expect(code.slice(Math.max(0, at - 160), at)).toMatch(/reelProject\?\.id/);
  });
});
