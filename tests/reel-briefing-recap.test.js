// ①입력 — **되돌아와 확인하는 화면**(2026-08-25 사장님 지시).
//
// ★★ 이 화면의 일은 하나다: "내가 맞게 넣었나". 만든 뒤에는 조건을 못 바꾸므로
//   (파일 머리말의 규율) 편집 칸이 아니라 **읽기 좋은 명세서**여야 한다.
//
// 고치기 전의 문제 셋:
//   · 사장님이 쓴 소재가 .script-src(12px 회색)라 **각주처럼** 보였다 — 이 화면의 주인공인데
//   · 칩이 라벨 없이 나열돼 "story" 가 포맷인지 분위기인지 알 수 없었다
//   · 사진이 **"3장" 이라는 숫자뿐**이라 무엇을 올렸는지 확인할 길이 없었다
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const page = readFileSync("app/reel/[id]/briefing/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const clean = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("올린 사진을 실제로 보여 준다", () => {
  // ★ 장수를 적는 것 자체는 유용하다 — 문제는 그것만 있었던 것이다.
  //   그래서 "숫자가 없다"가 아니라 **"사진을 그리는 자리가 있다"**를 재다.
  it("사진을 누락하는 자리가 있다", () => {
    expect(clean).toMatch(/photos\.map/);
  });

  it("img 로 그린다", () => {
    expect(clean).toContain("<img");
  });

  // ★ 업로드는 비공개 버킷이라 /api/uploads/<name> 라우트로 흘려준다(CLAUDE.md).
  //   화면이 주소를 손으로 조립하면 그 규약이 바뀔 때 여기만 낡는다 — 저장된 url 을 그대로 쓴다.
  it("사진에 담긴 url 을 그대로 쓴다", () => {
    const at = clean.indexOf("<img");
    expect(clean.slice(at, at + 160)).toMatch(/\{p\.url\}|\{photo\.url\}|\.url\}/);
  });
});

describe("영역으로 가른다", () => {
  it("소재·사진·설정에 각각 이름표가 붙는다", () => {
    expect(clean).toMatch(/소재|무엇을/);
    expect(clean).toMatch(/사진/);
  });

  // ★ 값만 늘어놓지 않는다 — 무엇의 값인지 말해야 확인이 된다.
  it("설정값에 라벨이 붙는다", () => {
    expect(clean).toMatch(/컨셉|분위기|화풍|언어|사이즈|길이/);
  });
});

describe("쓰는 클래스가 CSS 에 있다", () => {
  // ★★ 오늘 두 번 겪었다 — CSS 에 없는 클래스를 쓰면 스타일이 조용히 안 먹고,
  //   테스트는 그린이라 눈으로만 발견된다.
  it("recap 계열 클래스가 정의돼 있다", () => {
    const used = [...clean.matchAll(/className="([^"]*recap[^"]*)"/g)]
      .flatMap((m) => m[1].split(" "))
      .filter(Boolean);
    expect(used.length, "recap 클래스를 안 쓴다").toBeGreaterThan(0);
    for (const cls of new Set(used)) {
      expect(css, `CSS 에 .${cls} 가 없다`).toContain("." + cls);
    }
  });
});
