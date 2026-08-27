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

// ★★ 2026-08-27 — **다시 쓰는 동안의 모양까지** 같아야 한다(사장님 지시: "영상 프롬프트도
//   시나리오 다시쓰기와 동일한 형태로"). ②가 정한 규칙 넷:
//     ① 옛 글 대신 **한 줄**만 뜬다(곧 사라질 글을 읽게 두지 않는다)
//     ② 도는 표시와 함께 뜬다(글자만 있으면 멎은 것과 구별이 안 된다)
//     ③ 입력폼은 **그대로 서 있는다**(칸이 사라지면 화면이 접혔다 펴진다)
//     ④ 안내문은 **누르기 전에만** 뜨고, 버튼은 자리를 지키되 잠긴다
describe("다시 쓰는 동안의 모양도 ②와 같다", () => {
  it("① 옛 글 대신 한 줄이 뜬다 — 그 줄이 script-src 보다 앞에 있다", () => {
    const busy = clean.indexOf('영상 프롬프트를 다시 쓰고 있어요');
    expect(busy, "다시 쓰는 중 문구가 없다").toBeGreaterThan(-1);
    expect(clean.indexOf("script-src"), "옛 글이 busy 갈래보다 앞에 있다").toBeGreaterThan(busy);
  });

  it("② 도는 표시가 함께 뜬다", () => {
    const at = clean.indexOf('영상 프롬프트를 다시 쓰고 있어요');
    expect(clean.slice(Math.max(0, at - 200), at)).toContain('className="spinner"');
  });

  it("③ 입력폼은 다시 쓰는 동안에도 사라지지 않는다", () => {
    // note-form 을 그리는 조건에 saving 이 끼면 칸이 통째로 사라진다.
    expect(clean, "쓰는 동안 칸을 감춘다").not.toMatch(/saving !== "whole" && \(\s*<div className="note-form"/);
  });

  it("④ 안내문은 누르기 전에만 뜨고 버튼은 잠긴 채 서 있는다", () => {
    expect(clean).toMatch(/saving !== "whole" && \(/);
    // 버튼 자리를 "고치는 중…" 같은 글로 바꾸지 않는다 — ②가 그 방식을 버렸다.
    expect(clean, "버튼 자리가 글로 바뀐다").not.toContain("고치는 중");
    expect(clean, "버튼이 안 잠긴다").toMatch(/disabled=\{!!saving \|\| !note\.trim\(\)\}/);
  });

  it("★ 버튼 라벨이 진행을 말하지 않는다 — 말하는 자리는 위 한 곳이다", () => {
    expect(clean, "버튼이 쓰는 중이라고 말한다").not.toContain('"쓰는 중…"');
  });
});
