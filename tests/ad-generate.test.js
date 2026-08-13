// 광고 영상 생성 — fal 을 부르는 유일한 자리(lib/ad/generate.js)를 잰다.
// ★ 여기서 만드는 fetchImpl 은 전부 가짜다. 진짜 fal 을 부르면 한 번이 $3.63 이다.
//
// ★ Task 23 (2026-08-13) — 동기 엔드포인트(fal.run)가 15초 영상에서 5분 만에
// `fetch failed` 로 죽었다(Node undici 의 헤더 타임아웃). 큐 엔드포인트(queue.fal.run)로
// 갈아탔다: 접수 → 폴링(IN_QUEUE/IN_PROGRESS) → COMPLETED → 결과 수령. 아래 테스트는
// 그 네 단계를 실제로 순서대로 겪게 만든 가짜 fetch 로 잰다 — 한 번의 fetch 로
// 끝나는 옛 성질을 그대로 흉내 내면 이 파일이 지키려는 것을 못 잡는다.
import { describe, it, expect, afterEach } from "vitest";
import { generateAdVideo } from "../lib/ad/generate.js";
import { runWithActor } from "../lib/actor.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

const U = "00000000-0000-4000-8000-00000000000a";
const project = {
  id: "00000000-0000-4000-8000-0000000000f1",
  settings: { seconds: 15, aspect_ratio: "9:16", model: "seedance-2.0-fast" },
};

// 폴링 테스트에 진짜 setTimeout 을 쓰면 느려진다(15초 영상은 상한이 분 단위다).
// vi.useFakeTimers() 대신 대기 함수를 주입 가능하게 했다 — 이 파일 곳곳이 이미
// fetchImpl 주입으로 도는 것과 같은 방식이고, fetch 여러 번이 await 로 얽힌 자리에서
// 가짜 타이머를 스텝별로 advance 하는 것보다 훨씬 덜 깨진다. 즉시 resolve 시킨다.
const noWait = async () => {};

// 큐 API 세 자리(접수·상태·결과)를 흉내 내는 가짜 fetch.
// ★ status_url·response_url 을 일부러 "추측 불가능한" 값으로 준다 — 구현이 그 값을
// 안 쓰고 endpoint/request_id 로 직접 조립하면(예: `${base}/${endpoint}/requests/${id}/status`)
// 그 URL 은 여기 없는 경로라 catch-all 이 던진다. "받은 값을 그대로 쓴다"를 이렇게 잰다.
function fakeQueueFetch({
  statuses = ["IN_PROGRESS", "COMPLETED"],
  onSubmit,
  result = { video: { url: "https://fal.example/v.mp4" } },
  requestId = "req-9f3c",
  statusUrl = "https://queue.fal.run/_probe/9f3c/poll-me",
  responseUrl = "https://queue.fal.run/_probe/9f3c/collect-me",
} = {}) {
  const calls = { submit: 0, status: 0, result: 0 };
  const fetchImpl = async (url, init) => {
    if (init?.method === "POST") {
      calls.submit += 1;
      onSubmit?.({ url, body: JSON.parse(init.body) });
      return {
        ok: true,
        json: async () => ({ request_id: requestId, status_url: statusUrl, response_url: responseUrl, status: "IN_QUEUE" }),
        text: async () => "",
      };
    }
    if (url === statusUrl) {
      const idx = Math.min(calls.status, statuses.length - 1);
      calls.status += 1;
      return { ok: true, json: async () => ({ status: statuses[idx] }), text: async () => "" };
    }
    if (url === responseUrl) {
      calls.result += 1;
      return { ok: true, json: async () => result, text: async () => "" };
    }
    throw new Error(`예상 못한 URL 을 불렀다 — 받은 status_url/response_url 을 안 쓰고 조립한 것 아닌가: ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

async function grantCredits() {
  await getStore().insertGrant({ user_id: U, amount_credits: 1000, reason: "테스트", granted_by: "admin" });
}

describe("광고 영상 생성", () => {
  afterEach(() => { delete process.env.SHOTFORM_FAKE; resetMemoryStore(); });

  it("t2v 는 사진 없이 부른다 — 접수는 큐 엔드포인트로 간다", async () => {
    resetMemoryStore();
    await grantCredits();
    let seen;
    const fetchImpl = fakeQueueFetch({ onSubmit: (s) => { seen = s; } });
    const out = await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl, waitImpl: noWait })
    );
    // ★ 지키려는 것: fal.run(동기) 으로 되돌아가면 이 두 단정 중 하나가 깨진다.
    expect(seen.url.startsWith("https://queue.fal.run/")).toBe(true);
    expect(seen.url).toContain("text-to-video");
    expect(seen.body.duration).toBe(15);
    expect(seen.body.aspect_ratio).toBe("9:16");
    expect(seen.body.resolution).toBe("720p");
    expect(seen.body.image_urls).toBeUndefined();
    expect(out.url).toBe("https://fal.example/v.mp4");
    expect(out.seconds).toBe(15);
  });

  it("i2v 는 사진 한 장을 image_url 로 넘긴다", async () => {
    resetMemoryStore();
    await grantCredits();
    let seen;
    const fetchImpl = fakeQueueFetch({ onSubmit: (s) => { seen = s; } });
    await runWithActor(U, () =>
      generateAdVideo({
        project, scenario: { text: "P", endpoint: "i2v" },
        refs: [{ key: "a.png", bytes: Buffer.from("x") }], fetchImpl, waitImpl: noWait,
      })
    );
    expect(seen.url).toContain("image-to-video");
    expect(seen.body.image_url).toMatch(/^data:image\/png;base64,/);
  });

  it("r2v 는 여러 장을 image_urls 로 넘긴다", async () => {
    resetMemoryStore();
    await grantCredits();
    let seen;
    const fetchImpl = fakeQueueFetch({ onSubmit: (s) => { seen = s; } });
    await runWithActor(U, () =>
      generateAdVideo({
        project, scenario: { text: "P", endpoint: "r2v" },
        refs: [{ key: "a.png", bytes: Buffer.from("x") }, { key: "b.jpg", bytes: Buffer.from("y") }],
        fetchImpl, waitImpl: noWait,
      })
    );
    expect(seen.url).toContain("reference-to-video");
    expect(seen.body.image_urls.length).toBe(2);
  });

  it("★ 접수 → IN_QUEUE → IN_PROGRESS → COMPLETED → 결과 수령 전체 흐름을 순서대로 겪는다", async () => {
    resetMemoryStore();
    await grantCredits();
    const fetchImpl = fakeQueueFetch({ statuses: ["IN_QUEUE", "IN_PROGRESS", "IN_PROGRESS", "COMPLETED"] });
    const out = await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl, waitImpl: noWait })
    );
    // ★ 지키려는 것: 상태를 한 번만 물어보고 끝내 버리면(폴링이 사라지면) status 호출이
    // 1이 되고, 이 단정이 실패한다. COMPLETED 를 기다리지 않고 아무 상태에서나 결과를
    // 수령하면 이 시퀀스가 아니어도 통과해 버려 의미가 없어진다 — 그래서 여러 단계를 둔다.
    expect(fetchImpl.calls.submit).toBe(1);
    expect(fetchImpl.calls.status).toBe(4);
    expect(fetchImpl.calls.result).toBe(1);
    expect(out.url).toBe("https://fal.example/v.mp4");
  });

  it("접수 응답의 status_url·response_url 을 그대로 쓴다 — 우리가 조립하지 않는다", async () => {
    resetMemoryStore();
    await grantCredits();
    // statusUrl·responseUrl 이 기본값부터 이미 "추측 불가능"이라, 구현이 이걸 무시하고
    // 직접 경로를 조립하면 fakeQueueFetch 의 catch-all 이 던져 이 테스트가 실패한다.
    const fetchImpl = fakeQueueFetch({ statuses: ["COMPLETED"] });
    const out = await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl, waitImpl: noWait })
    );
    expect(out.url).toBe("https://fal.example/v.mp4");
    expect(fetchImpl.calls.status).toBeGreaterThanOrEqual(1);
    expect(fetchImpl.calls.result).toBe(1);
  });

  it("접수하면서 request_id 를 콜백으로 즉시 알려준다 — 폴링이 끝나기 전이다", async () => {
    resetMemoryStore();
    await grantCredits();
    const seenIds = [];
    // COMPLETED 가 나오기까지 상태를 두 번 물어야 하므로, onRequestId 가 그 앞에서
    // 이미 불렸는지(콜백이 폴링 완료를 기다리지 않는지)를 확인할 수 있다.
    const fetchImpl = fakeQueueFetch({ statuses: ["IN_PROGRESS", "IN_PROGRESS", "COMPLETED"], requestId: "req-early" });
    await runWithActor(U, () =>
      generateAdVideo({
        project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl, waitImpl: noWait,
        onRequestId: (id) => { seenIds.push({ id, statusCallsSoFar: fetchImpl.calls.status }); },
      })
    );
    // ★ 지키려는 것: 콜백을 안 부르거나 값이 틀리면 실패한다. 폴링이 다 끝난 뒤에야
    // 부르면(서버 재시작 대비가 무의미해지면) statusCallsSoFar 가 마지막 값과 같아진다 —
    // 여기서는 아직 다 안 돈 시점(3보다 작음)이어야 "즉시"라는 의도가 산다.
    expect(seenIds.length).toBe(1);
    expect(seenIds[0].id).toBe("req-early");
    expect(seenIds[0].statusCallsSoFar).toBeLessThan(3);
  });

  it("★ 가짜 모드에서는 fal 을 안 부른다", async () => {
    resetMemoryStore();
    process.env.SHOTFORM_FAKE = "fal";
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}), text: async () => "" }; };
    const out = await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl, waitImpl: noWait })
    );
    expect(called).toBe(false);
    expect(out.url).toBeTruthy();
  });

  it("원장에 그 엔드포인트가 남는다 — 어느 모델로 만들었는지의 유일한 기록", async () => {
    resetMemoryStore();
    await grantCredits();
    const fetchImpl = fakeQueueFetch();
    await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl, waitImpl: noWait })
    );
    // ⚠️ lib/store/memory.js·lib/store/supabase.js 어디에도 `listCosts` 는 없다
    // (`allCosts()` 전체 목록과 `sumCosts({projectId, actor})` 합계뿐이다). 브리프가
    // 가정한 이름을 실제 계약(allCosts)에 맞춘다 — endpoint 문자열 자체를 확인해야
    // "어느 모델로 만들었는지의 유일한 기록"이라는 이 테스트의 취지가 산다.
    const rows = await getStore().allCosts();
    const mine = rows.filter((r) => r.project_id === project.id);
    // ★ 엔드포인트 문자열 자체는 다른 작업이 lib/ad/models.js 를 개편 중이라(fast 축 변경)
    // 여기서 하드코딩하지 않는다 — "bytedance/seedance" 접두사만 확인해도 이 테스트의
    // 취지(어느 모델인지 원장에 남는가)는 그대로 산다.
    expect(mine.some((r) => String(r.endpoint).startsWith("bytedance/seedance"))).toBe(true);
  });

  it("결과가 비면 던진다", async () => {
    resetMemoryStore();
    await grantCredits();
    const fetchImpl = fakeQueueFetch({ statuses: ["COMPLETED"], result: {} });
    await expect(
      runWithActor(U, () =>
        generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl, waitImpl: noWait })
      )
    ).rejects.toThrow();
  });

  it("상한을 넘으면 던진다 — 끝나지 않는 IN_PROGRESS 를 영원히 기다리지 않는다", async () => {
    resetMemoryStore();
    await grantCredits();
    let statusCalls = 0;
    const fetchImpl = async (url, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            request_id: "req-stuck",
            status_url: "https://queue.fal.run/_probe/stuck/status",
            response_url: "https://queue.fal.run/_probe/stuck/result",
            status: "IN_QUEUE",
          }),
          text: async () => "",
        };
      }
      if (url === "https://queue.fal.run/_probe/stuck/status") {
        statusCalls += 1;
        return { ok: true, json: async () => ({ status: "IN_PROGRESS" }), text: async () => "" };
      }
      throw new Error("response_url 을 부르면 안 된다 — 아직 COMPLETED 를 받은 적이 없다");
    };
    await expect(
      runWithActor(U, () =>
        generateAdVideo({
          project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl, waitImpl: noWait,
          pollIntervalMs: 10, maxWaitMs: 35, // 테스트 전용 — 4틱(40ms) 안에 상한(35ms)을 넘긴다
        })
      )
    ).rejects.toThrow();
    // ★ 지키려는 것: 첫 응답만 보고 바로 포기하면(폴링 자체가 없으면) 1이 되어 이 단정이
    // 실패한다. 반대로 상한 로직이 없어 무한 루프면 이 테스트 자체가 끝나지 않는다
    // (타임아웃으로 실패) — 두 실패 모양을 다 이 하나의 단정이 가른다.
    expect(statusCalls).toBeGreaterThanOrEqual(2);
  });
});
