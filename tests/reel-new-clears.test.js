// **새로 만들기를 누르면 옛 작업이 따라오지 않는다** (2026-08-27 사장님 지적).
//
// 겪은 일 — [+ 새로 만들기]를 누르고 다른 화면에 다녀온 뒤 사이드바의 「영상 만들기」를
// 누르면 **이전 프로젝트의 결과물**이 떴다.
//
// 뿌리는 화면이 아니라 **공유본**이다. 프로젝트 한 벌을 루트가 들고 있고
// (components/ReelProjectContext) 사이드바의 「영상 만들기」는 그것을 보고 갈 곳을
// 정한다(lib/reel/resume.js 의 makeReelHref). 그런데 `/reel/new` 는 그 공유본을 **안
// 건드렸다** — 새 프로젝트를 만들기 전까지 공유본에는 옛 프로젝트가 그대로 살아 있고,
// 그래서 사이드바가 옛 자리로 되돌려 보냈다. 문서가 섞인 것이 아니라 **길이 옛것을
// 가리키고 있었다.**
//
// ★ 고치는 자리는 `/reel/new` 하나다 — 그 화면에 들어섰다는 것이 곧 "새로 시작한다"는
//   뜻이다. 사이드바에서 판정을 손보면 "옛 프로젝트가 있는가"를 두 곳에서 세게 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { makeReelHref } from "../lib/reel/resume.js";

const src = readFileSync("app/reel/new/page.js", "utf8");
const clean = src
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("/reel/new 가 옛 프로젝트를 놓는다", () => {
  it("공유본을 읽고 비운다 — 화면이 자기 것만 보면 사이드바가 옛 자리를 가리킨다", () => {
    expect(clean, "공유본을 안 쓴다").toContain("useReelProject");
    expect(clean, "비우는 자리가 없다").toMatch(/setProject\(null\)/);
  });

  it("들어서는 그 순간 비운다 — 만들기를 누를 때가 아니다", () => {
    // 시작 버튼 안에서만 비우면, 눌러 보기 전에 다른 화면으로 갔다 오는 그 경로가
    // 그대로 남는다(사장님이 겪은 것이 정확히 그 경로다).
    const at = clean.indexOf("setProject(null)");
    expect(at).toBeGreaterThan(-1);
    const around = clean.slice(Math.max(0, at - 200), at);
    expect(around, "useEffect 밖에서 비운다").toContain("useEffect");
  });
});

describe("사이드바가 갈 곳을 정하는 규칙은 그대로다", () => {
  // ★ 공유본이 비면 새 화면으로, 있으면 그 자리로 — 이 함수는 안 바뀐다.
  //   (고친 것은 "언제 비우는가"이지 "비었을 때 어디로 가는가"가 아니다.)
  it("프로젝트가 없으면 새 화면이다", () => {
    expect(makeReelHref(null)).toBe("/reel/new");
    expect(makeReelHref({})).toBe("/reel/new");
  });

  it("프로젝트가 있으면 그 프로젝트의 자리다", () => {
    const href = makeReelHref({ id: "abc", kind: "reel", scenario: { text: "x" }, cuts: [{ idx: 0 }] });
    expect(href).toContain("/reel/abc/");
  });
});
