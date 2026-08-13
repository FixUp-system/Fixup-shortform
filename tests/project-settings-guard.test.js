// 정가는 길이에 묶여 있다(VIDEO_PRICE). 만들 때는 길이를 검증하는데 고칠 때는 안 봐서,
// 15초로 25크레딧 낸 뒤 60초로 고치면 추가 청구가 0 이었다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const A = "00000000-0000-4000-8000-00000000000a";
const P = "p-1";

const { PATCH } = await import("../app/api/projects/[id]/route.js");

const req = (settings) =>
  new Request(`http://localhost/api/projects/${P}`, {
    method: "PATCH",
    headers: {
      [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
      "content-type": "application/json",
    },
    body: JSON.stringify({ settings }),
  });
const ctx = () => ({ params: Promise.resolve({ id: P }) });

async function seedProject() {
  await memoryStore.insertProject(
    { id: P, created_ts: 1, status: "draft", settings: { target_seconds: 15 } },
    A
  );
}

describe("PATCH /api/projects/[id] — 길이", () => {
  beforeEach(async () => { resetMemoryStore(); await seedProject(); });

  it("결제 전에는 목록 안의 값으로 바꿀 수 있다", async () => {
    expect((await PATCH(req({ target_seconds: 30 }), ctx())).status).toBe(200);
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.settings.target_seconds).toBe(30);
  });

  it("목록 밖 값은 400 이고 저장되지 않는다", async () => {
    expect((await PATCH(req({ target_seconds: 37 }), ctx())).status).toBe(400);
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.settings.target_seconds).toBe(15);
  });

  // ★ 이 태스크의 존재 이유.
  it("정가를 낸 뒤에는 길이를 못 바꾼다", async () => {
    // ★ 필드 이름은 `credits` 다(`amount_credits` 아님 — 그건 충전 장부 쪽이다).
    // idem_key 는 videoKey(projectId, 회차) = `video:<id>:1` 이어야 alreadyChargedVideo 가
    // 이 행을 찾는다(lib/charges.js:38,52).
    await memoryStore.insertCharge({
      idem_key: `video:${P}:1`, user_id: A, project_id: P,
      kind: "video", credits: 25,
    });
    const res = await PATCH(req({ target_seconds: 60 }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/바꿀 수 없어요/);
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.settings.target_seconds).toBe(15);
  });

  it("결제해도 같은 길이를 다시 보내는 것은 막지 않는다 — 다른 설정을 고치는 정상 저장이다", async () => {
    // ★ 필드 이름은 `credits` 다(`amount_credits` 아님 — 그건 충전 장부 쪽이다).
    // idem_key 는 videoKey(projectId, 회차) = `video:<id>:1` 이어야 alreadyChargedVideo 가
    // 이 행을 찾는다(lib/charges.js:38,52).
    await memoryStore.insertCharge({
      idem_key: `video:${P}:1`, user_id: A, project_id: P,
      kind: "video", credits: 25,
    });
    expect((await PATCH(req({ target_seconds: 15 }), ctx())).status).toBe(200);
  });
});

// 화질은 닫힌 목록인데 **목록이 모델마다 다르다** — Seedance 만 열고 Kling·LTX 는 안 연다.
// settings 는 화이트리스트 없이 얕게 머지되므로 여기서 안 막으면 아무 값이나 들어가고,
// 그 값이 그대로 fal 유료 호출로 나간다(lib/i2v.js 가 resolution 키로 싣는다).
describe("PATCH /api/projects/[id] — 화질", () => {
  const seedanceSettings = { target_seconds: 15, i2v_model: "seedance-2.0" };
  const seedSeedance = () =>
    memoryStore.insertProject({ id: P, created_ts: 1, status: "draft", settings: seedanceSettings }, A);
  const savedSettings = async () => (await memoryStore.selectProject(P, A)).doc.settings;

  beforeEach(() => { resetMemoryStore(); });

  it("모델이 여는 화질은 저장된다", async () => {
    await seedSeedance();
    expect((await PATCH(req({ resolution: "1080p" }), ctx())).status).toBe(200);
    expect((await savedSettings()).resolution).toBe("1080p");
  });

  it("모델에 없는 해상도는 저장을 거절한다", async () => {
    await seedSeedance();
    const res = await PATCH(req({ resolution: "2160p" }), ctx());
    expect(res.status).toBe(400);
    expect((await savedSettings()).resolution).toBeUndefined();
  });

  // Kling 은 이 파라미터 자체가 없다 — "아는 화질처럼 생긴 값"이라고 받아 두면
  // 화면에 없는 선택이 문서에 남고, 각인(lib/steps.js)이 그 값을 본다.
  it("해상도를 안 여는 모델(레거시=Kling)에는 어떤 값도 못 넣는다", async () => {
    await seedProject();   // i2v_model 없음 = 레거시 Kling
    expect((await PATCH(req({ resolution: "1080p" }), ctx())).status).toBe(400);
    expect((await savedSettings()).resolution).toBeUndefined();
  });

  // ★★ 모델을 함께 바꾸는 PATCH. 판정을 **바뀌기 전 모델**로 하면
  // "Seedance 의 1080p 니까 통과" → 저장된 모델은 Kling 이 되어 없는 파라미터가 남는다.
  it("모델을 Kling 으로 바꾸면서 1080p 를 함께 보내도 통과하지 않는다", async () => {
    await seedSeedance();
    const res = await PATCH(req({ i2v_model: "kling-v3", resolution: "1080p" }), ctx());
    expect(res.status).toBe(400);
    const s = await savedSettings();
    expect(s.resolution).toBeUndefined();
    expect(s.i2v_model).toBe("seedance-2.0");
  });

  // 같은 모델을 다시 보내는 것은 정상 저장이다(화면이 헛 PATCH 를 보낼 수 있다) —
  // 그때 화질 판정은 **머지 뒤 모델**로 하므로 그대로 통과해야 한다.
  it("같은 모델을 함께 보내면서 화질을 고르는 것은 막지 않는다", async () => {
    await seedSeedance();
    expect((await PATCH(req({ i2v_model: "seedance-2.0", resolution: "480p" }), ctx())).status).toBe(200);
    expect((await savedSettings()).resolution).toBe("480p");
  });
});
