// 한 번에 굽는 영상 — 라우트 넷.
//
// 두 갈래를 잰다:
//  ① 소스 문자열 — 로그인·방식 검사·소유자 전달이 **모든** 라우트에 붙어 있는가
//  ② 실제로 돌려서 — **값이 나가기 전에 청구가 서는가**(이 경로만 무료가 되면 안 된다)
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("film 라우트", () => {
  const FILES = [
    "app/api/film/route.js",
    "app/api/film/[id]/scenario/route.js",
    "app/api/film/[id]/images/route.js",
    "app/api/film/[id]/render/route.js",
  ];

  for (const f of FILES) {
    it(`★ ${f} 가 있다`, () => expect(existsSync(f)).toBe(true));

    it(`★ ${f} 가 로그인을 요구한다 — 값이 나가는 자리다`, () => {
      expect(strip(readFileSync(f, "utf8"))).toMatch(/withUser|requireUser/);
    });
  }

  // ★ 시나리오 라우트는 여기 없다. 시나리오는 두 방식이 **공유하는 하나**다 —
  //   방식마다 새로 만들면 결과 차이가 방식 때문인지 시나리오 때문인지 알 수 없게 되고,
  //   그러면 이 기능 전체(어느 방식이 나은가를 재는 것)가 무의미해진다.
  it("★ 모르는 방식은 400 으로 막는다 — 라우트가 입구를 지킨다", () => {
    for (const f of ["app/api/film/[id]/images/route.js", "app/api/film/[id]/render/route.js"]) {
      expect(strip(readFileSync(f, "utf8")), `${f} 가 방식을 안 본다`).toMatch(/isFilmMode/);
    }
  });

  it("★ 소유자를 넘긴다 — 남의 프로젝트에서 값이 나가면 안 된다", () => {
    for (const f of FILES.slice(1)) {
      expect(strip(readFileSync(f, "utf8"))).toMatch(/user\.id/);
    }
  });
});

// ── 여기서부터는 실제로 돌린다 ────────────────────────────────────────────
//
// 파이프라인은 주입(모킹)으로 막는다 — 진짜로 돌면 fal 로 나간다.
// ★ 그래서 이 파일이 재는 것은 **라우트가 하는 일**이다: 청구·환불·게이트.
const filmMock = vi.hoisted(() => ({
  start: vi.fn(async () => ({ done: false, requestId: "req-1" })),
  images: vi.fn(async () => {}),
}));
vi.mock("../lib/film/pipeline.js", () => ({
  startFilmRender: (...a) => filmMock.start(...a),
  runFilmImages: (...a) => filmMock.images(...a),
}));

// 시나리오도 LLM 경계라 막는다.
const scenarioMock = vi.hoisted(() => ({
  make: vi.fn(async () => ({ text: "Vertical footage.", shots: [{ line: "안녕하세요", seconds: 15 }] })),
}));
vi.mock("../lib/ad/scenario.js", async (importOriginal) => ({
  ...(await importOriginal()),
  generateScenario: (...a) => scenarioMock.make(...a),
}));

import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { createProject, updateProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { putFilm, MAX_FILM_IMAGE_TRIES, FILM_IMAGE_LOCK_MS } from "../lib/film/doc.js";
import { balanceFor } from "../lib/charges.js";
import { adVideoPrice } from "../lib/pricing.js";

import { POST as createFilm } from "../app/api/film/route.js";
import { POST as scenarioPOST } from "../app/api/film/[id]/scenario/route.js";
import { POST as imagesPOST } from "../app/api/film/[id]/images/route.js";
import { POST as renderPOST } from "../app/api/film/[id]/render/route.js";

const U = "00000000-0000-4000-8000-0000000000f5";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const H = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user", "content-type": "application/json" };
const post = (body) =>
  new Request("http://localhost/api/film", { method: "POST", headers: H, body: JSON.stringify(body ?? {}) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

// 15초 · 480p · seedance-2.0 — 만들기 라우트가 박는 값 그대로다.
const PRICE = adVideoPrice(15, "seedance-2.0", "480p");

const grant = (n) =>
  getStore().insertGrant({ user_id: U, amount_credits: n, reason: "충전", granted_by: ADMIN });

const SCENARIO = { text: "Vertical 9:16 footage.", shots: [{ line: "안녕하세요", seconds: 15, shows: "A rabbit" }] };

// 그림까지 끝난 프로젝트 하나 — 굽기가 요구하는 상태다(두 방식 다 그림을 채운다).
async function readyFilm() {
  const p = await runWithActor(U, () =>
    createProject({
      ownerId: U, kind: "film",
      material: { text: "라벤더 토끼 인형", photos: [] },
      settings: { seconds: 15, resolution: "480p", model: "seedance-2.0", aspect_ratio: "9:16" },
    })
  );
  await runWithActor(U, () =>
    updateProject(p.id, U, (d) => {
      const withScenario = { ...d, scenario: SCENARIO };
      const a = putFilm(withScenario, "order", { images: [{ key: "shot-1", url: "https://fal.example/a.png" }] });
      return putFilm(a, "refs", { images: [{ key: "subject", url: "https://fal.example/b.png" }] });
    })
  );
  return p;
}

describe("만들기 라우트", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 길이·화질·모델을 라우트가 박는다 — 방식을 재는 자리라 조건이 같아야 한다", async () => {
    const res = await createFilm(post({ material: { text: "라벤더 토끼 인형" }, settings: { seconds: 30, resolution: "1080p", model: "seedance-2.5" } }));
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.kind).toBe("film");
    expect(doc.settings.seconds).toBe(15);
    expect(doc.settings.resolution).toBe("480p");
    expect(doc.settings.model).toBe("seedance-2.0");
  });

  it("★ 무엇을 만들지 안 적으면 400", async () => {
    expect((await createFilm(post({ material: { text: "  " } }))).status).toBe(400);
  });
});

describe("시나리오 라우트", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 방식을 안 본다 — 두 방식이 시나리오 하나를 공유해야 비교가 성립한다", async () => {
    const p = await runWithActor(U, () =>
      createProject({ ownerId: U, kind: "film", material: { text: "토끼" }, settings: { seconds: 15 } })
    );
    const res = await scenarioPOST(post({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(scenarioMock.make).toHaveBeenCalled();
    const doc = await runWithActor(U, () => getProject(p.id, U));
    expect(doc.scenario.text).toBe("Vertical footage.");
    // 시나리오는 방식 칸(films)을 건드리지 않는다
    expect(doc.films).toBeUndefined();
  });
});

describe("그림 라우트", () => {
  beforeEach(() => { resetMemoryStore(); filmMock.images.mockClear(); });

  it("★ 모르는 방식이면 400 이고 파이프라인은 안 돈다", async () => {
    const p = await readyFilm();
    const res = await imagesPOST(post({ mode: "nope" }), ctx(p.id));
    expect(res.status).toBe(400);
    expect(filmMock.images).not.toHaveBeenCalled();
  });

  it("★ 소유자와 방식을 그대로 넘긴다", async () => {
    const p = await readyFilm();
    const res = await imagesPOST(post({ mode: "refs" }), ctx(p.id));
    expect(res.status).toBe(200);
    expect(filmMock.images).toHaveBeenCalledWith(p.id, U, "refs");
  });

  it("★ 그리는 중이면 두 번째 요청을 막는다 — 청구가 없는 자리라 잠금이 유일한 그물이다", async () => {
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => putFilm(d, "order", { status: "drawing", drawingAt: Date.now() }))
    );
    const res = await imagesPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(409);
    expect(filmMock.images).not.toHaveBeenCalled();
  });

  it("★ 잠금은 영원하지 않다 — 인스턴스가 죽어 '그리는 중'이 남아도 다시 그릴 수 있다", async () => {
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) =>
        putFilm(d, "order", { status: "drawing", drawingAt: Date.now() - FILM_IMAGE_LOCK_MS - 1 }))
    );
    const res = await imagesPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(200);
    expect(filmMock.images).toHaveBeenCalled();
  });

  it("★ 다시 그리기에 상한이 있다 — 무료지만 무제한은 아니다", async () => {
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => putFilm(d, "order", { imageTries: MAX_FILM_IMAGE_TRIES }))
    );
    const res = await imagesPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(400);
    expect(filmMock.images).not.toHaveBeenCalled();
  });

  it("★ 한 번 그리면 회차가 하나 는다 — 상한이 실제로 세어진다", async () => {
    const p = await readyFilm();
    await imagesPOST(post({ mode: "order" }), ctx(p.id));
    const doc = await runWithActor(U, () => getProject(p.id, U));
    expect(doc.films.order.imageTries).toBe(1);
    // 방식이 다르면 회차도 따로 센다 — 두 벌을 남기는 문서 모양 그대로다
    expect(doc.films.refs.imageTries).toBeUndefined();
  });
});

describe("굽기 라우트 — 청구", () => {
  beforeEach(() => {
    resetMemoryStore();
    filmMock.start.mockClear();
    filmMock.start.mockImplementation(async () => ({ done: false, requestId: "req-1" }));
  });

  it("★ 굽기 전에 값을 받는다 — 이 경로만 무료로 영상을 굽는 길이 되면 안 된다", async () => {
    await grant(1000);
    const p = await readyFilm();
    const res = await renderPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(202);
    expect(await balanceFor(U)).toBe(1000 - PRICE);
  });

  it("★ 두 방식은 **각각** 값을 낸다 — 실제로 두 편을 만든다", async () => {
    await grant(1000);
    const p = await readyFilm();
    await renderPOST(post({ mode: "order" }), ctx(p.id));
    await renderPOST(post({ mode: "refs" }), ctx(p.id));
    expect(filmMock.start).toHaveBeenCalledTimes(2);
    expect(await balanceFor(U)).toBe(1000 - PRICE * 2);
  });

  it("★ 접수가 실패하면 되돌려준다 — 못 준 것은 받지 않는다", async () => {
    await grant(1000);
    const p = await readyFilm();
    // 진짜 파이프라인처럼 **문서에 실패를 적고** 던진다(lib/film/pipeline.js 의 failFilm).
    filmMock.start.mockImplementationOnce(async (pid, owner, mode) => {
      await updateProject(pid, owner, (d) => putFilm(d, mode, { status: "error", error: "fal 이 안 받아요" }));
      throw new Error("fal 이 안 받아요");
    });
    const res = await renderPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(400);
    expect(await balanceFor(U)).toBe(1000);
    const doc = await runWithActor(U, () => getProject(p.id, U));
    // ★ 라우트가 파이프라인이 적은 실패 상태를 **덮지 않는다** — 화면이 이 status 를 읽는다.
    expect(doc.films.order.status).toBe("error");
    expect(doc.films.order.error).toMatch(/fal/);
  });

  it("★ 청구가 안 걷히면(회차 충돌) 접수하지 않는다 — 공짜로 한 편이 나가는 길", async () => {
    await grant(1000);
    const p = await readyFilm();
    // insertCharge 가 false = `idem_key` 유니크 충돌(다른 요청이 같은 회차를 먼저 썼다).
    // chargeAd 가 0 을 돌려주는 유일한 길이라, 그 상황을 그 자리에서 만든다.
    const spy = vi.spyOn(getStore(), "insertCharge").mockResolvedValueOnce(false);
    const res = await renderPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(409);
    expect(filmMock.start).not.toHaveBeenCalled();
    expect(await balanceFor(U)).toBe(1000);
    spy.mockRestore();
  });

  it("★ 잔액이 모자라면 402 이고 fal 로 나가지 않는다", async () => {
    await grant(1);
    const p = await readyFilm();
    const res = await renderPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(402);
    expect(filmMock.start).not.toHaveBeenCalled();
    expect(await balanceFor(U)).toBe(1);
  });

  it("★ 모르는 방식은 청구도 접수도 없다", async () => {
    await grant(1000);
    const p = await readyFilm();
    const res = await renderPOST(post({ mode: "nope" }), ctx(p.id));
    expect(res.status).toBe(400);
    expect(filmMock.start).not.toHaveBeenCalled();
    expect(await balanceFor(U)).toBe(1000);
  });

  it("★ 그림 없이 굽지 않는다 — 값만 나가고 이 경로의 뜻이 사라진다", async () => {
    await grant(1000);
    const p = await runWithActor(U, () =>
      createProject({ ownerId: U, kind: "film", material: { text: "토끼" }, settings: { seconds: 15, resolution: "480p", model: "seedance-2.0" } })
    );
    await runWithActor(U, () => updateProject(p.id, U, (d) => ({ ...d, scenario: SCENARIO })));
    const res = await renderPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(400);
    expect(await balanceFor(U)).toBe(1000);
  });
});
