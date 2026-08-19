// 수거와 자막 — 굽기는 접수만 하고, 받아 오는 것은 여기다.
//
// 두 갈래를 잰다:
//  ① 소스 문자열 — 던지지 않는가 · 광고와 같은 자막 장치를 쓰는가
//  ② 실제로 돌려서 — **환불이 남의 회차를 되돌리지 않는가** · 자막을 못 태워도 원본이 남는가 ·
//    파일 이름에서 프로젝트 id 를 되찾을 수 있는가(못 되찾으면 저장은 되는데 열 수가 없다)
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("lib/film/pipeline.js", "utf8");

describe("수거", () => {
  it("★ 던지지 않는다 — 상태 조회가 부르므로 던지면 화면이 상태조차 못 읽는다", () => {
    expect(src).toMatch(/export async function collectFilmRender/);
    expect(src).toMatch(/catch/);
  });

  it("★ 자막을 태운다 — 광고와 같은 장치(adSubtitleCuts · burnSubtitles)", () => {
    expect(src).toMatch(/adSubtitleCuts/);
    expect(src).toMatch(/burnSubtitles/);
  });

  it("★ 자막을 못 태워도 원본을 완성본으로 쓴다 — 이미 값을 치른 영상을 잃지 않는다", () => {
    expect(src).toMatch(/rawUrl/);
  });
});

// ── 여기서부터는 실제로 돌린다 ────────────────────────────────────────────
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, updateProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { putFilm, FILM_IMAGE_LOCK_MS } from "../lib/film/doc.js";
import { collectFilmRender, startFilmRender } from "../lib/film/pipeline.js";
import { chargeAd, balanceFor } from "../lib/charges.js";
import { adVideoPrice } from "../lib/pricing.js";
import { GET as statusGET } from "../app/api/film/[id]/status/route.js";
import { GET as getRender } from "../app/api/renders/[name]/route.js";

const U = "00000000-0000-4000-8000-0000000000f7";
const H = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };
const req = () => new Request("http://localhost/x", { headers: H });
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const PRICE = adVideoPrice(15, "seedance-2.0", "480p");

const SCENARIO = {
  text: "Vertical 9:16 footage.",
  shots: [{ line: "안녕하세요", seconds: 15, shows: "A rabbit" }],
};

// 두 방식이 **둘 다 굽는 중**인 프로젝트. 회차도 실제 장부에 남긴다 —
// 이 파일이 재는 것의 절반이 "어느 회차가 되돌아가는가"라서 가짜 회차로는 못 잰다.
async function bothRendering() {
  await getStore().insertGrant({ user_id: U, amount_credits: 1000, reason: "t" });
  const p = await runWithActor(U, () =>
    createProject({
      ownerId: U, kind: "film",
      material: { text: "라벤더 토끼 인형", photos: [] },
      settings: { seconds: 15, resolution: "480p", model: "seedance-2.0", aspect_ratio: "9:16", narration_lang: "ko" },
    })
  );
  // 회차 번호는 **chargeAd 가 준 값**을 그대로 쓴다 — 라우트가 하는 것과 같다.
  // (장부에 다시 물어보면 그 사이에 옆 방식이 연 회차가 나온다 — 그것이 이 파일이 재는 사고다.)
  const attempts = {};
  for (const mode of ["order", "refs"]) {
    const charged = await chargeAd({
      userId: U, projectId: p.id, seconds: 15, model: "seedance-2.0", resolution: "480p",
      openNewAttempt: true,
    });
    attempts[mode] = charged.attempt;
  }
  expect(attempts).toEqual({ order: 1, refs: 2 });
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

const DONE = { done: true, url: "https://fal.example/v.mp4", seconds: 15 };
const BYTES = new Uint8Array([1, 2, 3, 4]);
const stubFetch = () =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => BYTES.buffer })));

describe("수거 — 실제 동작", () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => vi.unstubAllGlobals());

  it("★ 아직이면 문서를 안 건드린다", async () => {
    const p = await bothRendering();
    const out = await runWithActor(U, () =>
      collectFilmRender(p.id, U, "order", { collectAdVideo: async () => ({ done: false }) })
    );
    expect(out).toEqual({ changed: false, pending: true });
    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.order.status).toBe("rendering");
  });

  it("★ 굽는 중이 아니면 fal 에 묻지도 않는다 — 겹친 수거가 여기서 멎는다", async () => {
    const p = await bothRendering();
    await runWithActor(U, () => updateProject(p.id, U, (d) => putFilm(d, "order", { status: "done", job: null })));
    const collect = vi.fn(async () => DONE);
    const out = await runWithActor(U, () => collectFilmRender(p.id, U, "order", { collectAdVideo: collect }));
    expect(out).toEqual({ changed: false });
    expect(collect).not.toHaveBeenCalled();
  });

  it("★ 완성되면 자막을 태우고, 파일 이름에 **방식**이 들어간다 — 이름이 하나면 나중 것이 앞 것을 덮어 비교가 사라진다", async () => {
    const p = await bothRendering();
    stubFetch();
    const burnt = [];
    for (const mode of ["order", "refs"]) {
      const out = await runWithActor(U, () =>
        collectFilmRender(p.id, U, mode, {
          collectAdVideo: async () => DONE,
          // 진짜 ffmpeg 를 안 부른다 — 여기서 재는 것은 **이름**이다
          burn: async (args) => { burnt.push(args); return { url: `/api/renders/${args.projectId}.mp4` }; },
        })
      );
      expect(out).toEqual({ changed: true, done: true });
    }
    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.order.video.url).toBe(`/api/renders/${p.id}-order.mp4`);
    expect(back.films.order.video.rawUrl).toBe(`/api/renders/${p.id}-order-raw.mp4`);
    expect(back.films.order.video.subtitled).toBe(true);
    expect(back.films.refs.video.url).toBe(`/api/renders/${p.id}-refs.mp4`);
    // 두 편이 서로 다른 파일이다 = 비교 대상이 살아 있다
    expect(back.films.order.video.rawUrl).not.toBe(back.films.refs.video.rawUrl);
    expect(await getStore().getObject("renders", `${p.id}-order-raw.mp4`)).toBeTruthy();
    expect(await getStore().getObject("renders", `${p.id}-refs-raw.mp4`)).toBeTruthy();
    // 자막 언어는 나레이션 언어이고, 원문도 같은 값이다(번역 단계가 없다)
    expect(burnt[0].lang).toBe("ko");
    expect(burnt[0].sourceLang).toBe("ko");
    expect(burnt[0].cuts[0].sentence).toBe("안녕하세요");
    // 수거가 끝나면 접수증을 지운다 — 남기면 다음 폴링이 또 수거하려 든다
    expect(back.films.order.job).toBeNull();
  });

  it("★ 자막을 못 태워도 원본을 완성본으로 쓴다 — 이미 값을 치른 영상을 잃지 않는다", async () => {
    const p = await bothRendering();
    stubFetch();
    const out = await runWithActor(U, () =>
      collectFilmRender(p.id, U, "order", {
        collectAdVideo: async () => DONE,
        burn: async () => { throw new Error("ffmpeg 가 없어요"); },
      })
    );
    expect(out.done).toBe(true);
    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.order.status).toBe("done");
    expect(back.films.order.video.url).toBe(`/api/renders/${p.id}-order-raw.mp4`);
    expect(back.films.order.video.subtitled).toBe(false);
    // ★ 값은 그대로 받는다 — 영상은 나왔다
    expect(await balanceFor(U)).toBe(1000 - PRICE * 2);
  });

  it("★★ 수거가 실패하면 **그 방식의 회차만** 되돌린다 — 옆 방식의 값이 돌아가면 안 된다", async () => {
    const p = await bothRendering();
    const out = await runWithActor(U, () =>
      collectFilmRender(p.id, U, "order", {
        collectAdVideo: async () => { throw new Error("영상 생성 실패 (500)"); },
      })
    );
    // 던지지 않는다 — 상태 조회가 부르는 자리다
    expect(out.changed).toBe(true);
    expect(out.error).toMatch(/500/);

    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.order.status).toBe("error");
    expect(back.films.order.error).toMatch(/500/);
    expect(back.films.order.job).toBeNull();
    // 옆 방식은 그대로 굽는 중이다
    expect(back.films.refs.status).toBe("rendering");
    // 한 편 값만 돌아갔다
    expect(await balanceFor(U)).toBe(1000 - PRICE);
    // 그리고 그 한 편은 **order 의 회차(1)** 다 — refs 의 회차(2)는 살아 있어야 한다
    expect(await getStore().findCharge(`refund_ad:${p.id}:1`)).toBeTruthy();
    expect(await getStore().findCharge(`refund_ad:${p.id}:2`)).toBeFalsy();
  });

  it("★ 상한을 넘기면 기다림을 끝낸다 — 그때도 그 회차만 되돌아간다", async () => {
    const p = await bothRendering();
    const out = await runWithActor(U, () =>
      collectFilmRender(p.id, U, "refs", {
        collectAdVideo: async () => ({ done: false }),
        now: () => Date.now() + 1000 * 60 * 60 * 24,
      })
    );
    expect(out.error).toMatch(/오래/);
    expect(await getStore().findCharge(`refund_ad:${p.id}:2`)).toBeTruthy();
    expect(await getStore().findCharge(`refund_ad:${p.id}:1`)).toBeFalsy();
  });

  it("★ 모르는 방식에도 던지지 않는다", async () => {
    const p = await bothRendering();
    await expect(runWithActor(U, () => collectFilmRender(p.id, U, "nope"))).resolves.toEqual({ changed: false });
  });
});

// ★★ 경합 — 이 기능이 노리는 [둘 다 굽기] 흐름 그대로다: A 가 청구하고, **그 뒤에** B 가
//   청구하고, 그러고 나서 A 가 접수증을 쓴다. 이때 A 가 장부에 "살아 있는 마지막 회차"를
//   물어보면 B 의 회차(2)가 나온다 — 그러면 A 의 수거 실패가 B 의 값을 환불한다.
//   그래서 회차는 **청구가 준 번호**여야 한다.
describe("회차는 청구가 준 번호다 — 물어보면 경합에 진다", () => {
  beforeEach(() => resetMemoryStore());

  it("★★ A 청구 → B 청구 → A 접수 순서에도 A 의 접수증에는 자기 회차(1)가 남는다", async () => {
    await getStore().insertGrant({ user_id: U, amount_credits: 1000, reason: "t" });
    const p = await runWithActor(U, () =>
      createProject({
        ownerId: U, kind: "film",
        material: { text: "토끼", photos: [] },
        settings: { seconds: 15, resolution: "480p", model: "seedance-2.0", aspect_ratio: "9:16" },
      })
    );
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => {
        let out = { ...d, scenario: SCENARIO };
        for (const mode of ["order", "refs"]) {
          out = putFilm(out, mode, { images: [{ key: "shot-1", url: "https://fal.example/a.png" }] });
        }
        return out;
      })
    );
    const charge = () =>
      chargeAd({ userId: U, projectId: p.id, seconds: 15, model: "seedance-2.0", resolution: "480p", openNewAttempt: true });

    const a = await charge();          // order 가 먼저 산다
    const b = await charge();          // 그 사이에 refs 가 산다
    expect([a.attempt, b.attempt]).toEqual([1, 2]);

    const fake = { submitAdVideo: async () => ({ requestId: "r", seconds: 15, statusUrl: "s", responseUrl: "u" }) };
    // A 가 **나중에** 접수해도 자기 번호를 쥐고 있다
    await runWithActor(U, () => startFilmRender(p.id, U, "order", { ...fake, attempt: a.attempt }));
    await runWithActor(U, () => startFilmRender(p.id, U, "refs", { ...fake, attempt: b.attempt }));

    const back = await runWithActor(U, () => getProject(p.id, U));
    expect(back.films.order.job.attempt).toBe(1);
    expect(back.films.refs.job.attempt).toBe(2);

    // 그리고 order 수거가 실패하면 되돌아가는 것은 **1번 회차**다
    await runWithActor(U, () =>
      collectFilmRender(p.id, U, "order", { collectAdVideo: async () => { throw new Error("500"); } })
    );
    expect(await getStore().findCharge(`refund_ad:${p.id}:1`)).toBeTruthy();
    expect(await getStore().findCharge(`refund_ad:${p.id}:2`)).toBeFalsy();
  });

  it("★ 안 걷혔으면 회차도 없다 — 남의 살아 있는 회차를 자기 것으로 착각하면 안 된다", async () => {
    await getStore().insertGrant({ user_id: U, amount_credits: 1000, reason: "t" });
    const P = "00000000-0000-4000-8000-0000000000c1";
    const first = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(first.attempt).toBe(1);
    const again = await chargeAd({ userId: U, projectId: P, seconds: 15 });   // 살아 있는 청구가 있다
    expect(again).toEqual({ credits: 0, attempt: null });
  });
});

// ★★ 이름을 못 되찾으면 저장은 되는데 **열 수가 없다** — app/api/renders/[name] 라우트가
//   이름에서 프로젝트 id 를 되찾아 소유자를 검사하기 때문이다. 겉보기엔 URL 이 문서에 있어
//   멀쩡해 보이므로, 이 그물이 없으면 라이브에서 재생만 안 되는 조용한 실패가 된다.
describe("방식이 들어간 이름도 열린다", () => {
  beforeEach(() => resetMemoryStore());

  const seed = async (suffix) => {
    const p = await runWithActor(U, () =>
      createProject({ ownerId: U, kind: "film", material: { text: "토끼", photos: [] }, settings: {} })
    );
    await getStore().putObject("renders", `${p.id}${suffix}`, Buffer.from("바이트"), "video/mp4");
    return p;
  };

  for (const suffix of ["-order.mp4", "-order-raw.mp4", "-refs.mp4", "-refs-raw.mp4"]) {
    it(`★ <id>${suffix} 가 열린다`, async () => {
      const p = await seed(suffix);
      const res = await getRender(req(), { params: Promise.resolve({ name: `${p.id}${suffix}` }) });
      expect(res.status).toBe(200);
    });
  }

  it("★ film 영상도 304 를 탄다 — ETag 는 films[방식].video.ts 에서 온다", async () => {
    const p = await bothRendering();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => BYTES.buffer })));
    await runWithActor(U, () =>
      collectFilmRender(p.id, U, "order", {
        collectAdVideo: async () => DONE,
        burn: async (args) => ({ url: `/api/renders/${args.projectId}.mp4` }),
      })
    );
    vi.unstubAllGlobals();
    const name = `${p.id}-order.mp4`;
    // 자막본 바이트는 가짜 burn 이 안 만들었다 — 라우트가 흘려줄 파일만 채워 준다
    await getStore().putObject("renders", name, Buffer.from("자막본"), "video/mp4");
    const first = await getRender(req(), { params: Promise.resolve({ name }) });
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();
    const again = await getRender(
      new Request("http://localhost/x", { headers: { ...H, "if-none-match": etag } }),
      { params: Promise.resolve({ name }) }
    );
    expect(again.status).toBe(304);
  });

  it("★ 광고 이름은 그대로 통과한다 — 넓히되 기존 것을 깨지 않는다", async () => {
    const p = await seed("-raw.mp4");
    const res = await getRender(req(), { params: Promise.resolve({ name: `${p.id}-raw.mp4` }) });
    expect(res.status).toBe(200);
  });

  it("★ 아무 꼬리표나 받지는 않는다", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    for (const name of [`${id}-nope.mp4`, `${id}-orderx.mp4`, "hack-order.mp4", `${id}-orderXmp4`]) {
      const res = await getRender(req(), { params: Promise.resolve({ name }) });
      expect(res.status, name).toBe(400);
    }
  });
});

// ★★ 화면은 status 만 보고 잠근다. 서버는 10분이 지나면 "drawing" 이 남아 있어도 열어 주는데,
//   그 만료 계산을 화면에 두면 판정이 두 벌이 된다 — 그래서 상태 응답이 답을 실어 나른다.
describe("상태 라우트", () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => vi.unstubAllGlobals());

  const make = async (patch) => {
    const p = await runWithActor(U, () =>
      createProject({ ownerId: U, kind: "film", material: { text: "토끼", photos: [] }, settings: { seconds: 15 } })
    );
    if (patch) await runWithActor(U, () => updateProject(p.id, U, (d) => putFilm(d, "order", patch)));
    return p;
  };

  it("★ 두 방식을 한 번에 준다", async () => {
    const p = await make();
    const data = await (await statusGET(req(), ctx(p.id))).json();
    expect(Object.keys(data.films).sort()).toEqual(["order", "refs"]);
    expect(data.films.order.status).toBe("draft");
    expect(data.films.order.canDraw).toBe(true);
  });

  it("★ 그리는 중에는 canDraw 가 false 다", async () => {
    const p = await make({ status: "drawing", drawingAt: Date.now() });
    const data = await (await statusGET(req(), ctx(p.id))).json();
    expect(data.films.order.canDraw).toBe(false);
    expect(data.films.refs.canDraw).toBe(true);
  });

  it("★★ 잠금이 만료되면 canDraw 가 다시 true 다 — 인스턴스가 죽어도 화면이 잠긴 채로 남지 않는다", async () => {
    const p = await make({ status: "drawing", drawingAt: Date.now() - FILM_IMAGE_LOCK_MS - 1 });
    const data = await (await statusGET(req(), ctx(p.id))).json();
    // status 는 여전히 "drawing" 이다 — 화면이 그것만 봤다면 영영 잠긴 채였다
    expect(data.films.order.status).toBe("drawing");
    expect(data.films.order.canDraw).toBe(true);
  });

  it("★ 굽는 중이면 수거를 시도한다 — 아무도 안 두드리면 수거도 안 된다", async () => {
    const p = await bothRendering();
    // fal 로 진짜 나가지 않는다 — 상태 조회를 막는다(수거는 실패하고 문서에 남는다)
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "" })));
    const data = await (await statusGET(req(), ctx(p.id))).json();
    expect(data.films.order.status).toBe("error");
    expect(data.films.order.error).toBeTruthy();
  });

  it("★ 다른 종류의 문서는 404 — film 문서만 이 문을 지난다", async () => {
    const p = await runWithActor(U, () =>
      createProject({ ownerId: U, kind: "ad", material: { text: "토끼", photos: [] }, settings: {} })
    );
    expect((await statusGET(req(), ctx(p.id))).status).toBe(404);
  });
});
