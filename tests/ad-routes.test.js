import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { POST as createAd } from "../app/api/ads/route.js";
import { GET as getAd, PATCH as patchAd } from "../app/api/ads/[id]/route.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { createProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { DEFAULT_AD_MODEL } from "../lib/ad/models.js";

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
