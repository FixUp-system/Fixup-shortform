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
});
