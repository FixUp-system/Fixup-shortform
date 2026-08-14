// ★ 내부 QA 동안 크레딧을 끈다(2026-08-14 사용자 결정 — 차감·지급을 실물로 확인했다).
//
// **코드를 지우지 않는다.** 결제를 붙일 때 되돌아와야 하므로 스위치 하나로 가른다:
//   SHOTFORM_NO_CREDITS=1 → 청구·잔액·체험 게이트가 전부 통과하고, 화면은 크레딧을 감춘다.
// 기본값은 켜짐(지금 동작 그대로)이다 — 깜빡하고 배포해도 무료로 새는 쪽으로 안 떨어진다.
//
// ★ 기록은 그대로 남긴다(사용자 결정). 원가 장부(cost_records)도, 청구 장부도 계속 쌓여야
//   QA 기간에 얼마를 썼는지 나중에 볼 수 있다 — 화면에서만 안 보인다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { creditsEnabled } from "../lib/charges.js";
import { assertCanAfford, requireVideoCharge, NoCredits } from "../lib/charges.js";
import { runWithActor } from "../lib/actor.js";

const U = "00000000-0000-4000-8000-0000000000cc";

describe("크레딧 스위치", () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => { delete process.env.SHOTFORM_NO_CREDITS; });

  it("기본은 켜짐 — 안 건드리면 지금 동작 그대로다", () => {
    expect(creditsEnabled()).toBe(true);
  });

  it("SHOTFORM_NO_CREDITS=1 이면 꺼진다", () => {
    process.env.SHOTFORM_NO_CREDITS = "1";
    expect(creditsEnabled()).toBe(false);
  });

  it("모르는 값은 켜진 것으로 본다 — 새는 쪽으로 안 떨어진다", () => {
    process.env.SHOTFORM_NO_CREDITS = "yes";
    expect(creditsEnabled()).toBe(true);
    process.env.SHOTFORM_NO_CREDITS = "0";
    expect(creditsEnabled()).toBe(true);
  });
});

describe("크레딧을 끄면 — 잔액이 0 이어도 막지 않는다", () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => { delete process.env.SHOTFORM_NO_CREDITS; });

  it("★ 켜져 있으면 잔액 0 은 막힌다 — 회귀 방어", async () => {
    await expect(assertCanAfford(U, 40)).rejects.toBeInstanceOf(NoCredits);
  });

  it("★ 끄면 잔액 0 이어도 통과한다", async () => {
    process.env.SHOTFORM_NO_CREDITS = "1";
    await expect(assertCanAfford(U, 40)).resolves.toBeUndefined();
  });

  it("★ 끄면 영상 정가도 안 걷는다 — 0 을 돌려주고 장부에 청구가 안 쌓인다", async () => {
    process.env.SHOTFORM_NO_CREDITS = "1";
    const charged = await runWithActor(U, () =>
      requireVideoCharge({ userId: U, projectId: "11111111-1111-4111-8111-111111111111", seconds: 15 })
    );
    expect(charged).toBe(0);
  });
});
