// 한국어 조사 — 받침을 보고 고른다.
//
// ★★ 화면이 `{label}으로` 처럼 조사를 **고정**하면 받침 없는 말에서 깨진다:
//   "시나리오으로"(2026-08-25 사장님 지적). 라벨은 표(REEL_STEPS)가 쥐고 있어
//   화면이 무엇이 올지 모르므로, 붙이는 쪽이 받침을 봐야 한다.
// ★ 규칙: 받침 없음 → "로" · 받침 ㄹ → "로" · 그 밖의 받침 → "으로"
//   (ㄹ 은 예외다 — "서울로", "발로")
import { describe, it, expect } from "vitest";
import { euroRo, hasFinalConsonant } from "../lib/josa.js";

describe("받침 판정", () => {
  it("받침 없는 글자", () => {
    expect(hasFinalConsonant("시나리오")).toBe(false);
    expect(hasFinalConsonant("프롬프트")).toBe(false);
  });

  it("받침 있는 글자", () => {
    expect(hasFinalConsonant("입력")).toBe(true);
    expect(hasFinalConsonant("영상")).toBe(true);
    expect(hasFinalConsonant("생성")).toBe(true);
  });

  // ★ 한글이 아닌 것(빈 문자열·영문·숫자)에 던지지 않는다 — 라벨이 늘 한글이라는 보장은 없다.
  it("한글이 아니면 받침 없음으로 본다", () => {
    expect(hasFinalConsonant("")).toBe(false);
    expect(hasFinalConsonant("AI")).toBe(false);
    expect(hasFinalConsonant(undefined)).toBe(false);
  });
});

describe("euroRo — 으로 / 로", () => {
  it("받침 없으면 로", () => {
    expect(euroRo("시나리오")).toBe("시나리오로");
    expect(euroRo("영상 프롬프트")).toBe("영상 프롬프트로");
  });

  it("받침 있으면 으로", () => {
    expect(euroRo("입력")).toBe("입력으로");
    expect(euroRo("영상")).toBe("영상으로");
    expect(euroRo("이미지 생성")).toBe("이미지 생성으로");
  });

  // ★ ㄹ 받침은 예외 — "서울로"이지 "서울으로"가 아니다.
  it("ㄹ 받침은 로", () => {
    expect(euroRo("서울")).toBe("서울로");
  });
});
