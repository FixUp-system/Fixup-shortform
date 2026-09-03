// **라우트를 진짜로 불러서** 통짜가 완료를 선언하지 않는 것을 확인한다 (2026-09-03).
//
// ★★★ 왜 이 파일이 따로 있나 — 짝이 되는 `tests/oneshot-status-ownership.test.js` 는
//   **소스 문자열만** 본다("`.then()` 안에 oneshot 갈래가 있다"). 그 방식은 이 저장소가
//   이미 여러 번 속은 자리다(OUTSTANDING §7-10: "소스 문자열로 재는 판이 하루에 다섯 번
//   틀렸다"). 여기서는 라우트를 **실행해서 문서가 실제로 어떤 상태가 되는지** 잰다.
//
// ★ fal 은 안 부른다 — 파이프라인을 통째로 모킹한다. 재는 것은 굽기가 아니라
//   **"접수 뒤에 라우트가 문서에 무엇을 적는가"** 하나다. $0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";

// 통짜·컷별 둘 다 **아무 일도 안 하고 성공**한 척한다 — 라우트가 그 뒤에 무엇을 적는지만 본다.
vi.mock("../lib/reel/pipeline.js", async (orig) => {
  const real = await orig();
  return { ...real, runReelOneShot: vi.fn(async () => {}), runReelClips: vi.fn(async () => {}) };
});
import { POST } from "../app/api/reel/[id]/clips/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const SHEET = "https://v3b.fal.media/files/b/x/sheet.png";

const headers = { [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user", "content-type": "application/json" };
const req = () => new Request("http://localhost/api/reel/x/clips", { method: "POST", headers, body: "{}" });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

// 컷 n 개 — 그림과 **판 주소**가 있어야 통짜 조건을 만족한다(planReelBake).
const cutsWith = (n, sheet) =>
  Array.from({ length: n }, (_, i) => ({
    idx: i, shows: `장면 ${i + 1}`, sentence: `문장 ${i + 1}`, seconds: 15 / n,
    image: { url: `/api/uploads/c${i}.jpg`, ...(sheet ? { sheet } : {}) },
    prompt: `clip prompt ${i}`,
  }));

async function makeReel({ count, sheet }) {
  const p = await projects.createProject({
    ownerId: A, kind: "reel",
    settings: { aspect_ratio: "9:16", target_seconds: 15, i2v_model: "seedance-2.0", resolution: "720p" },
    material: { text: "자료", photos: [] },
  });
  await projects.updateProject(p.id, A, (doc) => ({
    ...doc, kind: "reel", cuts: cutsWith(count, sheet),
    scenario: { text: "시나리오" },
    reel: { status: "prompts", prompt: "One continuous 15-second vertical video." },
  }));
  return p.id;
}

beforeEach(async () => {
  resetMemoryStore();
  await getStore().insertGrant({ user_id: A, amount_credits: 1000, reason: "충전", granted_by: ADMIN });
});

describe("POST /api/reel/[id]/clips — 라우트를 실제로 부른다", () => {
  it("★★★ 통짜는 접수 뒤에도 status 가 **rendering 그대로**다 — 폴링이 살아 있어야 한다", async () => {
    // 6컷 + 판 주소 = 통짜 조건(2행 3열)
    const id = await makeReel({ count: 6, sheet: SHEET });
    const res = await POST(req(), ctx(id));
    expect(res.status).toBe(200);

    const doc = await projects.getProject(id, A);
    expect(doc.reel.status, "접수를 완료로 읽어 clips 를 찍었다 — 폴링이 즉시 죽는다")
      .toBe("rendering");
  });

  it("★★ 통짜에서 오류가 나면 그때는 적는다 — 접수 자체가 실패한 경우다", async () => {
    const { runReelOneShot } = await import("../lib/reel/pipeline.js");
    runReelOneShot.mockImplementationOnce(async () => { throw new Error("영상 접수 실패 (422) 어쩌고"); });

    const id = await makeReel({ count: 6, sheet: SHEET });
    await POST(req(), ctx(id));
    // ★ 라우트는 **응답을 먼저 보내고** 파이프라인은 그 뒤에 돈다(runInBackground).
    //   그래서 여기서 한 박자 흘려보내야 catch 가 적은 것을 볼 수 있다.
    await new Promise((r) => setTimeout(r, 20));

    const doc = await projects.getProject(id, A);
    expect(doc.reel.status).toBe("error");
    expect(doc.reel.errorStep).toBe("video");
    expect(doc.reel.error).toMatch(/422/);
  });
});
