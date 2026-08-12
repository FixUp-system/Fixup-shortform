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
