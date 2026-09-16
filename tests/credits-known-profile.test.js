// lib/charges.js — creditsEnabledFor(userId, knownProfile) 의 둘째 인자.
//
// 왜: GET /api/me 가 프로필을 한 번 읽고(store.findProfiles) 곧이어 creditsEnabledFor 가
// 같은 프로필을 또 읽었다(실측 23~68ms 짜리 중복 왕복). 이미 읽은 값을 넘길 수 있으면
// 그 조회가 통째로 없어진다. 다른 호출자(청구·재생성 등)는 프로필이 없으니 인자를 안
// 넘기면 예전 그대로 스토어에서 읽어야 한다 — 시그니처를 깨지 않는다.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { resetMemoryStore, memoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { creditsEnabledFor, isInternalAccount } from "../lib/charges.js";

const A = "00000000-0000-4000-8000-00000000000a";

describe("creditsEnabledFor — 이미 읽은 프로필을 받으면 다시 조회하지 않는다", () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => vi.restoreAllMocks());

  it("둘째 인자로 준 프로필로 판정한다 — store 를 다시 안 부른다", async () => {
    const spy = vi.spyOn(memoryStore, "findProfiles");
    expect(await creditsEnabledFor(A, { internal: true })).toBe(false);
    expect(await creditsEnabledFor(A, { internal: false })).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("안 넘기면 예전 그대로 스토어에서 읽는다 — 다른 호출자의 동작이 그대로다", async () => {
    await getStore().insertProfile({ id: A, email: "a@example.com", status: "approved", role: "user", internal: true });
    const spy = vi.spyOn(memoryStore, "findProfiles");
    expect(await creditsEnabledFor(A)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("undefined 프로필(모르는 계정)을 넘기면 걷는 쪽이다 — 조회 없이도 안전한 기본값", async () => {
    expect(await creditsEnabledFor(A, undefined)).toBe(true);
  });

  it("전역 스위치가 꺼져 있으면 프로필을 보기도 전에 false 다", async () => {
    process.env.SHOTFORM_NO_CREDITS = "1";
    try {
      const spy = vi.spyOn(memoryStore, "findProfiles");
      expect(await creditsEnabledFor(A, { internal: false })).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      delete process.env.SHOTFORM_NO_CREDITS;
    }
  });
});

describe("isInternalAccount — 판정 규칙이 사는 유일한 자리", () => {
  it("profile.internal 이 정확히 true 일 때만 내부 계정이다", () => {
    expect(isInternalAccount({ internal: true })).toBe(true);
    expect(isInternalAccount({ internal: false })).toBe(false);
    expect(isInternalAccount({})).toBe(false);
    expect(isInternalAccount(undefined)).toBe(false);
    expect(isInternalAccount({ internal: "true" })).toBe(false);
  });
});
