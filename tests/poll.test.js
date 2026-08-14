import { describe, it, expect, vi } from "vitest";
import { startPolling, POLL_MAX_FAILURES } from "../lib/poll.js";

// 2초를 실제로 기다리지 않으려고 timer 를 주입한다 — 회차를 손으로 민다.
function fakeTimers() {
  let tick = null;
  return {
    setTimer: (fn) => { tick = fn; return 1; },
    clearTimer: () => { tick = null; },
    run: async () => { if (tick) await tick(); },
    alive: () => tick !== null,
  };
}
const ok = (body) => async () => ({ ok: true, json: async () => body });

describe("폴링 한 벌", () => {
  it("응답을 onTick 에 넘긴다", async () => {
    const t = fakeTimers();
    const onTick = vi.fn(() => false);
    startPolling({ url: "/x", fetchImpl: ok({ status: "images" }), onTick, onStop: () => {}, ...t });
    await t.run();
    expect(onTick).toHaveBeenCalledWith({ status: "images" });
  });

  it("onTick 이 true 를 주면 멈춘다 — 시간초과가 아니다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({ url: "/x", fetchImpl: ok({}), onTick: () => true, onStop, ...t });
    await t.run();
    expect(onStop).toHaveBeenCalledWith({ timedOut: false });
    expect(t.alive()).toBe(false);
  });

  it("연속 실패가 상한에 닿으면 시간초과로 멈춘다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({
      url: "/x", fetchImpl: async () => { throw new Error("끊김"); },
      onTick: () => false, onStop, ...t,
    });
    for (let i = 0; i < POLL_MAX_FAILURES; i++) await t.run();
    expect(onStop).toHaveBeenCalledWith({ timedOut: true });
  });

  it("중간에 한 번 성공하면 실패 수가 초기화된다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    let n = 0;
    startPolling({
      url: "/x",
      fetchImpl: async () => { n++; if (n === 3) return { ok: true, json: async () => ({}) }; throw new Error("끊김"); },
      onTick: () => false, onStop, ...t,
    });
    for (let i = 0; i < POLL_MAX_FAILURES + 1; i++) await t.run();
    expect(onStop).not.toHaveBeenCalled();
  });

  it("ok 가 아닌 응답은 실패로 센다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({
      url: "/x", fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
      onTick: () => false, onStop, ...t,
    });
    for (let i = 0; i < POLL_MAX_FAILURES; i++) await t.run();
    expect(onStop).toHaveBeenCalledWith({ timedOut: true });
  });

  it("상한 시간을 넘기면 시간초과로 멈춘다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    let clock = 0;
    startPolling({
      url: "/x", fetchImpl: ok({}), onTick: () => false, onStop,
      timeoutMs: 100, now: () => clock, ...t,
    });
    clock = 101;
    await t.run();
    expect(onStop).toHaveBeenCalledWith({ timedOut: true });
  });

  it("stop 을 부르면 더 안 돈다 — onStop 은 안 불린다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    const onTick = vi.fn(() => false);
    const stop = startPolling({ url: "/x", fetchImpl: ok({}), onTick, onStop, ...t });
    stop();
    expect(t.alive()).toBe(false);
    await t.run();
    expect(onTick).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });
});
