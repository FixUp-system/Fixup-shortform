// 돌고 있는 생성 위에 **한 번 더 돈을 쓰게 두지 않는다.**
//
// 구멍이었다: POST /clips 의 유일한 가드가 "남은 컷이 있나"였다. 멈춤 의심 상태에서 그것은
// 언제나 참이라, 화면이 5분 폴링 상한을 넘겨 버튼을 열면 두 번째 누름이 그대로 통과했다 —
// 낡은 컷을 **다음 등급 값으로 다시 청구**하고(회차·3회 상한까지 깎으며) 같은 컷 위에
// 파이프라인을 하나 더 띄워 fal 원가가 컷당 $0.42~$1.51 이중으로 나갔다.
//
// 판정은 **심장박동 하나**로 한다(lib/progress.js 의 STALL_MS). 잠금을 따로 세우고 실행이
// 끝날 때 지우는 방식은 얼어붙은 함수에서 영영 안 지워져 사장님을 가둔다 — 박동은 그 자리에서
// 저절로 낡는다. 이 잠금이 실제로 겹침을 막으려면 박동이 **시간으로도 뛰어야** 한다
// (tests/heartbeat-ticker.test.js).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject, updateProject } from "../lib/projects.js";
import { chargeVideo } from "../lib/charges.js";
import { STALL_MS } from "../lib/progress.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

vi.mock("../lib/pipeline.js", async (orig) => ({
  ...(await orig()),
  runVideoPipeline: vi.fn(async () => {}),
}));

const { POST } = await import("../app/api/projects/[id]/clips/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const req = () => ({ headers: new Headers({ [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" }) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

// 낡은 클립을 쥔 컷 하나 — 즉 "남은 것"이 있어 옛 가드는 언제나 통과시킨다.
// progress 는 부르는 쪽이 정한다(그것이 이 테스트가 재는 것이다).
async function projectMidRun(progress) {
  const p = await createProject({
    ownerId: A,
    settings: { target_seconds: 30, i2v_model: "kling-v3", aspect_ratio: "9:16" },
    material: { text: "자료", photos: [] },
  });
  await updateProject(p.id, A, (proj) => ({
    ...proj,
    status: "video",
    progress,
    cuts: [{
      idx: 0, sentence: "가", seconds: 3,
      audio: { url: "https://x/a.m4a" },
      image: { url: "https://x/i.png" },
      video: { url: "https://x/v.mp4", of: "옛-각인" },   // of 가 지금 각인과 달라 낡음이다
      clip_regen_count: 1,                                 // 다음 회차는 유료다
    }],
  }));
  await chargeVideo({ userId: A, projectId: p.id, seconds: 30, model: "kling-v3" });
  return p;
}

describe("돌고 있는 생성 위에 다시 만들기를 막는다", () => {
  beforeEach(() => {
    resetMemoryStore();
    delete process.env.SHOTFORM_FAKE;
  });

  const grant = (n) => getStore().insertGrant({ user_id: A, amount_credits: n, reason: "충전", granted_by: ADMIN });

  it("박동이 살아 있으면 거절한다 — 값도 받지 않는다", async () => {
    await grant(500);
    const p = await projectMidRun({ at: Date.now(), phase: "video", done: 0, total: 1 });
    const before = await getStore().sumCharges(A);

    const res = await POST(req(), ctx(p.id));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/만들고 있어요/);
    expect(await getStore().sumCharges(A), "거절했는데 값을 받았다").toBe(before);
    // 회차도 안 올라야 한다 — 3회 상한은 실제로 만든 횟수여야 한다
    expect((await getProject(p.id, A)).cuts[0].clip_regen_count).toBe(1);
  });

  it("박동이 임계만큼 멎었으면 통과시킨다 — 정말 죽은 실행에서 갇히지 않는다", async () => {
    await grant(500);
    const p = await projectMidRun({ at: Date.now() - STALL_MS - 1, phase: "video", done: 0, total: 1 });

    const res = await POST(req(), ctx(p.id));

    expect(res.status ?? 200).toBe(200);
  });

  it("앞 단계의 박동은 막지 않는다 — 영상은 아직 시작한 적이 없다", async () => {
    await grant(500);
    const p = await projectMidRun({ at: Date.now(), phase: "images", done: 1, total: 1 });

    const res = await POST(req(), ctx(p.id));

    expect(res.status ?? 200).toBe(200);
  });

  it("박동이 아예 없으면 통과시킨다 — 옛 프로젝트다", async () => {
    await grant(500);
    const p = await projectMidRun(undefined);

    const res = await POST(req(), ctx(p.id));

    expect(res.status ?? 200).toBe(200);
  });
});
