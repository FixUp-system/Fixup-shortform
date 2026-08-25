// ④영상 프롬프트 — **②시나리오와 같은 형식**으로(2026-08-25 사장님 지시).
//
// ★★ ②는 이렇다: 결과를 **읽는 글**로 보여 주고(.script-src), 아래에서 **한국어로 고쳐 달라고
//   적는다**(.note-form). 직접 타자로 고치는 칸이 아니다.
// ★ ④도 같아야 하는 이유: 두 화면이 같은 일(만들어진 글을 보고 고치기)을 하는데 조작이
//   다르면 사장님이 화면마다 다른 사용법을 익혀야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const page = readFileSync("app/reel/[id]/prompts/page.js", "utf8");
const scenario = readFileSync("app/reel/[id]/scenario/page.js", "utf8");
const clean = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("②시나리오와 같은 형식", () => {
  it("프롬프트를 읽는 글로 보여 준다", () => {
    expect(clean, "script-src 로 안 그린다").toContain("script-src");
  });

  // ★ 직접 타자로 고치는 칸(onBlur 저장)은 없앤다 — ②에 없는 조작이다.
  // ★ **통짜 갈래에만** 해당한다 — 16초 이상은 여전히 컷별이고, 거기서는
  //   칸마다 직접 고치는 것이 맞는다(고칠 대상이 여럿이라 한 번의 요청으로 못 가른다).
  it("통짜 갈래에는 직접 고치는 칸이 없다", () => {
    const at = clean.indexOf("sheet-view");
    const until = clean.indexOf("</section>", at);
    expect(at, "통짜 갈래를 못 찾았다").toBeGreaterThan(-1);
    expect(clean.slice(at, until)).not.toContain("onBlur");
  });

  it("한국어로 고쳐 달라고 적는 자리가 있다", () => {
    expect(clean).toContain("note-form");
  });

  // ★★ 두 화면이 **같은 클래스**를 쓴다 — 한쪽만 바꾸면 갈린다.
  it("②가 쓰는 것과 같은 클래스를 쓴다", () => {
    for (const cls of ["script-src", "note-form"]) {
      expect(scenario, `②에 ${cls} 가 없다`).toContain(cls);
      expect(clean, `④에 ${cls} 가 없다`).toContain(cls);
    }
  });
});
