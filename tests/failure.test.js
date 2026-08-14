import { describe, it, expect } from "vitest";
import { classifyFailure, FAILURE_CODES } from "../lib/failure.js";

describe("실패 사유 분류", () => {
  it("크레딧 부족은 장부 문구를 그대로 쓰고 재시도를 열지 않는다", () => {
    const r = classifyFailure("크레딧이 모자라요 — 이 작업은 160 크레딧인데 20 남았어요");
    expect(r.code).toBe("no_credits");
    expect(r.retryable).toBe(false);
    expect(r.message).toContain("160 크레딧인데 20 남았어요");
  });

  it("예산 상한도 재시도를 열지 않는다", () => {
    const r = classifyFailure("예산 상한($5)에 닿아 멈췄어요 — 지금까지 $5.10 썼어요");
    expect(r.code).toBe("budget");
    expect(r.retryable).toBe(false);
  });

  it("429 는 몰린 것 — 다시 시도할 수 있다", () => {
    const r = classifyFailure("이미지 생성 실패 (429) rate limited");
    expect(r.code).toBe("busy");
    expect(r.retryable).toBe(true);
  });

  it("504 는 시간 초과다", () => {
    expect(classifyFailure("영상 생성 실패 (504) gateway timeout").code).toBe("timeout");
  });

  it("5xx 는 만드는 쪽 문제다", () => {
    expect(classifyFailure("영상 생성 실패 (500) internal").code).toBe("provider");
  });

  it("402 는 5xx·4xx 규칙보다 먼저 걸려 크레딧으로 읽힌다", () => {
    const r = classifyFailure("이미지 생성 실패 (402) insufficient balance");
    expect(r.code).toBe("no_credits");
    expect(r.retryable).toBe(false);
  });

  it("그 밖 4xx 는 모델이 거부한 것으로 본다", () => {
    const r = classifyFailure("이미지 생성 실패 (400) content policy violation");
    expect(r.code).toBe("rejected");
    expect(r.retryable).toBe(true);
  });

  it("빈 결과", () => {
    expect(classifyFailure("영상 결과가 비어 있어요").code).toBe("empty");
  });

  it("연결 실패", () => {
    expect(classifyFailure("fetch failed").code).toBe("network");
    expect(classifyFailure("connect ETIMEDOUT 1.2.3.4:443").code).toBe("network");
  });

  // ★ 이 자리가 이 표의 핵심이다 — 못 알아본 것을 "알 수 없는 오류"로 뭉개면
  //   지금보다 정보가 **줄어든다**. 사장님이 우리에게 문구를 그대로 읽어 줄 수 있어야 한다.
  it("못 알아본 것은 원문을 그대로 내보낸다", () => {
    const r = classifyFailure("ffmpeg 가 -22 로 죽었어요");
    expect(r.code).toBe("unknown");
    expect(r.message).toBe("ffmpeg 가 -22 로 죽었어요");
    expect(r.retryable).toBe(true);
  });

  it("Error 객체도 받는다", () => {
    expect(classifyFailure(new Error("이미지 생성 실패 (429) x")).code).toBe("busy");
  });

  it("빈 입력에도 안 던진다", () => {
    for (const v of [null, undefined, "", {}]) {
      const r = classifyFailure(v);
      expect(FAILURE_CODES).toContain(r.code);
      expect(typeof r.message).toBe("string");
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});
