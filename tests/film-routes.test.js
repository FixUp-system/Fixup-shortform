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
vi.mock("../lib/film/scenario.js", async (importOriginal) => ({
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

// ★★ 그림을 축 하나만 다시 그린다(2026-08-20). 라우트가 지키는 것은 **키가 진짜인가**다 —
//   모르는 키는 아무것도 안 그려지는데 회차는 먹고, 배열이 아닌 값을 조용히 무시하면
//   그 자리에서 넉 장을 다 그린다(값이 네 배).
describe("그림 라우트가 only 를 받는다", () => {
  beforeEach(() => { resetMemoryStore(); filmMock.images.mockClear(); });

  it("★ 그 방식의 계획에 없는 축 이름은 400 — 모르는 키로 값이 나가면 안 된다", async () => {
    const p = await readyFilm();
    const res = await imagesPOST(post({ mode: "refs", only: ["nope"] }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/축|모르는/);
    expect(filmMock.images).not.toHaveBeenCalled();
  });

  it("★ only 가 배열이 아니면 400 — 조용히 전부 그리면 값이 네 배다", async () => {
    const p = await readyFilm();
    const res = await imagesPOST(post({ mode: "refs", only: "subject" }), ctx(p.id));
    expect(res.status).toBe(400);
    expect(filmMock.images).not.toHaveBeenCalled();
  });

  it("★ 계획에 있는 축은 통과하고 그대로 파이프라인에 넘어간다", async () => {
    const p = await readyFilm();
    const res = await imagesPOST(post({ mode: "refs", only: ["subject"] }), ctx(p.id));
    expect(res.status).toBe(200);
    expect(filmMock.images).toHaveBeenCalledWith(p.id, U, "refs", { only: ["subject"] });
  });

  it("★ 앵커는 계획에 없지만 실제 그림에는 있다 — 장면 순서 방식의 첫 장이다", async () => {
    const p = await readyFilm();
    const res = await imagesPOST(post({ mode: "order", only: ["anchor"] }), ctx(p.id));
    expect(res.status).toBe(200);
  });

  it("only 를 안 주면 예전 그대로 전부 그린다 — 넷째 인자도 안 붙는다", async () => {
    const p = await readyFilm();
    const res = await imagesPOST(post({ mode: "refs" }), ctx(p.id));
    expect(res.status).toBe(200);
    expect(filmMock.images).toHaveBeenCalledWith(p.id, U, "refs");
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

  it("★★ 접수증에 **자기 회차 번호**가 실린다 — 옆 방식이 그 사이에 회차를 열어도 안 밀린다", async () => {
    await grant(1000);
    const p = await readyFilm();
    await renderPOST(post({ mode: "order" }), ctx(p.id));
    await renderPOST(post({ mode: "refs" }), ctx(p.id));
    // 라우트는 chargeAd 가 준 번호를 그대로 넘긴다(장부에 다시 물어보면 둘 다 2 가 된다)
    expect(filmMock.start).toHaveBeenNthCalledWith(1, p.id, U, "order", { attempt: 1 });
    expect(filmMock.start).toHaveBeenNthCalledWith(2, p.id, U, "refs", { attempt: 2 });
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

// ── 두 방향 잠금 · 시나리오 판 ─────────────────────────────────────────────
//
// ★★ 화면(lib/film/gates.js)이 두 버튼을 서로 잠그지만, 화면 잠금은 **한 벌뿐이라 샌다**
//   (탭 둘·새로고침 실패·직접 호출). 서버가 같은 것을 판정해야 값이 안 샌다.
describe("굽기와 그림이 서로를 막는다", () => {
  beforeEach(() => {
    resetMemoryStore();
    filmMock.images.mockClear();
    filmMock.start.mockClear();
    filmMock.start.mockImplementation(async () => ({ done: false, requestId: "req-1" }));
  });

  it("★★ 굽는 중에는 그림을 못 그린다 — 그리면 status 가 images 로 바뀌어 그 회차를 영영 못 수거한다", async () => {
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => putFilm(d, "order", { status: "rendering", job: { requestId: "r-1" } }))
    );
    const res = await imagesPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(409);
    expect(filmMock.images).not.toHaveBeenCalled();
    // 문서도 그대로다 — status 가 흔들리면 수거(collectFilmRender)가 그 job 을 못 알아본다
    const doc = await runWithActor(U, () => getProject(p.id, U));
    expect(doc.films.order.status).toBe("rendering");
    expect(doc.films.order.job.requestId).toBe("r-1");
  });

  it("★ 옆 방식이 굽는 중인 것은 안 막는다 — 두 방식은 각각의 문이다", async () => {
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => putFilm(d, "refs", { status: "rendering", job: { requestId: "r-1" } }))
    );
    const res = await imagesPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(200);
  });

  it("★★ 그리는 중에는 못 굽는다 — 옛 그림으로 값이 나간다. 청구 앞에서 걸려야 한다", async () => {
    await grant(1000);
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => putFilm(d, "order", { status: "drawing", drawingAt: Date.now() }))
    );
    const res = await renderPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(409);
    expect(filmMock.start).not.toHaveBeenCalled();
    expect(await balanceFor(U)).toBe(1000);
  });

  it("★ 그리기 잠금도 영원하지 않다 — 만료된 '그리는 중'이 굽기를 영영 막으면 막다른 길이다", async () => {
    await grant(1000);
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) =>
        putFilm(d, "order", { status: "drawing", drawingAt: Date.now() - FILM_IMAGE_LOCK_MS - 1 }))
    );
    const res = await renderPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(202);
  });
});

describe("시나리오 판(scenario.tries)이 조건을 지킨다", () => {
  beforeEach(() => {
    resetMemoryStore();
    scenarioMock.make.mockClear();
    filmMock.start.mockClear();
    filmMock.start.mockImplementation(async () => ({ done: false, requestId: "req-1" }));
  });

  it("★★ 한 편이라도 구웠으면 시나리오를 다시 못 쓴다 — 방식마다 다른 판으로 구우면 비교가 무의미하다", async () => {
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) =>
        putFilm(d, "order", { status: "done", video: { url: "/api/renders/x-order.mp4" } }))
    );
    const res = await scenarioPOST(post({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect(scenarioMock.make).not.toHaveBeenCalled();
  });

  it("★ 그림만 있으면 아직 고칠 수 있다 — 값을 치르기 전이라 막다른 길을 만들지 않는다", async () => {
    const p = await readyFilm();
    const res = await scenarioPOST(post({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(scenarioMock.make).toHaveBeenCalled();
  });

  // ★★ 굽는 **창** 동안에도 막아야 한다(2026-08-19). 지금 판정은 `f?.video?.url` 하나라
  //   접수는 됐는데 아직 수거 전인 구간(status="rendering", video 없음)이 통째로 열려 있다.
  //   이 경로는 굽는 데 8분이 걸리므로 그 창이 좁지 않다 — 그 사이 시나리오를 고치면
  //   굽고 있는 편은 옛 판, 다음 편은 새 판이 되어 두 편이 서로 다른 시나리오로 남는다.
  //   그러면 비교가 무의미해지는데 값(35 크레딧)은 이미 나갔다.
  it("★★ 굽는 중에도 시나리오를 다시 못 쓴다 — 접수된 편은 이미 값을 치렀다", async () => {
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => putFilm(d, "order", { status: "rendering", job: { requestId: "req-1" } }))
    );
    const res = await scenarioPOST(post({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect(scenarioMock.make).not.toHaveBeenCalled();
  });

  // ★★ 그림 상한을 다 쓴 방식이 있으면 그 프로젝트는 **값을 치를 길이 없어진다**:
  //   시나리오를 고치면 그 방식은 옛 판 그림뿐인데 다시 그릴 수 없고(6회 소진),
  //   옛 판 그림으로는 굽기가 400 이다. 어느 문으로도 못 나가는 프로젝트가 된다.
  it("★★ 그림 상한을 다 쓴 방식이 있으면 시나리오를 다시 못 쓴다 — 막다른 길을 만들지 않는다", async () => {
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => putFilm(d, "order", { imageTries: MAX_FILM_IMAGE_TRIES }))
    );
    const res = await scenarioPOST(post({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect(scenarioMock.make).not.toHaveBeenCalled();
  });

  it("★★ 시나리오를 고친 뒤에는 옛 그림으로 못 굽는다 — 청구 앞에서 걸린다", async () => {
    await grant(1000);
    const p = await readyFilm();
    // 그림은 1판으로 그렸는데 시나리오가 2판이 됐다
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => ({
        ...putFilm(d, "order", { status: "images", scenarioTries: 1 }),
        scenario: { ...d.scenario, tries: 2 },
      }))
    );
    const res = await renderPOST(post({ mode: "order" }), ctx(p.id));
    expect(res.status).toBe(400);
    expect(filmMock.start).not.toHaveBeenCalled();
    expect(await balanceFor(U)).toBe(1000);
  });

  it("★ 같은 판이면 그대로 굽는다", async () => {
    await grant(1000);
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => ({
        ...putFilm(d, "order", { status: "images", scenarioTries: 2 }),
        scenario: { ...d.scenario, tries: 2 },
      }))
    );
    expect((await renderPOST(post({ mode: "order" }), ctx(p.id))).status).toBe(202);
  });

  it("★ 판을 안 적어 둔 옛 문서는 그대로 통과한다 — 이 태스크 전에 그린 그림을 못 굽게 만들지 않는다", async () => {
    await grant(1000);
    const p = await readyFilm();
    await runWithActor(U, () =>
      updateProject(p.id, U, (d) => ({ ...d, scenario: { ...d.scenario, tries: 3 } }))
    );
    expect((await renderPOST(post({ mode: "order" }), ctx(p.id))).status).toBe(202);
  });
});

// ★★ film 이 사진을 읽는다(2026-08-19). 라우트 주석은 "이 경로는 사진을 그림 만들기에서
// 참조 바이트로 직접 넘기므로 글자를 받아쓰는 우회가 필요 없다"였는데 실측이 뒤집었다 —
// 시나리오가 사진을 못 봐서 제품의 글자도 색도 크기도 모른 채 쓰였고, 굽기(r2v)에는
// 사장님 사진이 아예 안 간다(films[].images 만 참조로 간다).
describe("film 시나리오가 사진을 읽는다", () => {
  beforeEach(() => { resetMemoryStore(); scenarioMock.make.mockClear(); });

  it("★ 시나리오를 만들기 전에 사진을 읽는다 — 광고와 같은 함수를 쓴다", () => {
    const src = strip(readFileSync("app/api/film/[id]/scenario/route.js", "utf8"));
    expect(src).toMatch(/readPhotoVision/);
  });

  // ★★ 2026-08-27 — **광고는 이제 이 함수를 안 쓴다.** gpt-4o 로 사진을 읽어 글로 옮기는
  //   대신 사진 원본을 Fable 에 직접 붙인다(lib/ad/scenario.js 의 photoBlocks). film 은
  //   그림 계획이 그 판정값을 읽으므로 그대로 남는다.
  it("★ 광고는 더는 gpt-4o 로 사진을 읽지 않는다", () => {
    const src = strip(readFileSync("lib/ad/pipeline.js", "utf8"));
    expect(src).not.toMatch(/readPhotoVision\(/);
    // 인라인으로 다시 적지 않았는지 — describePhoto 를 직접 부르는 자리가 없어야 한다
    expect(src).not.toMatch(/describePhoto\)\(\{/);
  });

  it("★ 읽은 사진값을 문서에 남긴다 — 안 남기면 다시 쓸 때마다 사진을 또 읽는다(사진당 값이 든다)", () => {
    const src = strip(readFileSync("app/api/film/[id]/scenario/route.js", "utf8"));
    // seen 이 새 객체일 때만 material 을 갈아 끼운다(광고 파이프라인과 같은 판정)
    expect(src).toMatch(/seen !== project/);
    expect(src).toMatch(/material:/);
  });
});
