import { describe, it, expect, vi } from "vitest";
import {
  startPolling,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  POLL_MAX_FAILURES,
} from "../lib/poll.js";

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
  // 이 판의 존재 이유는 셋이 **조용히** 바뀌는 것을 막는 것이다 — 다른 테스트는 전부
  // 자기 값을 주입하거나 timer 를 손으로 밀어서, 셋이 달라져도 초록이 난다.
  // ★★ 2026-09-03 — maxFailures 를 5 → 15 로 올렸다(2초 간격에서 10초 → 30초).
  //   5 는 수거를 겸하는 상태 라우트에서 너무 짧았다: fal 이 한 번 느리면 10초 만에
  //   폴링이 죽고, 죽으면 아무도 결과를 줍지 않아 화면이 영영 "만드는 중"이었다.
  //   ★ 간격·상한은 안 건드렸다 — 바꾼 것은 "얼마나 참는가" 하나다.
  it("세 숫자는 정한 값 그대로다", () => {
    expect(POLL_INTERVAL_MS).toBe(2000);
    expect(POLL_TIMEOUT_MS).toBe(300000);
    expect(POLL_MAX_FAILURES).toBe(15);
  });

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

  // ★ 지뢰 하나를 여기서 막는다. 예전에는 `if (onTick(data))` 였다 — 기다리지 않았다.
  //   그래서 onTick 을 async 로 쓰면 Promise 가 돌아오고, Promise 는 **언제나 참**이라
  //   첫 회차에 아무 말 없이 폴링이 끝났다. 아무것도 안 끝났는데.
  //   실제로 필요해졌다: 컷 분할 대기 루프가 "전체를 받아온 뒤에" 끝내야 한다.
  it("onTick 이 async 로 false 를 주면 안 멈춘다 — Promise 는 참이다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({ url: "/x", fetchImpl: ok({}), onTick: async () => false, onStop, ...t });
    await t.run();
    expect(onStop).not.toHaveBeenCalled();
    expect(t.alive()).toBe(true);
  });

  it("onTick 이 async 로 true 를 주면 멈춘다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({ url: "/x", fetchImpl: ok({}), onTick: async () => true, onStop, ...t });
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
    for (let i = 0; i < POLL_MAX_FAILURES; i++) {
      // 상한 직전까지는 살아 있어야 한다 — 이게 없으면 한 회차 일찍 끊는 구현도 초록이 난다
      expect(onStop).not.toHaveBeenCalled();
      await t.run();
    }
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

  // ★ 화면과 일부러 다른 한 곳. 화면들은 res.json() **앞에서** 실패 수를 0 으로 돌려서
  //   200 인데 본문이 깨진 상태(프록시 HTML 오류 페이지 등)에서 영원히 폴링한다.
  //   여기서는 실패로 세고 멈춘다 — lib/poll.js 주석 참조.
  it("200 인데 본문이 JSON 이 아니면 실패로 센다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({
      url: "/x",
      fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("HTML 이 왔다"); } }),
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
