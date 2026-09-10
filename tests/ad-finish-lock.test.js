// 원클릭 굽기 — **수거는 가볍게, 마무리는 한 번만**.
//
// 🔴 2026-09-08 프로덕션 사고에서 나온 판이다. 화면은 2초마다 `/status` 를 두드리는데,
//    수거가 fal 완성을 보는 순간 **그 요청 안에서** 영상을 내려받고 → 저장하고 → 자막을
//    ffmpeg 로 구웠다. 그 라우트 상한은 60초이고, 화면은 응답을 기다리지 않고 계속 쏜다.
//    그래서 무거운 일이 수십 개 겹쳤고 인스턴스가 메모리 초과로 죽었다(실측: 3분 21초 동안
//    500 OOM 70건 · 504 타임아웃 14건 · 성공 0건). 마무리가 끝나야 ad_job 이 지워지는데
//    아무도 못 끝내니 문서는 영원히 rendering — 사장님 화면은 25분째 "만드는 중"이고
//    fal 에는 영상이 멀쩡히 있었다.
//
// 그래서 둘로 나눈다:
//   · 수거(collectAdRender) — fal 에 한 번 묻고 **끝났다는 사실만** 문서에 적는다(가볍다)
//   · 마무리(finishAdRender) — 잠금을 쥔 하나만 내려받기·저장·자막을 한다(무겁다)
//
// ⚠️ 잠금에는 **수명**이 있어야 한다. 이 사고에서 잠금을 쥔 인스턴스가 죽었기 때문이다 —
//    수명이 없으면 그 편은 영영 마무리되지 않는다.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { startAdRender, collectAdRender, finishAdRender } from "../lib/ad/pipeline.js";
import { balanceFor } from "../lib/charges.js";

const U = "00000000-0000-4000-8000-00000000000c";
const SETTINGS = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0",
};
const scenario = { text: "P", shots: [{ beat: "가" }], endpoint: "t2v" };

const JOB = {
  requestId: "req-lock", statusUrl: "https://q/status", responseUrl: "https://q/result",
  endpoint: "bytedance/seedance-2.0/text-to-video", seconds: 15,
};

async function makeAd() {
  const p = await runWithActor(U, () =>
    createProject({ settings: SETTINGS, material: { text: "앰플 광고", photos: [] }, ownerId: U, kind: "ad" })
  );
  const store = getStore();
  const row = await store.selectProject(p.id, U);
  await store.updateProjectRow(p.id, U, row.version, { ...row.doc, scenario, status: "scenario" });
  await store.insertGrant({ user_id: U, amount_credits: 500, reason: "t" });
  return p;
}

const H = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };

const submitOk = async () => ({ ...JOB });
const doneNow = async () => ({ done: true, url: "https://fal.example/v.mp4", seconds: 15 });

// 문서를 손으로 고친다 — 잠금이 낡은 상태·상한을 넘긴 상태를 만들 때 쓴다.
async function patchDoc(id, patch) {
  const store = getStore();
  const row = await store.selectProject(id, U);
  await store.updateProjectRow(id, U, row.version, { ...row.doc, ...patch(row.doc) });
}

async function submitted() {
  const p = await makeAd();
  await runWithActor(U, () => startAdRender(p.id, U, { submitAdVideo: submitOk, storeVideo: async () => "x" }));
  return p;
}

describe("원클릭 — 수거는 가볍고 마무리는 하나만", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 수거는 무거운 일을 하지 않는다 — fal 이 끝났어도 내려받지 않는다", async () => {
    const p = await submitted();
    let stored = 0;
    await runWithActor(U, () =>
      collectAdRender(p.id, U, {
        collectAdVideo: doneNow,
        storeVideo: async () => { stored += 1; return `/api/renders/${p.id}-raw.mp4`; },
      })
    );

    // 내려받기·저장은 마무리의 일이다. 여기서 하면 60초 라우트가 또 죽는다.
    expect(stored).toBe(0);
    const back = await getProject(p.id, U);
    // 끝났다는 **사실만** 적는다 — 마무리가 이것을 보고 이어받는다
    expect(back.ad_job?.ready?.url).toBe("https://fal.example/v.mp4");
    expect(back.status).toBe("rendering");
    expect(back.videos ?? []).toHaveLength(0);
  });

  it("★ 마무리가 완성으로 넘긴다 — 그때 접수증이 지워진다", async () => {
    const p = await submitted();
    await runWithActor(U, () => collectAdRender(p.id, U, { collectAdVideo: doneNow }));

    await runWithActor(U, () =>
      finishAdRender(p.id, U, { storeVideo: async () => `/api/renders/${p.id}-raw.mp4` })
    );

    const back = await getProject(p.id, U);
    expect(back.status).toBe("done");
    expect(back.videos).toHaveLength(1);
    expect(back.videos[0].url).toBe(`/api/renders/${p.id}-raw.mp4`);
    expect(back.ad_job ?? null).toBe(null);
  });

  it("★★★ 마무리가 진짜로 겹쳐도 한 번만 내려받는다 (이 사고의 핵심)", async () => {
    const p = await submitted();
    await runWithActor(U, () => collectAdRender(p.id, U, { collectAdVideo: doneNow }));

    // 첫 마무리를 **끝나지 않게 붙잡아 둔다** — 프로덕션에서 무거운 일이 60초 넘게
    // 걸리는 동안 다음 폴링이 들어오던 그 상황이다.
    let release;
    const held = new Promise((r) => { release = r; });
    let stored = 0;
    const slowStore = async () => { stored += 1; await held; return `/api/renders/${p.id}-raw.mp4`; };

    const first = runWithActor(U, () => finishAdRender(p.id, U, { storeVideo: slowStore }));
    // 첫 판이 잠금을 쥔 사이에 들어온 둘째·셋째
    const second = await runWithActor(U, () => finishAdRender(p.id, U, { storeVideo: slowStore }));
    const third = await runWithActor(U, () => finishAdRender(p.id, U, { storeVideo: slowStore }));
    release();
    await first;

    expect(stored).toBe(1);
    expect(second.skipped).toBe(true);
    expect(third.skipped).toBe(true);
    const back = await getProject(p.id, U);
    expect(back.videos).toHaveLength(1);
  });

  it("★ 잠금을 쥔 채 죽은 인스턴스가 있어도 그 편은 살아난다 — 잠금에 수명이 있다", async () => {
    const p = await submitted();
    await runWithActor(U, () => collectAdRender(p.id, U, { collectAdVideo: doneNow }));
    // 죽은 인스턴스가 쥐고 간 잠금(아주 옛날에 쥔 것)
    await patchDoc(p.id, (d) => ({ ad_job: { ...d.ad_job, finish: { token: "죽은-판", at: 1 } } }));

    const out = await runWithActor(U, () =>
      finishAdRender(p.id, U, { storeVideo: async () => `/api/renders/${p.id}-raw.mp4` })
    );

    expect(out.skipped ?? false).toBe(false);
    const back = await getProject(p.id, U);
    expect(back.status).toBe("done");
  });

  it("★ 다 만든 영상은 상한을 넘겨도 버리지 않는다", async () => {
    const p = await submitted();
    const paid = await balanceFor(U);
    await runWithActor(U, () => collectAdRender(p.id, U, { collectAdVideo: doneNow }));
    // 접수가 아주 옛날이었던 것으로 만든다(상한 초과)
    await patchDoc(p.id, (d) => ({ ad_job: { ...d.ad_job, startedAt: 0 } }));

    await runWithActor(U, () => collectAdRender(p.id, U, { collectAdVideo: doneNow }));

    const back = await getProject(p.id, U);
    // 실패로 뒤집지 않는다 — fal 이 이미 만들었고 값도 나갔다
    expect(back.status).toBe("rendering");
    expect(back.video_error ?? null).toBe(null);
    expect(back.ad_job?.ready?.url).toBe("https://fal.example/v.mp4");
    expect(await balanceFor(U)).toBe(paid);
  });

  it("★ 상태 라우트는 마무리가 필요하다고 말한다 — 그리고 무거운 일은 안 한다", async () => {
    const { GET: status } = await import("../app/api/ads/[id]/status/route.js");
    const p = await submitted();
    // fal 이 끝난 상태를 문서에 적어 둔다(수거가 하는 일과 같다)
    await patchDoc(p.id, (d) => ({
      ad_job: { ...d.ad_job, ready: { url: "https://fal.example/v.mp4", seconds: 15 } },
    }));

    const res = await status(new Request("http://x", { headers: H }), {
      params: Promise.resolve({ id: p.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("rendering");
    // 화면은 이 신호를 보고 마무리 라우트를 한 번 부른다
    expect(body.finish_needed).toBe(true);
    // 상태 라우트가 마무리까지 했으면 안 된다 — 그게 사고의 원인이었다
    expect((await getProject(p.id, U)).videos ?? []).toHaveLength(0);
  });

  it("★ 마무리 라우트가 그 편을 완성한다", async () => {
    const { POST: finish } = await import("../app/api/ads/[id]/finish/route.js");
    const p = await submitted();
    await runWithActor(U, () => collectAdRender(p.id, U, { collectAdVideo: doneNow }));

    // 라우트는 진짜 저장 경로를 탄다 — fal 에서 내려받는 자리만 막는다.
    // (자막은 이 시나리오에 대사가 없어 안 굽는다 — 그 갈래는 lib 테스트가 덮는다)
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(Buffer.from("mp4"), { status: 200 });
    let res;
    try {
      res = await finish(new Request("http://x", { method: "POST", headers: H }), {
        params: Promise.resolve({ id: p.id }),
      });
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(res.status).toBe(200);
    const back = await getProject(p.id, U);
    expect(back.status).toBe("done");
    expect(back.videos).toHaveLength(1);
  });

  it("★ 마무리 라우트에는 넉넉한 상한이 적혀 있다 — 60초로는 못 끝낸다", async () => {
    const src = readFileSync("app/api/ads/[id]/finish/route.js", "utf8");
    const m = src.match(/export const maxDuration\s*=\s*(\d+)/);
    expect(m, "마무리 라우트에 maxDuration 이 없다").toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(300);
  });

  it("★ 화면은 마무리를 **한 번만** 부른다 — 폴링마다 부르면 겹치기가 되돌아온다", () => {
    const src = readFileSync("app/ads/[id]/page.js", "utf8");
    expect(src).toMatch(/\/finish/);
    // 두 번 부르지 않게 붙잡아 두는 자리가 있어야 한다
    expect(src).toMatch(/finishRef|finishedOnce|calledFinish/);
  });

  it("마무리할 것이 없으면 아무 일도 안 한다", async () => {
    const p = await submitted(); // 아직 fal 이 안 끝났다 — ready 가 없다
    let stored = 0;
    const out = await runWithActor(U, () =>
      finishAdRender(p.id, U, { storeVideo: async () => { stored += 1; return "x"; } })
    );
    expect(stored).toBe(0);
    expect(out.nothing).toBe(true);
  });
});

// ★★★ 2026-09-10 — 완성본에 **각인(ts)** 이 붙는지 **실행으로** 잰다.
//   소스 문자열로만 재면 못 잡는 것이 있다: 각인을 처음 넣을 때 `now()` 를 썼는데 그
//   함수 안에 `now` 가 없어 **판은 초록인데 실행이 ReferenceError 로 죽는** 상태였다.
//   (이 저장소의 화면 판이 문법 오류를 못 잡는 것과 같은 결의 함정이다.)
// ★ 각인이 필요한 이유: 완성본 주소는 다시 구워도 `<id>.mp4` 로 같아서, 이것 없이는
//   app/api/renders 가 캐시를 걸 수 없다(옛 영상을 밀어낼 방법이 없다).
describe("완성본 각인 — 캐시가 걸릴 수 있게", () => {
  beforeEach(() => resetMemoryStore());

  it("★★★ 마무리가 videos[0].ts 를 **숫자로** 남긴다", async () => {
    const p = await submitted();
    await runWithActor(U, () => collectAdRender(p.id, U, { collectAdVideo: doneNow }));
    await runWithActor(U, () => finishAdRender(p.id, U, { storeVideo: async () => "/api/renders/x.mp4" }));

    const doc = await runWithActor(U, () => getProject(p.id, U));
    expect(typeof doc.videos?.[0]?.ts, "각인이 숫자가 아니다 — 캐시가 안 걸린다").toBe("number");
    expect(doc.videos[0].ts).toBeGreaterThan(0);
  });
});
