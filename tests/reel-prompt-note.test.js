// ④영상 프롬프트 — **한글 수정 요청**과 **실물 같은 가짜 응답**(2026-08-25 사장님 지시).
//
// ★ 이 화면은 앞의 둘과 다르다: 컷마다 프롬프트가 따로이고, **직접 편집이 이미 있다**
//   (textarea 에 쓰면 저장). 없던 것은 "말로 요청하면 LLM 이 고쳐 주는" 쪽이다.
// ★ 단위는 **전체 한 번**이다 — 컷 하나만 손보는 것은 직접 편집이 맡는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { buildClipPromptMessages } from "../lib/reel/clip-prompt.js";

const cut = { shows: "a bench", camera: "wide", idx: 0 };
const project = { scenario: { environment: "a shop", tone: "warm" } };
const NOTE = "전체적으로 카메라를 더 천천히 움직여 줘";

describe("수정 요청이 컷 지문에 실린다", () => {
  it("사장님이 적은 말이 들어간다", () => {
    const msgs = buildClipPromptMessages(cut, project, { note: NOTE });
    expect(msgs[0].content).toContain(NOTE);
  });

  // ★★ 이 저장소가 일곱 번 쓴 처방 — 안 넘기면 예전과 글자 그대로.
  it("안 넘기면 지문이 예전과 같다", () => {
    const a = buildClipPromptMessages(cut, project, {}).at(0).content;
    const b = buildClipPromptMessages(cut, project, { note: "   " }).at(0).content;
    expect(b).toBe(a);
  });
});

describe("배선", () => {
  const pipeline = readFileSync("lib/reel/pipeline.js", "utf8");
  const route = readFileSync("app/api/reel/[id]/prompts/route.js", "utf8");
  const page = readFileSync("app/reel/[id]/prompts/page.js", "utf8");

  it("파이프라인이 note 를 컷마다 넘긴다", () => {
    expect(pipeline).toMatch(/note/);
  });
  it("라우트가 body 에서 note 를 읽는다", () => {
    const line = route.split("\n").find((l) => l.includes("await req.json") && l.includes("only"));
    expect(line, "body 를 읽는 줄을 못 찾았다").toBeTruthy();
    expect(line).toContain("note");
  });
  it("화면에 적는 자리가 있다", () => {
    expect(page).toContain("note-form");
  });
});

describe("가짜 응답이 실물처럼 읽힌다", () => {
  // ★ 주석을 먼저 걷어낸다. 안 걷으면 "떡볶이를 못 쓴다"고 **설명한 주석**이
  //   소재 검사에 걸리고, 한 문단을 여러 줄 이어붙인 코드는 길이 검사에서 못 읽힌다.
  const src = readFileSync("lib/reel/clip-prompt.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const at = src.indexOf("function fakeClipPromptResponse");
  const body = src.slice(at, at + 1200);

  it("한 문장짜리 자리표시가 아니다", () => {
    expect(at, "가짜 응답 함수를 못 찾았다").toBeGreaterThan(-1);
    // 이어붙인 조각을 전부 세면 한 문단이다 — 조각 하나만 보면 짧아 보인다.
    const chunks = body.match(/"[^"\n]*"/g) || [];
    const chars = chunks.reduce((n, s) => n + s.length - 2, 0);
    expect(chars, "너무 짧다 — 실제 프롬프트는 한 문단이다").toBeGreaterThan(200);
  });

  // ★★ CLAUDE.md: "프롬프트 예시는 테스트에 쓸 자료와 소재도 동사도 겹치지 않게 고른다."
  //   떡볶이는 tests/film-mode.test.js 가 **자료로** 쓰고 있어 못 쓴다.
  it("테스트 자료와 소재가 겹치지 않는다", () => {
    expect(body).not.toMatch(/tteokbokki|떡볶이/);
  });
});
