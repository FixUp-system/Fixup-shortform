import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore, memoryStore } from "../lib/store/memory.js";

// LLM 경계만 가짜로 막는다 — 라우트·파이프라인·시나리오 검증은 **진짜로** 돈다.
// 이 저장소의 기존 방식과 같다(tests/auto-route.test.js:9 참고).
// ★ endpoint 를 일부러 "i2v"로 둔다(강제값 "t2v"와 다르게) — 같았으면 pickEndpointKind 를
// 건너뛰고 raw.endpoint 를 그대로 써도 "만들면...200" 테스트의 endpoint 단정이 우연히
// 통과했다(사진 0장이면 코드가 t2v 로 강제해야 하는데, 그 강제를 실제로 테스트가 미는지
// 이걸로 확인한다).
// ★ Task 18 — 광고 시나리오가 lib/llm.js(OpenAI) 대신 lib/ad/llm.js(Claude Fable)를 쓰게
// 바뀌어 mock 대상도 같이 옮긴다. lib/llm.js 자체는 기존 6단계 파이프라인용으로 안 건드렸다.
// ★ 2026-08-21 — 이 mock 은 모듈을 **통째로** 갈아 끼운다. 그래서 lib/ad/scenario.js 가
//   쓰는 export 를 하나라도 빠뜨리면 그 자리에서 undefined 가 되어 라우트가 500 을 낸다
//   (scenarioSchemaFor 를 더했을 때 실제로 그렇게 다섯 테스트가 깨졌다).
//   scenarioSchemaFor 는 진짜 것을 쓴다 — 스키마 모양은 이 파일이 재는 대상이 아니고,
//   가짜로 두면 "지문과 스키마가 같은 kind 를 본다"는 계약이 여기서만 사라진다.
vi.mock("../lib/ad/llm.js", async (importOriginal) => ({
  ...(await importOriginal()),
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
import { AD_VIDEO_PRICE, adVideoPrice } from "../lib/pricing.js";

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

  it("15초가 아니면 400 — 기본 모델(2.0 standard)은 15초 하나뿐이다", async () => {
    const res = await createAd(post({ ...OK, settings: { ...OK.settings, seconds: 30 } }));
    expect(res.status).toBe(400);
  });

  // ── Task 21 — 영상 모델 선택(백엔드) ──────────────────────────────────
  // ★★★ 등급이 **실제로 막는지**를 HTTP 로 잰다(2026-08-20). tests/tier-gate.test.js 는
  //   "라우트가 그 함수를 부르는가"를 문자열로 볼 뿐이라, 부르고도 결과를 안 쓰면 통과한다.
  //   2.5 는 그전까지 hidden 으로 화면에서만 가려져 있었고 이 자리는 그대로 통과시켰다.
  describe("등급이 모델을 막는다", () => {
    it("★ 기본 등급이 2.5 로 만들려 하면 403 — 화면을 우회해도 안 열린다", async () => {
      await memoryStore.insertProfile({ id: U, email: "basic@fix-up.kr", status: "approved", role: "user", tier: "basic" });
      const res = await createAd(post({ ...OK, settings: { ...OK.settings, model: "seedance-2.5", seconds: 15 } }));
      expect(res.status).toBe(403);
    });

    it("★ 프로필이 아예 없어도 403 — 모르는 값은 좁은 쪽으로 떨어진다", async () => {
      const res = await createAd(post({ ...OK, settings: { ...OK.settings, model: "seedance-2.5", seconds: 15 } }));
      expect(res.status).toBe(403);
    });

    it("기본 등급도 2.0 은 만든다 — 문을 너무 좁히지 않았는지 함께 본다", async () => {
      await memoryStore.insertProfile({ id: U, email: "basic@fix-up.kr", status: "approved", role: "user", tier: "basic" });
      const res = await createAd(post({ ...OK, settings: { ...OK.settings, model: "seedance-2.0", seconds: 15 } }));
      expect(res.status).toBe(200);
    });
  });

  describe("영상 모델", () => {
    // ★★ 2.5 는 **등급이 여는 모델**이다(2026-08-20). 그전에는 hidden 으로 화면에서만
    //   가려져 있어 이 시험들이 아무 계정으로나 통과했다 — 서버가 안 막고 있었다는 뜻이다.
    //   이제 서버가 막으므로 이 묶음의 사장님은 pro 등급이어야 한다.
    //   (기본 등급이 막히는지는 아래 "등급이 모델을 막는다" 와 tests/tier-gate.test.js 가 잰다.)
    beforeEach(async () => {
      await memoryStore.insertProfile({ id: U, email: "pro@fix-up.kr", status: "approved", role: "user", tier: "pro" });
    });

    // ① 2.5 로 30초를 만들 수 있고 2.0 으로는 400
    it("★ 2.5 모델은 30초를 만들 수 있다", async () => {
      const res = await createAd(
        post({ ...OK, settings: { ...OK.settings, model: "seedance-2.5", seconds: 30 } })
      );
      expect(res.status).toBe(200);
      const doc = await res.json();
      expect(doc.settings.model).toBe("seedance-2.5");
      expect(doc.settings.seconds).toBe(30);
    });

    it("★ 2.0 모델(기본)에 30초를 주면 400 — 길이가 모델에 딸린다", async () => {
      const res = await createAd(
        post({ ...OK, settings: { ...OK.settings, model: "seedance-2.0", seconds: 30 } })
      );
      expect(res.status).toBe(400);
    });

    // ④ 모르는 모델 id 는 400
    it("★ 모르는 모델 id 는 400", async () => {
      const res = await createAd(
        post({ ...OK, settings: { ...OK.settings, model: "seedance-3.0-오타" } })
      );
      expect(res.status).toBe(400);
    });

    it("모델을 안 주면 기본 모델이 명시 저장된다", async () => {
      const res = await createAd(post(OK));
      const doc = await (res).json();
      expect(doc.settings.model).toBe(DEFAULT_AD_MODEL);
    });

    // ② 정가가 모델·길이마다 다르다 — 화면(app/ads/[id]/page.js)이 읽는 값과 같은 함수다.
    it("모델·길이 조합마다 정가가 다르다", () => {
      expect(adVideoPrice(15, "seedance-2.0", "720p")).toBe(80);
      expect(adVideoPrice(15, "seedance-2.5")).toBe(120);
      expect(adVideoPrice(30, "seedance-2.5")).toBe(240);
    });

    // PATCH — 모델을 바꿀 수 있고, 바꾸면 길이도 그 모델 기준으로 다시 본다.
    it("★ PATCH 로 모델을 2.5 로 바꿀 수 있다(길이가 그대로 15초라 유효하다)", async () => {
      const made = await (await createAd(post(OK))).json();
      const res = await patchAd(
        patch({ settings: { model: "seedance-2.5" } }),
        { params: Promise.resolve({ id: made.id }) }
      );
      expect(res.status).toBe(200);
      const doc = await res.json();
      expect(doc.settings.model).toBe("seedance-2.5");
      expect(doc.settings.seconds).toBe(15);
    });

    it("★ PATCH 로 2.5 → 30초까지 함께 바꿀 수 있다", async () => {
      const made = await (await createAd(post(OK))).json();
      const res = await patchAd(
        patch({ settings: { model: "seedance-2.5", seconds: 30 } }),
        { params: Promise.resolve({ id: made.id }) }
      );
      expect(res.status).toBe(200);
      const doc = await res.json();
      expect(doc.settings.model).toBe("seedance-2.5");
      expect(doc.settings.seconds).toBe(30);
    });

    it("★ 2.5·30초로 만든 뒤 모델만 2.0 으로 되돌리면 400 — 길이를 그대로 두면 2.0 이 못 받는다", async () => {
      const made = await (
        await createAd(post({ ...OK, settings: { ...OK.settings, model: "seedance-2.5", seconds: 30 } }))
      ).json();
      const res = await patchAd(
        patch({ settings: { model: "seedance-2.0" } }),
        { params: Promise.resolve({ id: made.id }) }
      );
      expect(res.status).toBe(400);
    });

    it("★ PATCH 에 모르는 모델 id 를 주면 400", async () => {
      const made = await (await createAd(post(OK))).json();
      const res = await patchAd(
        patch({ settings: { model: "없는모델" } }),
        { params: Promise.resolve({ id: made.id }) }
      );
      expect(res.status).toBe(400);
    });

    it("PATCH 에서 모델을 안 주면 기존 모델이 보존된다", async () => {
      const made = await (
        await createAd(post({ ...OK, settings: { ...OK.settings, model: "seedance-2.5" } }))
      ).json();
      const res = await patchAd(
        patch({ settings: { mood: "bright" } }),
        { params: Promise.resolve({ id: made.id }) }
      );
      const doc = await res.json();
      expect(doc.settings.model).toBe("seedance-2.5");
    });

    // ③ 옛 문서 보호 — settings.model 이 없는 옛 광고 문서를 PATCH 하면 기본 모델
    // (standard) 값 그대로다. 실제 store 에 model 필드가 아예 없는 문서를 직접 심어
    // (라우트를 안 거쳐) 재현한다.
    it("★ settings.model 이 없는 옛 문서를 PATCH 해도 기본 모델(standard) 값으로 본다(30초는 400)", async () => {
      const made = await (await createAd(post(OK))).json();
      const { getStore } = await import("../lib/store/index.js");
      const row = await getStore().selectProject(made.id, U);
      const { model, ...settingsWithoutModel } = row.doc.settings;
      await getStore().updateProjectRow(made.id, U, row.version, {
        ...row.doc, settings: settingsWithoutModel,
      });
      // 15초는 그대로 통과해야 한다(기본 모델 값)
      const ok15 = await patchAd(
        patch({ settings: { mood: "bright" } }),
        { params: Promise.resolve({ id: made.id }) }
      );
      expect(ok15.status).toBe(200);
      expect((await ok15.json()).settings.model).toBe(DEFAULT_AD_MODEL);

      // 다시 모델 없는 상태로 되돌리고, 30초를 요구하면 기본 모델 값으로 판정돼 400 이어야 한다
      const row2 = await getStore().selectProject(made.id, U);
      const { model: m2, ...s2 } = row2.doc.settings;
      await getStore().updateProjectRow(made.id, U, row2.version, { ...row2.doc, settings: s2 });
      const bad30 = await patchAd(
        patch({ settings: { seconds: 30 } }),
        { params: Promise.resolve({ id: made.id }) }
      );
      expect(bad30.status).toBe(400);
    });

    // ★ Task 24 — settings.resolution 이 없는 옛 문서는 720p 로 본다. 반대로 두면
    // 이미 만든 영상들이 다른 해상도로 판정된다.
    it("★ settings.resolution 이 없는 옛 문서를 PATCH 해도 720p 로 본다", async () => {
      const made = await (await createAd(post(OK))).json();
      const { getStore } = await import("../lib/store/index.js");
      const row = await getStore().selectProject(made.id, U);
      const { resolution, ...settingsWithoutResolution } = row.doc.settings;
      await getStore().updateProjectRow(made.id, U, row.version, {
        ...row.doc, settings: settingsWithoutResolution,
      });
      const res = await patchAd(
        patch({ settings: { mood: "bright" } }),
        { params: Promise.resolve({ id: made.id }) }
      );
      expect(res.status).toBe(200);
      expect((await res.json()).settings.resolution).toBe("720p");
    });

    // ★ Task 24 — 모델을 바꾸면 해상도도 그 모델 기준으로 다시 본다(길이와 같은 규칙).
    // fast 티어가 사라진 뒤에도 같은 규칙을 재는 자리다 — 1080p 는 **2.0 만** 연다.
    it("★ 2.0·1080p 로 만든 뒤 모델만 2.5 로 바꾸면 400 — 2.5 는 1080p 가 없다", async () => {
      const made = await (
        await createAd(post({ ...OK, settings: { ...OK.settings, model: "seedance-2.0", resolution: "1080p" } }))
      ).json();
      const res = await patchAd(
        patch({ settings: { model: "seedance-2.5" } }),
        { params: Promise.resolve({ id: made.id }) }
      );
      expect(res.status).toBe(400);
    });

    it("★ 모르는 해상도는 POST 에서 400", async () => {
      const res = await createAd(
        post({ ...OK, settings: { ...OK.settings, resolution: "4k" } })
      );
      expect(res.status).toBe(400);
    });

    it("★ 모델이 안 받는 해상도는 POST 에서 400 — fast 에 1080p", async () => {
      const res = await createAd(
        post({ ...OK, settings: { ...OK.settings, model: "seedance-2.5", resolution: "1080p" } })
      );
      expect(res.status).toBe(400);
    });

    // ★ 2026-08-21 — 기본 해상도가 **모델별**이 됐다(adDefaultResolution). 기본 모델은
    //   2.0 이라 여전히 720p 이지만, 값의 출처가 전역 상수에서 모델 표로 옮겨졌다.
    it("해상도를 안 주면 그 모델의 기본값이 명시 저장된다", async () => {
      const res = await createAd(post(OK));
      const doc = await res.json();
      expect(doc.settings.resolution).toBe("720p");
    });

    it("★ H3 는 720p 가 아예 없다 — 안 주면 2K 가 저장된다", async () => {
      const res = await createAd(
        post({ ...OK, settings: { ...OK.settings, model: "minimax-h3" } })
      );
      expect(res.status).toBe(200);
      expect((await res.json()).settings.resolution).toBe("2K");
    });

    it("★ standard 는 1080p 를 고를 수 있다", async () => {
      const res = await createAd(
        post({ ...OK, settings: { ...OK.settings, model: "seedance-2.0", resolution: "1080p" } })
      );
      expect(res.status).toBe(200);
      const doc = await res.json();
      expect(doc.settings.resolution).toBe("1080p");
    });
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
  // ★★ 굽기도 등급을 본다(2026-08-20) — 만든 뒤 등급이 내려간 계정과, 문서가 다른 경로로
  //   고쳐진 경우를 막는 자리다(값이 나가는 자리는 여기다). 이 묶음에 2.5 를 쓰는 시험이
  //   있으므로 pro 로 둔다. 기본 등급이 막히는지는 tests/tier-gate.test.js 가 잰다.
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProfile({ id: U, email: "pro@fix-up.kr", status: "approved", role: "user", tier: "pro" });
  });

  async function withScenario() {
    const made = await (await createAd(post(OK))).json();
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, scenario: { text: "P", shots: [{ beat: "가" }], endpoint: "t2v", tries: 1 }, status: "scenario",
    });
    return made;
  }

  // 2.5·30초로 만든 프로젝트에 시나리오까지 심는다 — 모델별 정가가 굽기 라우트의
  // 잔액 검사에 실제로 반영되는지를 재는 자리다.
  async function withScenario25() {
    const made = await (
      await createAd(post({ ...OK, settings: { ...OK.settings, model: "seedance-2.5", seconds: 30 } }))
    ).json();
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, scenario: { text: "P", shots: [{ beat: "가" }], endpoint: "t2v", tries: 1 }, status: "scenario",
    });
    return made;
  }

  // ★ Task 24 — standard·1080p 로 만든 프로젝트. 같은 모델·길이라도 해상도가 잔액
  // 검사에 실제로 반영되는지를 재는 자리다(withScenario25 와 같은 목적, 축만 해상도다).
  async function withScenario1080p() {
    const made = await (
      await createAd(post({ ...OK, settings: { ...OK.settings, model: "seedance-2.0", resolution: "1080p" } }))
    ).json();
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

  // ── Task 21 — 정가 계산에 모델이 반영된다 ────────────────────────────
  it("★ 2.5 는 정가가 더 높다 — 2.0 이면 통과할 잔액도 2.5 면 402", async () => {
    const { getStore } = await import("../lib/store/index.js");
    const { AD_VIDEO_PRICE } = await import("../lib/pricing.js");
    // 2.0/15초(65) 는 넉넉히 내는 잔액이지만 2.5/30초(240) 에는 못 미친다
    await getStore().insertGrant({ user_id: U, amount_credits: 100, reason: "t" });
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await withScenario25();
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(402);
    // 대조 — 2.0/15초/720p 정가라면 이 잔액으로 충분했다는 것을 같이 남긴다
    expect(100).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
    expect(100).toBeLessThan(AD_VIDEO_PRICE["seedance-2.5"][30]["720p"]);
  });

  it("2.5·30초도 정가만큼 잔액이 있으면 202 로 시작한다", async () => {
    process.env.SHOTFORM_FAKE = "fal";
    const { getStore } = await import("../lib/store/index.js");
    const { AD_VIDEO_PRICE } = await import("../lib/pricing.js");
    await getStore().insertGrant({ user_id: U, amount_credits: AD_VIDEO_PRICE["seedance-2.5"][30]["720p"], reason: "t" });
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await withScenario25();
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(202);
    delete process.env.SHOTFORM_FAKE;
  });

  // ── Task 24 — 정가 계산에 해상도가 반영된다(모델·길이가 같아도 해상도가 축이다) ──
  it("★ 1080p 는 정가가 더 높다 — 720p 면 통과할 잔액도 1080p 면 402", async () => {
    const { getStore } = await import("../lib/store/index.js");
    const { AD_VIDEO_PRICE } = await import("../lib/pricing.js");
    // standard·15초·720p(80) 는 넉넉히 내는 잔액이지만 1080p(175) 에는 못 미친다
    await getStore().insertGrant({ user_id: U, amount_credits: 100, reason: "t" });
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await withScenario1080p();
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(402);
    expect(100).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
    expect(100).toBeLessThan(AD_VIDEO_PRICE["seedance-2.0"][15]["1080p"]);
  });

  it("1080p 도 정가만큼 잔액이 있으면 202 로 시작한다", async () => {
    process.env.SHOTFORM_FAKE = "fal";
    const { getStore } = await import("../lib/store/index.js");
    const { AD_VIDEO_PRICE } = await import("../lib/pricing.js");
    await getStore().insertGrant({ user_id: U, amount_credits: AD_VIDEO_PRICE["seedance-2.0"][15]["1080p"], reason: "t" });
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await withScenario1080p();
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
    // 이미 첫 회차로 기본 모델(standard)·720p 값을 썼으니(위 chargeAd, model 생략),
    // 새 회차를 또 낼 잔액을 채운다.
    await getStore().insertGrant({ user_id: U, amount_credits: AD_VIDEO_PRICE["seedance-2.0"][15]["720p"] * 2, reason: "t" });
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(202);
    delete process.env.SHOTFORM_FAKE;
  });
});

// ★ 컷 편집 · 되돌리기 라우트. 편집분이 라우트를 지나 프롬프트까지 닿는지, 그리고
// 되돌리기가 남의 것을 못 건드리는지를 잰다.
describe("광고 라우트 — 컷 편집 · 되돌리기", () => {
  beforeEach(() => resetMemoryStore());

  const ctxOf = (id) => ({ params: Promise.resolve({ id }) });
  const postWith = (body) =>
    new Request("http://x", { method: "POST", headers: H, ...(body ? { body: JSON.stringify(body) } : {}) });

  async function madeWithScenario() {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const made = await (await createAd(post(OK))).json();
    await makeScenario(postWith(null), ctxOf(made.id));
    return made;
  }

  it("고친 컷을 보내면 그 내용이 LLM 프롬프트에 실린다 — 라우트가 body 를 버리면 실패한다", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const { callJson } = await import("../lib/ad/llm.js");
    const made = await madeWithScenario();
    callJson.mockClear();

    const res = await makeScenario(
      postWith({ shots: [{ beat: "사장님이 손으로 고친 비트" }] }),
      ctxOf(made.id)
    );
    expect(res.status).toBe(200);
    const sent = JSON.stringify(callJson.mock.calls.at(-1)[0]);
    expect(sent).toContain("사장님이 손으로 고친 비트");
  });

  it("body 가 없거나 깨져도 지금처럼 동작한다 — [다시 쓰기]는 body 없이 부른다", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const made = await madeWithScenario();
    expect((await makeScenario(postWith(null), ctxOf(made.id))).status).toBe(200);
    const broken = new Request("http://x", { method: "POST", headers: H, body: "{" });
    expect((await makeScenario(broken, ctxOf(made.id))).status).toBe(200);
  });

  it("되돌리면 직전 시나리오로 돌아간다 — 200", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const { POST: undo } = await import("../app/api/ads/[id]/scenario/undo/route.js");
    const { callJson } = await import("../lib/ad/llm.js");
    const made = await madeWithScenario();
    callJson.mockImplementationOnce(async () => ({
      text: "둘째 지시문", shots: [{ beat: "둘째" }], endpoint: "i2v",
    }));
    await makeScenario(postWith(null), ctxOf(made.id));

    const res = await undo(postWith(null), ctxOf(made.id));
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.scenario.text).not.toBe("둘째 지시문");
    expect(doc.scenario.prev).toBeUndefined();
  });

  it("되돌릴 것이 없으면 400 — 사장님이 할 일이 있는 실패다", async () => {
    const { POST: undo } = await import("../app/api/ads/[id]/scenario/undo/route.js");
    const made = await madeWithScenario();
    expect((await undo(postWith(null), ctxOf(made.id))).status).toBe(400);
  });

  it("★ 남의 광고는 되돌릴 수 없다 — 404", async () => {
    const { POST: undo } = await import("../app/api/ads/[id]/scenario/undo/route.js");
    const made = await madeWithScenario();
    const res = await undo(
      new Request("http://x", { method: "POST", headers: { ...H, [USER_HEADER]: OTHER } }),
      ctxOf(made.id)
    );
    expect(res.status).toBe(404);
  });

  it("★ 굽는 중에는 되돌릴 수 없다 — 400", async () => {
    const { POST: undo } = await import("../app/api/ads/[id]/scenario/undo/route.js");
    const { getStore } = await import("../lib/store/index.js");
    const made = await madeWithScenario();
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, { ...row.doc, status: "rendering" });
    expect((await undo(postWith(null), ctxOf(made.id))).status).toBe(400);
  });
});
