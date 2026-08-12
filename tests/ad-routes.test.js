import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";

// LLM 경계만 가짜로 막는다 — 라우트·파이프라인·시나리오 검증은 **진짜로** 돈다.
// 이 저장소의 기존 방식과 같다(tests/auto-route.test.js:9 참고).
// ★ endpoint 를 일부러 "i2v"로 둔다(강제값 "t2v"와 다르게) — 같았으면 pickEndpointKind 를
// 건너뛰고 raw.endpoint 를 그대로 써도 "만들면...200" 테스트의 endpoint 단정이 우연히
// 통과했다(사진 0장이면 코드가 t2v 로 강제해야 하는데, 그 강제를 실제로 테스트가 미는지
// 이걸로 확인한다).
vi.mock("../lib/llm.js", () => ({
  callJson: vi.fn(async () => ({
    text: "Vertical commercial. Slow push-in on the product, then a hand lifts it.",
    shots: [{ beat: "제품 등장", camera: "slow push-in", action: "병이 놓인다", line: "매일 아침" }],
    endpoint: "i2v",
  })),
}));

import { POST as createAd } from "../app/api/ads/route.js";
import { GET as getAd, PATCH as patchAd } from "../app/api/ads/[id]/route.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { createProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { DEFAULT_AD_MODEL } from "../lib/ad/models.js";
import { AD_VIDEO_PRICE } from "../lib/pricing.js";

const U = "00000000-0000-4000-8000-00000000000a";
const H = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };

const post = (body) =>
  new Request("http://x/api/ads", { method: "POST", headers: H, body: JSON.stringify(body) });
const patch = (body) =>
  new Request("http://x/api/ads/x", { method: "PATCH", headers: H, body: JSON.stringify(body) });
const get = () => new Request("http://x/api/ads/x", { headers: H });

const OK = { material: { text: "앰플 광고" }, settings: { seconds: 15, aspect_ratio: "9:16", format: "hero", mood: "premium", narration_lang: "ko", style: "photo" } };

// 남의 업로드 키 검사용 — U 와 다른 소유자.
const OTHER = "00000000-0000-4000-8000-00000000000b";

// Important 3 — 기본값과 다른 옵션들로 만든다. OK 는 전부 DEFAULT_AD_OPTIONS 값과 같아서
// "안 보낸 필드가 조용히 기본값으로 떨어졌다"는 결함을 못 잡는다(기본값 == 원래값이라 구분이
// 안 된다). 넷 다 기본과 다르게 고른다: format(hero→unboxing)·mood(premium→dynamic)·
// narration_lang(ko→en)·style(photo→illust).
const NONDEFAULT = {
  material: { text: "논디폴트 광고" },
  settings: { seconds: 15, aspect_ratio: "9:16", format: "unboxing", mood: "dynamic", narration_lang: "en", style: "illust" },
};

describe("광고 라우트 — 문서", () => {
  beforeEach(() => resetMemoryStore());

  it("만들면 kind:'ad' 와 모델이 명시 저장된다", async () => {
    const res = await createAd(post(OK));
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.kind).toBe("ad");
    expect(doc.settings.model).toBe(DEFAULT_AD_MODEL);
    expect(doc.settings.seconds).toBe(15);
    expect(doc.status).toBe("draft");
  });

  it("15초가 아니면 400 — v1 은 닫힌 목록이다", async () => {
    const res = await createAd(post({ ...OK, settings: { ...OK.settings, seconds: 30 } }));
    expect(res.status).toBe(400);
  });

  it("모르는 옵션은 400", async () => {
    for (const bad of [{ format: "x" }, { mood: "x" }, { narration_lang: "jp" }, { style: "x" }]) {
      const res = await createAd(post({ ...OK, settings: { ...OK.settings, ...bad } }));
      expect(res.status).toBe(400);
    }
  });

  it("모르는 비율은 400", async () => {
    const res = await createAd(post({ ...OK, settings: { ...OK.settings, aspect_ratio: "3:2" } }));
    expect(res.status).toBe(400);
  });

  it("사진 4장 초과는 400", async () => {
    const photos = Array.from({ length: 5 }, (_, i) => ({ url: `/api/uploads/${i}.png` }));
    const res = await createAd(post({ ...OK, material: { ...OK.material, photos } }));
    expect(res.status).toBe(400);
  });

  it("★ 기존 문서를 광고 라우트에 넣으면 404", async () => {
    const p = await runWithActor(U, () => createProject({ material: { text: "옛것" }, ownerId: U }));
    const res = await getAd(get(), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(404);
  });

  it("옵션을 고치면 시나리오가 버려지고 draft 로 돌아간다", async () => {
    const made = await (await createAd(post(OK))).json();
    // 시나리오가 있는 상태를 만든다
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, scenario: { text: "P", shots: [{}], tries: 1 }, status: "scenario",
    });
    const res = await patchAd(patch({ settings: { mood: "bright" } }), { params: Promise.resolve({ id: made.id }) });
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.scenario).toBe(null);
    expect(doc.status).toBe("draft");
    expect(doc.settings.mood).toBe("bright");
  });

  // Important 1 — 리뷰가 지목한 공백. "굽는 중에는 못 고친다"(★ 요구사항)가 코드에는 있지만
  // 그 갈래를 밟는 테스트가 없었다. 시나리오 상태를 만드는 위 테스트와 같은 방식(store 직접
  // 조작)으로 status:"rendering" 을 세운다.
  it("★ 굽는 중(rendering)에는 PATCH 가 400 이다", async () => {
    const made = await (await createAd(post(OK))).json();
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, { ...row.doc, status: "rendering" });
    const res = await patchAd(patch({ settings: { mood: "bright" } }), { params: Promise.resolve({ id: made.id }) });
    expect(res.status).toBe(400);
  });

  // Important 2 — 이 저장소가 실제로 한 번 당한 구멍(lib/refs-io.js 의 ownedPhotoKeys 주석 참고).
  // 지금까지 있던 사진 테스트는 개수 상한만 쟀지, 남의 키를 거부하는지는 안 쟀다.
  it("★ 남의 업로드 키는 POST 에서 400", async () => {
    const { getStore } = await import("../lib/store/index.js");
    await getStore().insertUploadOwner("other.png", OTHER);
    const res = await createAd(
      post({ ...OK, material: { ...OK.material, photos: [{ url: "/api/uploads/other.png" }] } })
    );
    expect(res.status).toBe(400);
  });

  it("★ 남의 업로드 키는 PATCH 에서 400", async () => {
    const made = await (await createAd(post(OK))).json();
    const { getStore } = await import("../lib/store/index.js");
    await getStore().insertUploadOwner("other.png", OTHER);
    const res = await patchAd(
      patch({ material: { photos: [{ url: "/api/uploads/other.png" }] } }),
      { params: Promise.resolve({ id: made.id }) }
    );
    expect(res.status).toBe(400);
  });

  // Important 3 (plan-mandated) — 부분 PATCH 가 안 보낸 옵션을 조용히 기본값으로 되돌리면
  // 사장님이 분위기만 바꿨는데 화풍·언어·길이·비율이 바뀐다. 아무도 못 알아본다.
  // NONDEFAULT 를 쓰는 이유: OK 는 값이 전부 기본값과 같아 회귀가 나도 이 단정을 못 잡는다.
  it("★ 부분 PATCH 는 안 보낸 옵션을 그대로 보존한다", async () => {
    const made = await (await createAd(post(NONDEFAULT))).json();
    const res = await patchAd(patch({ settings: { mood: "bright" } }), { params: Promise.resolve({ id: made.id }) });
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.settings.mood).toBe("bright");
    expect(doc.settings.format).toBe("unboxing");
    expect(doc.settings.narration_lang).toBe("en");
    expect(doc.settings.style).toBe("illust");
    expect(doc.settings.seconds).toBe(15);
    expect(doc.settings.aspect_ratio).toBe("9:16");
    expect(doc.settings.model).toBe(DEFAULT_AD_MODEL);
  });
});

describe("광고 라우트 — 시나리오", () => {
  beforeEach(() => resetMemoryStore());

  it("만들면 시나리오가 문서에 남고 200", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const made = await (await createAd(post(OK))).json();
    const res = await makeScenario(
      new Request("http://x", { method: "POST", headers: H }),
      { params: Promise.resolve({ id: made.id }) }
    );
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.scenario.shots.length).toBeGreaterThan(0);
    expect(doc.scenario.tries).toBe(1);
    expect(doc.status).toBe("scenario");
    // 사진 0장이므로 코드가 t2v 로 고정한다 — LLM 이 무엇을 말했든
    expect(doc.scenario.endpoint).toBe("t2v");
  });

  // Important — 리뷰가 지목한 공백. 라우트의 "굽는 중(rendering)에는 다시 안 만든다"
  // 세 줄(app/api/ads/[id]/scenario/route.js:12-14)을 그 갈래를 밟는 테스트가 없어
  // 지워도 전체 스위트가 그대로 초록이었다. Task 11 이 형제 라우트(PATCH)에서 잡은 것과
  // 같은 결함이라 같은 자리(store 직접 조작으로 status:"rendering" 세우기)를 그대로 쓴다.
  it("★ 굽는 중(rendering)에는 시나리오를 다시 만들지 않는다 — 400", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const made = await (await createAd(post(OK))).json();
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, { ...row.doc, status: "rendering" });
    const res = await makeScenario(
      new Request("http://x", { method: "POST", headers: H }),
      { params: Promise.resolve({ id: made.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("다시 쓰면 회차가 는다", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const made = await (await createAd(post(OK))).json();
    const ctx = { params: Promise.resolve({ id: made.id }) };
    await makeScenario(new Request("http://x", { method: "POST", headers: H }), ctx);
    const res = await makeScenario(
      new Request("http://x", { method: "POST", headers: H }),
      { params: Promise.resolve({ id: made.id }) }
    );
    expect((await res.json()).scenario.tries).toBe(2);
  });

  it("상한을 넘으면 400 — 사장님이 할 일이 있는 실패다", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const { MAX_SCENARIO_TRIES } = await import("../lib/pricing.js");
    const { getStore } = await import("../lib/store/index.js");
    const made = await (await createAd(post(OK))).json();
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, scenario: { text: "P", shots: [{}], tries: MAX_SCENARIO_TRIES },
    });
    const res = await makeScenario(
      new Request("http://x", { method: "POST", headers: H }),
      { params: Promise.resolve({ id: made.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("기존 문서면 404", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const p = await runWithActor(U, () => createProject({ material: { text: "옛것" }, ownerId: U }));
    const res = await makeScenario(
      new Request("http://x", { method: "POST", headers: H }),
      { params: Promise.resolve({ id: p.id }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("광고 라우트 — 굽기", () => {
  beforeEach(() => resetMemoryStore());

  async function withScenario() {
    const made = await (await createAd(post(OK))).json();
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, scenario: { text: "P", shots: [{ beat: "가" }], endpoint: "t2v", tries: 1 }, status: "scenario",
    });
    return made;
  }

  it("잔액이 없으면 402", async () => {
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await withScenario();
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(402);
  });

  it("시나리오가 없으면 400 — 값을 받기 전에 막는다", async () => {
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await (await createAd(post(OK))).json();
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(400);
  });

  it("잔액이 있으면 202 로 시작한다", async () => {
    process.env.SHOTFORM_FAKE = "fal";
    const { getStore } = await import("../lib/store/index.js");
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await withScenario();
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(202);
    delete process.env.SHOTFORM_FAKE;
  });

  it("기존 문서면 404", async () => {
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const p = await runWithActor(U, () => createProject({ material: { text: "옛것" }, ownerId: U }));
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: p.id }),
    });
    expect(res.status).toBe(404);
  });

  // Task 11 → Task 12 에서 두 번 되살아난 결함(rendering 잠금에 테스트가 없었다)의 세 번째
  // 재발을 막는다. status:"rendering" 을 store 직접 조작으로 세우는 것은 위 describe 들과 같은 방식.
  it("★ 이미 rendering 이면 400", async () => {
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await withScenario();
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, { ...row.doc, status: "rendering" });
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(400);
  });

  // 다시 굽기는 새 회차가 아니라 살아 있는 청구를 그대로 쓰는 정상 흐름이다(파이프라인의
  // chargeAd 도 같은 판정으로 재청구를 막는다) — 잔액이 0 이어도 402 를 내면 안 된다.
  // ★ 이 프로젝트는 아직 videos 가 없다(hasRenderedAdVideo == false) — 굽는 도중에 살아
  //   있는 청구가 생긴 정상 흐름이지, 성공해서 소진된 회차가 아니다. 그래서 여전히 202.
  it("★ 살아 있는 청구가 있으면 잔액이 0 이어도 잔액 검사를 건너뛰고 202", async () => {
    process.env.SHOTFORM_FAKE = "fal";
    const made = await withScenario();
    const { chargeAd } = await import("../lib/charges.js");
    await chargeAd({ userId: U, projectId: made.id, seconds: 15 });
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(202);
    delete process.env.SHOTFORM_FAKE;
  });

  // ★ 매출 누수 회귀(Task 17) — 성공해서 videos 가 생긴 뒤(=hasRenderedAdVideo == true)의
  //   살아 있는 청구는 "정상 흐름 중"이 아니라 "이미 소진된 회차"다. 그때는 잔액 검사를
  //   건너뛰면 안 된다 — 새 회차를 열 것이므로 못 내면 402 를 받아야 한다.
  //   고치기 전에는(alreadyChargedAd 만 보고 건너뛰므로) 이 자리가 202 로 나와 RED 다.
  it("★ 이미 영상을 낸 회차면 잔액이 모자랄 때 402 — 살아 있는 청구가 있어도", async () => {
    const made = await withScenario();
    const { getStore } = await import("../lib/store/index.js");
    const { chargeAd } = await import("../lib/charges.js");
    // 첫 회차가 이미 성공해 영상이 나온 상태를 만든다: 청구는 살아 있고(환불 안 됨), videos 도 있다.
    await chargeAd({ userId: U, projectId: made.id, seconds: 15 });
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, status: "done", videos: [{ url: "/api/renders/x.mp4", seconds: 15 }],
    });
    // 잔액은 0 이다 — grant 를 한 번도 안 했다.
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(402);
  });

  // 위 402 테스트의 대조군 — 이미 영상을 낸 회차라도 잔액이 있으면 새 회차를 열어 202.
  it("이미 영상을 낸 회차라도 잔액이 있으면 새 회차를 열어 202", async () => {
    process.env.SHOTFORM_FAKE = "fal";
    const made = await withScenario();
    const { getStore } = await import("../lib/store/index.js");
    const { chargeAd } = await import("../lib/charges.js");
    await chargeAd({ userId: U, projectId: made.id, seconds: 15 });
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, status: "done", videos: [{ url: "/api/renders/x.mp4", seconds: 15 }],
    });
    // 이미 첫 회차로 65 를 썼으니(위 chargeAd), 새 회차 65 를 또 낼 잔액을 채운다.
    await getStore().insertGrant({ user_id: U, amount_credits: AD_VIDEO_PRICE[15] * 2, reason: "t" });
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(202);
    delete process.env.SHOTFORM_FAKE;
  });
});
