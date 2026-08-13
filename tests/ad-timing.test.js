// 광고 영상 큐 대기 상한 — lib/ad/timing.js 를 잰다.
// ★ 이 파일은 import 문이 없어야 한다(화면도 그대로 불러온다) — 그 성질은 여기서 안
//   따로 재지 않는다(고쳐도 테스트로 못 잡는 성질이라 실수하면 빌드가 알려준다).
import { describe, it, expect } from "vitest";
import { adRenderTimeoutMs, adPollTimeoutMs, adEstimatedMinutes } from "../lib/ad/timing.js";

describe("광고 큐 대기 상한", () => {
  it("길이에 비례한다 — 30초가 15초보다 크다", () => {
    // ★ 지키려는 것: 고정 상수 하나로 두면 이 단정이 실패한다(같은 값이 나온다).
    expect(adRenderTimeoutMs(30)).toBeGreaterThan(adRenderTimeoutMs(15));
  });

  it("실측(4초→134초, 즉 초당 33.5초)보다 넉넉하다", () => {
    // 15초 영상의 순수 생성 시간은 실측대로면 ≈502초(8.4분). 상한이 그보다 짧으면
    // 다 만들어진 영상을 상한 초과로 버리게 된다 — 그게 이 태스크가 고치려는 사고다.
    expect(adRenderTimeoutMs(15)).toBeGreaterThan(15 * (134 / 4) * 1000);
    expect(adRenderTimeoutMs(30)).toBeGreaterThan(30 * (134 / 4) * 1000);
  });

  it("화면 상한이 서버 상한보다 항상 길다", () => {
    // ★ 지키려는 것: 화면이 서버보다 먼저 포기하면 서버가 실제로는 성공했는데도
    // 사장님은 실패로 안다. 값이 같거나 화면이 더 짧으면 이 단정이 실패한다.
    for (const s of [4, 15, 30, 60]) {
      expect(adPollTimeoutMs(s)).toBeGreaterThan(adRenderTimeoutMs(s));
    }
  });

  it("빈 값·0 은 던지지 않고 안전한 쪽(짧은 값이 아니라 최소값)으로 떨어진다", () => {
    expect(() => adRenderTimeoutMs(undefined)).not.toThrow();
    expect(() => adRenderTimeoutMs(0)).not.toThrow();
    expect(adRenderTimeoutMs(0)).toBeGreaterThan(0); // 큐 여유(고정분)는 남아 있어야 한다
  });

  it("추정 분(分)은 상한이 아니라 실측 그대로다 — 15초≈8분·30초≈17분", () => {
    // 상한(안전 계수+큐 여유 포함)을 그대로 보여주면 실제보다 훨씬 길어 보인다.
    // 이 값은 안전 계수 없이 실측 배율만 쓴다 — 상한과 반드시 달라야(작아야) 한다.
    expect(adEstimatedMinutes(15)).toBe(8);
    expect(adEstimatedMinutes(30)).toBe(17);
    expect(adEstimatedMinutes(15) * 60_000).toBeLessThan(adRenderTimeoutMs(15));
  });
});
