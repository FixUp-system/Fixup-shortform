// **롱폼 — 길이를 구간으로 나누는 계산** (2026-09-29, 시험용 껍데기).
//
// ★★★ 왜 순수 모듈인가. 이 계산을 화면에 손으로 적으면 굽는 쪽과 갈린다 — 이 저장소가
//   "값이 사는 곳" 표로 못 박아 둔 규율이다. 지금은 화면 하나만 읽지만, 굽기를 배선하는
//   순간 서버도 같은 수를 세야 한다.
// ★ 그래서 화면이 import 한다 = **import 가 없어야 한다**(사슬 끝에 fs 가 닿으면 빌드가
//   깨진다 — 이 저장소가 세 번 겪었다).
//
// ⚠️ 이 파일은 **아직 굽지 않는다.** 구간 분할의 진짜 규칙(경계를 장면 전환에 맞춘다)은
//   설계가 끝난 뒤다. 지금 있는 것은 "몇 구간이 나오나"라는 **산수**뿐이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  SEGMENT_SECONDS, LONGFORM_LENGTHS,
  segmentCountFor, isLongformLength, lengthLabel,
} from "../lib/longform/plan.js";

describe("구간 길이는 모델이 정한다", () => {
  it("★ 15초다 — Seedance 2.0 의 max(4~15초)에서 온 값이지 취향이 아니다", () => {
    expect(SEGMENT_SECONDS).toBe(15);
  });
});

describe("길이 → 구간 수", () => {
  it("1분은 4구간", () => expect(segmentCountFor(60)).toBe(4));
  it("3분은 12구간", () => expect(segmentCountFor(180)).toBe(12));
  it("5분은 20구간", () => expect(segmentCountFor(300)).toBe(20));
  it("10분은 40구간", () => expect(segmentCountFor(600)).toBe(40));

  it("★ 딱 안 떨어지면 올린다 — 내리면 영상이 요청보다 짧아진다", () => {
    expect(segmentCountFor(20)).toBe(2);
    expect(segmentCountFor(16)).toBe(2);
  });

  it("값이 아니면 0 이다 — 화면이 '0구간'으로 그려 멈추게 한다", () => {
    expect(segmentCountFor(0)).toBe(0);
    expect(segmentCountFor(null)).toBe(0);
    expect(segmentCountFor(-30)).toBe(0);
    expect(segmentCountFor("삼분")).toBe(0);
  });
});

describe("고를 수 있는 길이는 닫힌 목록이다", () => {
  it("1·3·5·10분", () => {
    expect(LONGFORM_LENGTHS).toEqual([60, 180, 300, 600]);
  });

  it("★ 모르는 값은 길이가 아니다 — 화면에서만 거르면 가림막이지 잠금이 아니다", () => {
    expect(isLongformLength(180)).toBe(true);
    expect(isLongformLength(45)).toBe(false);
    expect(isLongformLength("180")).toBe(false);
    expect(isLongformLength(undefined)).toBe(false);
  });

  it("고를 수 있는 길이는 전부 15초로 나누어떨어진다 — 마지막 구간이 토막나지 않는다", () => {
    for (const s of LONGFORM_LENGTHS) expect(s % SEGMENT_SECONDS).toBe(0);
  });

  it("사람이 읽는 이름은 분이다", () => {
    expect(lengthLabel(60)).toBe("1분");
    expect(lengthLabel(600)).toBe("10분");
  });
});

describe("순수 규율 — 화면이 이 파일을 읽는다", () => {
  it("★★ import 가 하나도 없다 — 사슬 끝에 fs 가 닿으면 빌드가 깨진다", () => {
    const src = readFileSync("lib/longform/plan.js", "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
