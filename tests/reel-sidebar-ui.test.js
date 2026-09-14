// reel 의 단계 목록은 **사이드바에 없다** — 작업대가 그 말을 한다 (2026-09-14).
//
// ★★★ 이 판은 **뒤집힌 것**이다. 2026-08-25 에는 반대였다: 단계 목록을 레이아웃 본문에서
//   사이드바로 옮기는 것이 요구였고(옆의 셋 — StepList·AdStepList·FilmStepList — 과 같은
//   자리), 그러려고 공급자(ReelProjectProvider)를 app/layout.js(루트)까지 끌어올렸다.
//
//   2026-09-14 에 reel 화면이 **설정 패널 + 누적 작업대**로 바뀌면서 전제가 사라졌다.
//   작업대(components/reel/StepStack.jsx)가 끝난 단계를 접어 쌓고 지금 단계만 펼치므로,
//   "몇 단계이고 어디까지 왔는가"를 이미 말한다. 사이드바의 목록은 **같은 말을 두 번**
//   하는 자리가 됐다 — 그런 자리는 언젠가 한쪽만 고쳐진다.
//
// ★ 지우지 않고 **남긴 것**이 있다: 공급자의 루트 위치와 useReelProject 다. 진입 링크
//   [단계별 영상] 이 **작업 중이던 자리로** 되돌아가려면(makeReelHref) 사이드바가 여전히
//   프로젝트를 읽어야 한다. 그래서 아래 공급자 판 셋은 그대로 산다.
//   ★ 걷은 것은 **reel 하나**다 — 광고·film·옛 단계별은 작업대가 없어 사이드바 말고는
//     단계를 말할 자리가 없다(그 보호는 tests/sidebar-reel-steps-removed.test.js).
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

describe("reel 단계 목록은 사이드바에 없다 — 작업대가 말한다", () => {
  it("★★★ 단계 목록을 그리던 부품이 사라졌다", () => {
    // ★ 날 것에서 잰다 — 주석에 남은 부품 이름도 위반이다. 지운 부품 이름이 주석에
    //   남으면 다음 사람이 grep 해서 없는 것을 찾아 헤맨다.
    expect(sidebar(), "ReelStepList 가 남아 있다").not.toMatch(/ReelStepList/);
  });

  it("★★★ 사이드바는 reel 단계 표를 더 읽지 않는다 — 그 표를 읽는 화면은 작업대다", () => {
    const code = strip(sidebar());
    expect(code, "단계 표를 아직 끌어온다").not.toMatch(/lib\/reel\/steps/);
    for (const fn of ["REEL_STEPS", "isReelStepReachable", "currentReelStepKey", "reelStepHref", "reelStepFromPathname", "runningReelStepKey"]) {
      expect(code, `${fn} 가 남아 있다`).not.toContain(fn);
    }
    // 표가 사라진 것이 아니다 — 작업대가 같은 표를 읽는다(그 판은 reel-step-stack-ui).
    expect(strip(read("components/reel/StepStack.jsx"))).toMatch(/lib\/reel\/steps/);
  });

  it("★★★ 무엇이 남았나 — 진입 링크와 그 한 줄이다", () => {
    const code = strip(sidebar());
    // 되돌아갈 길: [단계별 영상] 은 **작업 중이던 자리로** 간다. 이것이 남는 이유로
    // 공급자가 루트에 있고 useReelProject 도 산다(아래 세 판).
    expect(code, "진입 링크가 사라졌다").toMatch(/makeReelHref\s*\(/);
    expect(code, "[단계별 영상] 라벨이 사라졌다").toContain("단계별 영상");
    expect(code, "무엇을 해 주는지 말하는 한 줄이 없다").toContain("보면서 고쳐요");
    // 그리고 **다른 흐름의 스테퍼**는 사이드바에 그대로 있다 — 걷은 것은 reel 하나다.
    expect(code, "옆의 스테퍼까지 데려갔다 — side-steps 를 그리는 자리가 없다").toContain("side-steps");
    expect(code, "옆의 스테퍼까지 데려갔다 — 잠긴 단계(locked) 표시가 없다").toContain("locked");
  });

  it("★ 레이아웃 본문에도 단계 목록이 없다 — 사이드바용 클래스를 본문에 쓰면 깨진다", () => {
    // 사이드바에서 걷어낸 목록이 **본문으로 되돌아가는** 것을 막는다. 2026-08-25 이전이
    // 그 모양이었다(side-steps 를 레이아웃 본문에 썼다). 작업대는 자기 클래스(rs-*)를 쓴다.
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

// ★★ SIDEBAR_FLOWS 표가 "무엇을 내보낼지"를 쥔다. reel 이 사이드바에 내놓는 것은 전부
//   그 조건 **안**에 있어야 한다 — 밖에 두면 흐름을 끈 뒤에도 그것만 남는다.
describe("reel 은 표의 조건 안에서만 그려진다", () => {
  it("표가 reel 을 true 로 둔다", () => {
    expect(strip(sidebar())).toMatch(/reel:\s*true/);
  });

  it("진입 링크와 그 한 줄이 둘 다 SIDEBAR_FLOWS.reel 조건 뒤에 있다", () => {
    const code = strip(sidebar());
    const cond = code.indexOf("SIDEBAR_FLOWS.reel &&");
    expect(cond, "조건문을 못 찾았다").toBeGreaterThan(-1);
    // ★ 2026-08-25 — 진입 링크가 고정 주소에서 **이어서 할 자리**로 바뀌면서
    //   변수 이름이 reelHref 가 됐다(lib/reel/resume.js). 재려는 것은 그대로다 —
    //   "링크가 표의 조건 안에 있는가".
    // ★ 2026-09-14 — 여기서 함께 재던 단계 목록은 작업대로 갔다. 그 자리를 **빈 채로
    //   두지 않고** 부제를 잰다: reel 이 사이드바에 내놓는 것이 지금은 이 둘뿐이다.
    const link = code.indexOf("reelHref", cond);
    const sub = code.indexOf("보면서 고쳐요", cond);
    expect(link, "진입 링크가 조건 밖이다").toBeGreaterThan(cond);
    expect(sub, "한 줄 설명이 조건 밖이다").toBeGreaterThan(cond);
    // 보관함(다음 항목)보다 앞이어야 그 블록 안이다.
    const next = code.indexOf('href="/archive"', cond);
    expect(next).toBeGreaterThan(sub);
    expect(next).toBeGreaterThan(link);
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
