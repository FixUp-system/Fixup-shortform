// **타임아웃 상황을 로컬에서 가상으로 돌려 본다** (2026-09-03 사장님 지시).
//
// 어제 겪은 것: fal 은 영상을 다 만들었는데 화면은 계속 "만드는 중"이었고, 새로고침해도
// 그대로였다. 원인 후보가 둘이었다 —
//   ① 수거를 겸하는 상태 라우트가 상한 없이 잘린다(→ tests/route-max-duration.test.js)
//   ② 그 라우트가 몇 번 실패하면 **폴링이 죽는다** — 죽으면 아무도 결과를 안 줍는다
// 여기서는 ②를 **진짜 fal 없이** 재현한다: 느린·실패하는 응답을 흉내 내고, 폴링과
// 수거가 그 뒤에 어떻게 되는지 잰다. 돈이 안 든다.
import { describe, it, expect, vi } from "vitest";
import { startPolling, POLL_MAX_FAILURES, POLL_INTERVAL_MS } from "../lib/poll.js";
import { collectClip } from "../lib/i2v.js";
// 수거가 성공하면 원장에 한 줄 적는다 — 그 자리가 비용 주체를 요구한다
// (lib/actor.js). 라우트는 withUser 가, 스크립트는 이 함수가 세운다.
import { runWithActor } from "../lib/actor.js";

// 가짜 타이머 — 회차를 손으로 민다(2초를 실제로 안 기다린다).
function fakeTimers() {
  let fn = null;
  return {
    setTimer: (f) => { fn = f; return 1; },
    clearTimer: () => { fn = null; },
    async tick(n = 1) { for (let i = 0; i < n; i++) if (fn) await fn(); },
    get alive() { return fn !== null; },
  };
}
const okRes = (body) => ({ ok: true, json: async () => body });
const failRes = () => ({ ok: false, status: 504, json: async () => ({}) });

describe("가상 타임아웃 ① — 상태 라우트가 잠깐 죽었다 살아난다", () => {
  it("★★★ 딸꾹질(연속 3회 504)을 넘기고 그 뒤 결과를 받는다", async () => {
    const t = fakeTimers();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      // 1~3회차는 504(게이트웨이 타임아웃) — fal 이 느릴 때 우리 라우트가 내는 모양이다.
      if (calls <= 3) return failRes();
      return okRes({ status: "done", video: "https://f/x.mp4" });
    };
    const seen = [];
    const onStop = vi.fn();
    startPolling({
      url: "/api/reel/1/status", fetchImpl, onStop,
      onTick: (d) => { seen.push(d); return d.status === "done"; },
      setTimer: t.setTimer, clearTimer: t.clearTimer, timeoutMs: Infinity,
    });

    await t.tick(4);
    expect(seen, "실패를 넘기지 못해 결과를 못 받았다").toHaveLength(1);
    expect(seen[0].status).toBe("done");
    expect(onStop).toHaveBeenCalledWith({ timedOut: false });
  });

  it("★★★ 옛 한도(5)였다면 이 시나리오에서 죽었다 — 그것이 어제의 모양이다", async () => {
    const t = fakeTimers();
    const fetchImpl = async () => failRes();
    const onStop = vi.fn();
    startPolling({
      url: "/api/reel/1/status", fetchImpl, onStop, onTick: () => false,
      setTimer: t.setTimer, clearTimer: t.clearTimer, timeoutMs: Infinity,
      maxFailures: 5,
    });
    await t.tick(5);
    expect(onStop, "5회로는 안 멈춘다면 이 판이 뜻이 없다").toHaveBeenCalledWith({ timedOut: true });
    expect(t.alive, "멈춘 뒤에도 타이머가 살아 있다").toBe(false);
  });

  it("★★ 지금 한도로는 같은 5회를 견딘다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({
      url: "/api/reel/1/status", fetchImpl: async () => failRes(), onStop, onTick: () => false,
      setTimer: t.setTimer, clearTimer: t.clearTimer, timeoutMs: Infinity,
    });
    await t.tick(5);
    expect(onStop, "아직 멈추면 안 된다").not.toHaveBeenCalled();
    expect(t.alive).toBe(true);
  });

  it("★★ 그래도 **계속** 실패하면 멈춘다 — 무한 폴링은 여전히 막는다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({
      url: "/api/reel/1/status", fetchImpl: async () => failRes(), onStop, onTick: () => false,
      setTimer: t.setTimer, clearTimer: t.clearTimer, timeoutMs: Infinity,
    });
    await t.tick(POLL_MAX_FAILURES);
    expect(onStop).toHaveBeenCalledWith({ timedOut: true });
  });

  it("★ 한 번 성공하면 실패 수가 0 으로 돌아간다 — 띄엄띄엄 실패로는 안 죽는다", async () => {
    const t = fakeTimers();
    let n = 0;
    // 실패-실패-성공을 되풀이한다. 연속이 3을 넘지 않으므로 영영 안 죽어야 한다.
    const fetchImpl = async () => (++n % 3 === 0 ? okRes({ status: "running" }) : failRes());
    const onStop = vi.fn();
    startPolling({
      url: "/api/reel/1/status", fetchImpl, onStop, onTick: () => false,
      setTimer: t.setTimer, clearTimer: t.clearTimer, timeoutMs: Infinity,
    });
    await t.tick(60);
    expect(onStop, "띄엄띄엄 실패로 죽었다").not.toHaveBeenCalled();
  });
});

describe("가상 타임아웃 ② — 수거가 잘렸다 다시 불린다", () => {
  const job = {
    requestId: "req-1", endpoint: "bytedance/seedance-2.0/reference-to-video",
    statusUrl: "https://q/status", responseUrl: "https://q/result",
    seconds: 15, resolution: "720p",
  };

  it("★★★ 상태 조회가 끊기면 **던진다** — 조용히 '아직'으로 넘기면 안 된다", async () => {
    // 이 구분이 중요하다: '아직 안 끝났다'와 '못 물어봤다'는 다른 일이다.
    // 후자를 전자로 읽으면 화면은 영영 기다리고, 부르는 쪽은 되살릴 기회를 잃는다.
    const fetchImpl = async () => { throw new Error("fetch failed"); };
    await expect(collectClip({ job, projectId: "p1", fetchImpl })).rejects.toThrow(/fetch failed/);
  });

  it("★★★ 끊겼다가 다시 불리면 그때 결과를 받는다 — 접수증만 살아 있으면 복구된다", async () => {
    let attempt = 0;
    const fetchImpl = async (url) => {
      attempt += 1;
      if (attempt === 1) throw new Error("fetch failed");        // 첫 수거: 잘림
      if (String(url).endsWith("/status")) return { ok: true, json: async () => ({ status: "COMPLETED" }) };
      return { ok: true, status: 200, json: async () => ({ video: { url: "https://f/done.mp4" } }) };
    };
    await expect(collectClip({ job, projectId: "p1", fetchImpl })).rejects.toThrow();
    const out = await runWithActor("u-test", () => collectClip({ job, projectId: "p1", fetchImpl }));
    expect(out.done, "두 번째 수거에서도 결과를 못 받았다").toBe(true);
    expect(out.url).toBe("https://f/done.mp4");
  });

  it("★★ 아직 안 끝났으면 done:false 다 — 이때는 접수증을 지우면 안 된다", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ status: "IN_PROGRESS" }) });
    const out = await collectClip({ job, projectId: "p1", fetchImpl });
    expect(out).toEqual({ done: false });
  });
});

describe("셈 — 한도와 간격이 실제로 얼마를 견디는가", () => {
  it("★★ 지금 설정은 연속 실패를 30초까지 견딘다", () => {
    expect((POLL_MAX_FAILURES * POLL_INTERVAL_MS) / 1000).toBe(30);
  });
});
