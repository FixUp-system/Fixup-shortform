// 필름 — **수거는 가볍게, 마무리는 방식마다 하나만**.
//
// 🔴 광고에서 실제로 터진 사고를 필름에도 미리 막는 판이다(2026-09-08). 광고 쪽 내력은
//    tests/ad-finish-lock.test.js 에 있다. 요지: 수거가 fal 완성을 보는 순간 **그 요청 안에서**
//    내려받고·저장하고·자막을 구웠는데, 그 라우트 상한이 60초이고 화면은 응답을 안 기다리고
//    2초마다 두드린다 → 무거운 일이 겹쳐 인스턴스가 메모리 초과로 죽고, 마무리가 끝나야
//    지워지는 접수증이 영영 안 지워져 화면은 "만드는 중"에 갇혔다.
//
// ★ 필름은 광고보다 한 겹 더 무겁다 — 상태 라우트가 **방식마다**(order·refs) 수거를 돌아
//   한 요청이 무거운 일을 두 번 할 수 있다. 그래서 잠금도 **방식별**이어야 한다:
//   한 방식이 마무리 중이라고 옆 방식이 막히면, 둘 다 굽는 정상 흐름이 반쪽이 된다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, updateProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { putFilm } from "../lib/film/doc.js";
import { collectFilmRender, finishFilmRender } from "../lib/film/pipeline.js";
import { chargeAd, balanceFor } from "../lib/charges.js";
import { adVideoPrice } from "../lib/pricing.js";

const U = "00000000-0000-4000-8000-0000000000f8";
const H = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };
const PRICE = adVideoPrice(15, "seedance-2.0", "480p");

const SCENARIO = { text: "Vertical 9:16 footage.", shots: [{ line: "안녕하세요", seconds: 15, shows: "A rabbit" }] };
const DONE = { done: true, url: "https://fal.example/v.mp4", seconds: 15 };
const BYTES = new Uint8Array([1, 2, 3, 4]);
const stubFetch = () =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => BYTES.buffer })));

// 두 방식이 둘 다 굽는 중인 프로젝트(tests/film-collect.js 의 fixture 와 같은 모양).
async function bothRendering() {
  await getStore().insertGrant({ user_id: U, amount_credits: 1000, reason: "t" });
  const p = await runWithActor(U, () =>
    createProject({
      ownerId: U, kind: "film",
      material: { text: "라벤더 토끼 인형", photos: [] },
      settings: { seconds: 15, resolution: "480p", model: "seedance-2.0", aspect_ratio: "9:16", narration_lang: "ko" },
    })
  );
  const attempts = {};
  for (const mode of ["order", "refs"]) {
    const charged = await chargeAd({
      userId: U, projectId: p.id, seconds: 15, model: "seedance-2.0", resolution: "480p", openNewAttempt: true,
    });
    attempts[mode] = charged.attempt;
  }
  await runWithActor(U, () =>
    updateProject(p.id, U, (d) => {
      let out = { ...d, scenario: SCENARIO };
      for (const mode of ["order", "refs"]) {
        out = putFilm(out, mode, {
          status: "rendering",
          images: [{ key: "shot-1", url: "https://fal.example/a.png" }],
          job: {
            requestId: `req-${mode}`, seconds: 15, startedAt: Date.now(),
            statusUrl: "https://queue.fal.example/status", responseUrl: "https://queue.fal.example/result",
            attempt: attempts[mode],
          },
        });
      }
      return out;
    })
  );
  return p;
}

// 자막은 진짜 ffmpeg 를 안 부른다 — 이 파일이 재는 것은 **누가 몇 번 하는가**다.
const burnOk = async (args) => ({ url: `/api/renders/${args.projectId}.mp4` });

describe("필름 — 수거는 가볍고 마무리는 방식마다 하나만", () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => vi.unstubAllGlobals());

  it("★ 수거는 무거운 일을 하지 않는다 — fal 이 끝났어도 내려받지 않는다", async () => {
    const p = await bothRendering();
    let stored = 0;
    await runWithActor(U, () =>
      collectFilmRender(p.id, U, "order", {
        collectAdVideo: async () => DONE,
        storeFilmVideo: async () => { stored += 1; return `/api/renders/${p.id}-order-raw.mp4`; },
        burn: burnOk,
      })
    );

    expect(stored).toBe(0);
    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.order.job?.ready?.url).toBe("https://fal.example/v.mp4");
    expect(back.films.order.status).toBe("rendering");
    expect(back.films.order.video ?? null).toBe(null);
  });

  it("★ 마무리가 완성으로 넘긴다 — 파일 이름의 방식은 그대로다", async () => {
    const p = await bothRendering();
    stubFetch();
    await runWithActor(U, () => collectFilmRender(p.id, U, "order", { collectAdVideo: async () => DONE }));

    await runWithActor(U, () => finishFilmRender(p.id, U, "order", { burn: burnOk }));

    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.order.status).toBe("done");
    expect(back.films.order.video.rawUrl).toBe(`/api/renders/${p.id}-order-raw.mp4`);
    expect(back.films.order.job).toBeNull();
    // 값은 그대로 받는다 — 두 편 다 굽는 중이므로 환불이 없다
    expect(await balanceFor(U)).toBe(1000 - PRICE * 2);
  });

  it("★★★ 마무리가 진짜로 겹쳐도 한 번만 내려받는다", async () => {
    const p = await bothRendering();
    stubFetch();
    await runWithActor(U, () => collectFilmRender(p.id, U, "order", { collectAdVideo: async () => DONE }));

    let release;
    const held = new Promise((r) => { release = r; });
    let stored = 0;
    const slowStore = async () => { stored += 1; await held; return `/api/renders/${p.id}-order-raw.mp4`; };

    const first = runWithActor(U, () => finishFilmRender(p.id, U, "order", { storeFilmVideo: slowStore, burn: burnOk }));
    const second = await runWithActor(U, () =>
      finishFilmRender(p.id, U, "order", { storeFilmVideo: slowStore, burn: burnOk })
    );
    release();
    await first;

    expect(stored).toBe(1);
    expect(second.skipped).toBe(true);
  });

  it("★★ 잠금은 **방식별**이다 — 한쪽이 굽는 중이라고 옆 방식이 막히면 안 된다", async () => {
    const p = await bothRendering();
    stubFetch();
    for (const mode of ["order", "refs"]) {
      await runWithActor(U, () => collectFilmRender(p.id, U, mode, { collectAdVideo: async () => DONE }));
    }

    let release;
    const held = new Promise((r) => { release = r; });
    const slowOrder = async () => { await held; return `/api/renders/${p.id}-order-raw.mp4`; };

    const first = runWithActor(U, () =>
      finishFilmRender(p.id, U, "order", { storeFilmVideo: slowOrder, burn: burnOk })
    );
    // order 가 잠금을 쥔 사이에 refs 를 마무리한다 — 막히면 안 된다
    const refs = await runWithActor(U, () => finishFilmRender(p.id, U, "refs", { burn: burnOk }));
    release();
    await first;

    expect(refs.skipped ?? false).toBe(false);
    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.refs.status).toBe("done");
    expect(back.films.order.status).toBe("done");
  });

  it("★ 잠금을 쥔 채 죽은 인스턴스가 있어도 그 편은 살아난다 — 잠금에 수명이 있다", async () => {
    const p = await bothRendering();
    stubFetch();
    await runWithActor(U, () => collectFilmRender(p.id, U, "order", { collectAdVideo: async () => DONE }));
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) =>
        putFilm(d, "order", { job: { ...d.films.order.job, finish: { token: "죽은-판", at: 1 } } })
      )
    );

    const out = await runWithActor(U, () => finishFilmRender(p.id, U, "order", { burn: burnOk }));

    expect(out.skipped ?? false).toBe(false);
    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.order.status).toBe("done");
  });

  it("★ 다 만든 영상은 상한을 넘겨도 버리지 않는다", async () => {
    const p = await bothRendering();
    await runWithActor(U, () => collectFilmRender(p.id, U, "order", { collectAdVideo: async () => DONE }));

    const out = await runWithActor(U, () =>
      collectFilmRender(p.id, U, "order", {
        collectAdVideo: async () => DONE,
        now: () => Date.now() + 1000 * 60 * 60 * 24, // 상한을 한참 넘긴 시각
      })
    );

    expect(out.error ?? null).toBe(null);
    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.order.status).toBe("rendering");
    expect(back.films.order.job?.ready?.url).toBe("https://fal.example/v.mp4");
    // 환불이 일어나지 않았다 — 값을 치른 영상이 살아 있다
    expect(await balanceFor(U)).toBe(1000 - PRICE * 2);
  });

  it("★ 상태 라우트는 방식마다 마무리가 필요한지 말한다", async () => {
    const { GET: status } = await import("../app/api/film/[id]/status/route.js");
    const p = await bothRendering();
    await runWithActor(U, () => collectFilmRender(p.id, U, "order", { collectAdVideo: async () => DONE }));

    const res = await status(new Request("http://x", { headers: H }), { params: Promise.resolve({ id: p.id }) });
    const body = await res.json();

    expect(body.films.order.finish_needed).toBe(true);
    expect(body.films.refs.finish_needed).toBe(false);
    // 상태 라우트가 마무리까지 했으면 안 된다
    expect(body.films.order.status).toBe("rendering");
  });

  it("★ 마무리 라우트가 그 방식을 완성한다", async () => {
    const { POST: finish } = await import("../app/api/film/[id]/finish/route.js");
    const p = await bothRendering();
    stubFetch();
    await runWithActor(U, () => collectFilmRender(p.id, U, "refs", { collectAdVideo: async () => DONE }));

    const res = await finish(
      new Request("http://x", { method: "POST", headers: H, body: JSON.stringify({ mode: "refs" }) }),
      { params: Promise.resolve({ id: p.id }) }
    );

    expect(res.status).toBe(200);
    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.refs.status).toBe("done");
    expect(back.films.order.status).toBe("rendering"); // 옆 방식은 그대로다
  });

  it("★ 모르는 방식이면 400 — 광고와 달리 방식이 인자다", async () => {
    const { POST: finish } = await import("../app/api/film/[id]/finish/route.js");
    const p = await bothRendering();
    const res = await finish(
      new Request("http://x", { method: "POST", headers: H, body: JSON.stringify({ mode: "nope" }) }),
      { params: Promise.resolve({ id: p.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("★ 마무리 라우트에는 넉넉한 상한이 적혀 있다 — 60초로는 못 끝낸다", () => {
    const src = readFileSync("app/api/film/[id]/finish/route.js", "utf8");
    const m = src.match(/export const maxDuration\s*=\s*(\d+)/);
    expect(m, "마무리 라우트에 maxDuration 이 없다").toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(300);
  });

  it("★ 화면 둘 다 마무리를 부른다 — 한쪽만 고치면 그 화면에서만 사고가 남는다", () => {
    for (const f of ["app/film/one/[mode]/page.js", "app/film/[id]/[mode]/video/page.js"]) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} 가 마무리를 안 부른다`).toMatch(/\/finish/);
      expect(src, `${f} 에 겹치기 방지가 없다`).toMatch(/finishRef|finishingRef/);
    }
  });
});
