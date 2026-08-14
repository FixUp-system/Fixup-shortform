// 첫 컷이 끝나기 전에 함수가 얼면 progress 가 아예 없어 "멈췄다"를 판정할 근거가 없다.
// 시작하는 저장에서 찍어 둬야 그 창이 닫힌다.
//
// ★ 표식은 손으로 짓지 않고 withProgress 로 만든다 — done 을 0 으로 박으면
//   /clips 의 [남은 N개 만들기]처럼 **이미 끝난 컷이 있는 자리**에서 거짓말이 된다.
//   그래서 아래에 "이미 클립이 있는 채로 시작하면 done 이 0 이 아니다"를 함께 못 박는다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, getProject, updateProject } from "../lib/projects.js";
import { getStore } from "../lib/store/index.js";
import { VOICES } from "../lib/voices.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const OWNER = "66666666-6666-6666-6666-666666666666";
const AUTH = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };

vi.mock("../lib/pipeline.js", async (orig) => ({
  ...(await orig()),
  runImagesPipeline: vi.fn(async () => {}),
  runVideoPipeline: vi.fn(async () => {}),
  runVoicePipeline: vi.fn(async () => {}),
}));

const { POST: imagesPOST } = await import("../app/api/projects/[id]/images/route.js");
const { POST: clipsPOST } = await import("../app/api/projects/[id]/clips/route.js");
const { POST: voicePOST } = await import("../app/api/projects/[id]/voice/route.js");

describe("생성 시작이 심장박동을 찍는다", () => {
  beforeEach(async () => {
    resetMemoryStore();
    delete process.env.SHOTFORM_FAKE;
    await getStore().insertGrant({
      user_id: OWNER, amount_credits: 500, reason: "충전",
      granted_by: "00000000-0000-4000-8000-0000000000ad",
    });
  });

  it("POST /images 직후 progress 가 있다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: { target_seconds: 30 } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: [{ idx: 0, audio: { seconds: 3 } }, { idx: 1, audio: { seconds: 3 } }],
    }));

    const req = new Request("http://x/api", { method: "POST", headers: AUTH });
    const res = await imagesPOST(req, { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);

    const after = await getProject(p.id, OWNER);
    expect(after.progress.phase).toBe("images");
    expect(after.progress.done).toBe(0);
    expect(after.progress.total).toBe(2);
    expect(typeof after.progress.at).toBe("number");
  });

  it("POST /voice 직후 progress 가 있다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: { target_seconds: 30 } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: [{ idx: 0, sentence: "가" }, { idx: 1, sentence: "나" }],
    }));

    const req = new Request("http://x/api", {
      method: "POST", headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ voiceLabel: VOICES[0].label }),
    });
    const res = await voicePOST(req, { params: Promise.resolve({ id: p.id }) });
    expect(res.status ?? 200).toBe(200);

    const after = await getProject(p.id, OWNER);
    expect(after.progress.phase).toBe("voice");
    expect(after.progress.done).toBe(0);
    expect(after.progress.total).toBe(2);
    expect(typeof after.progress.at).toBe("number");
  });

  it("POST /clips 직후 progress 가 있다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: { target_seconds: 30 } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: [
        { idx: 0, audio: { url: "https://x/a0.m4a" }, image: { url: "https://x/i0.png" } },
        { idx: 1, audio: { url: "https://x/a1.m4a" }, image: { url: "https://x/i1.png" } },
      ],
    }));

    const req = new Request("http://x/api", { method: "POST", headers: AUTH });
    const res = await clipsPOST(req, { params: Promise.resolve({ id: p.id }) });
    expect(res.status ?? 200).toBe(200);

    const after = await getProject(p.id, OWNER);
    expect(after.progress.phase).toBe("video");
    expect(after.progress.done).toBe(0);
    expect(after.progress.total).toBe(2);
    expect(typeof after.progress.at).toBe("number");
  });

  // /clips 는 "남은 N개 만들기"가 있다 — 이미 끝난 클립을 쥔 채로 시작한다.
  // 그 자리에서 done: 0 을 박으면 일어난 적 없는 **뒷걸음**을 기록하는 것이고,
  // 화면은 그걸 "진척이 되감겼다"로 읽는다. 세는 일은 언제나 문서가 한다.
  it("이미 클립이 있는 채로 /clips 를 시작하면 done 이 0 이 아니다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: { target_seconds: 30 } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: [
        // 각인(of)이 없으면 낡지 않은 클립이다(lib/steps.js isClipStale) — 재생성 값이 안 붙는다
        { idx: 0, audio: { url: "https://x/a0.m4a" }, image: { url: "https://x/i0.png" }, video: { url: "https://x/v0.mp4" } },
        { idx: 1, audio: { url: "https://x/a1.m4a" }, image: { url: "https://x/i1.png" } },
      ],
    }));

    const req = new Request("http://x/api", { method: "POST", headers: AUTH });
    const res = await clipsPOST(req, { params: Promise.resolve({ id: p.id }) });
    expect(res.status ?? 200).toBe(200);

    const after = await getProject(p.id, OWNER);
    expect(after.progress.phase).toBe("video");
    expect(after.progress.done, "이미 끝난 클립을 안 세면 뒷걸음이 기록된다").toBe(1);
    expect(after.progress.total).toBe(2);
  });
});
