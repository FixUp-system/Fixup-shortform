import { describe, it, expect } from "vitest";
import { isCutDone } from "../lib/progress.js";

describe("isCutDone — 단계별 끝남 판정", () => {
  it("이미지 단계는 그림이 있거나 내 사진인 컷을 끝난 것으로 센다", () => {
    expect(isCutDone({ image: { url: "a" } }, "images")).toBe(true);
    expect(isCutDone({ source: "photo" }, "images")).toBe(true);
    expect(isCutDone({}, "images")).toBe(false);
  });

  // ★ 회귀 방지: 그림 생성이 죽으면 image 없이 state 만 needs_attention 으로 남는다.
  // 이것을 안 세면 정상 종료한 생성이 done: N-1 에 영영 멈춰 "멈춤"으로 오독된다.
  it("이미지 단계는 그림 없이 needs_attention 으로 끝난 컷도 끝난 것으로 센다", () => {
    expect(isCutDone({ state: "needs_attention" }, "images")).toBe(true);
  });

  it("목소리 단계는 낭독이나 실패가 있는 컷을 끝난 것으로 센다", () => {
    expect(isCutDone({ audio: {} }, "voice")).toBe(true);
    expect(isCutDone({ voice_error: "x" }, "voice")).toBe(true);
    expect(isCutDone({}, "voice")).toBe(false);
  });

  it("영상 단계는 클립이나 실패가 있는 컷을 끝난 것으로 센다", () => {
    expect(isCutDone({ video: {} }, "video")).toBe(true);
    expect(isCutDone({ video_error: "x" }, "video")).toBe(true);
    expect(isCutDone({}, "video")).toBe(false);
  });

  it("모르는 단계는 던지지 않고 false 다", () => {
    expect(isCutDone({ image: { url: "a" } }, "render")).toBe(false);
    expect(isCutDone({}, undefined)).toBe(false);
  });

  it("컷이 없어도 안 던진다", () => {
    expect(isCutDone(null, "images")).toBe(false);
    expect(isCutDone(undefined, "voice")).toBe(false);
  });
});
