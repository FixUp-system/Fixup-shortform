// 심장박동은 **시간으로도** 뛴다.
//
// 원래는 컷이 끝날 때만 뛰었다(withProgress 를 부르는 자리가 setCut 뿐이었다). 그런데
// runVideoPipeline 은 컷들을 Promise.all 로 한꺼번에 돌리므로, 컷이 모두 2분 넘게 걸리면
// **살아 있는 실행이 박동 없이 2분을 넘긴다** — 화면은 "멈췄다"고 하고(거짓 양성),
// 5분 뒤 버튼을 열어 두 번째 누름이 값을 이중으로 받는 길을 만들었다.
//
// 그래서 도는 동안 시계로도 뛴다. 이것이 있어야 "박동이 낡음 = 죽음"이 참이 되고,
// POST /clips 의 진행 중 잠금(tests/clips-inflight-lock.test.js)이 실제로 겹침을 막는다.
//
// ★ 여기서 재는 것은 **간격이 아니라 방향**이다 — "도는 동안 at 이 앞으로 간다".
//   실제 간격(HEARTBEAT_MS)을 그대로 쓰면 테스트가 2분을 기다려야 하므로 주입한다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, getProject, updateProject } from "../lib/projects.js";
import { runVideoPipeline, startHeartbeat } from "../lib/pipeline.js";
import { HEARTBEAT_MS, STALL_MS } from "../lib/progress.js";

const A = "00000000-0000-4000-8000-00000000000a";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 클립 하나가 남은 프로젝트 — 박동은 시작 시각으로 박아 둔다(라우트가 하는 일).
async function projectAtStart(at) {
  const p = await createProject({
    ownerId: A,
    settings: { target_seconds: 30, i2v_model: "kling-v3", aspect_ratio: "9:16" },
    material: { text: "자료", photos: [] },
  });
  await updateProject(p.id, A, (proj) => ({
    ...proj,
    status: "video",
    progress: { at, phase: "video", done: 0, total: 1 },
    cuts: [{ idx: 0, sentence: "가", seconds: 3, audio: { url: "https://x/a.m4a" }, image: { url: "https://x/i.png" } }],
  }));
  return p;
}

describe("심장박동은 도는 동안 시계로도 뛴다", () => {
  beforeEach(() => resetMemoryStore());

  it("임계보다 촘촘하다 — 정상 실행은 멈춤으로 읽히지 않는다", () => {
    expect(HEARTBEAT_MS).toBeLessThan(STALL_MS);
  });

  it("도는 동안 진척 시각이 앞으로 간다", async () => {
    const t0 = Date.now() - 60_000;   // 1분 전에 시작한 실행
    const p = await projectAtStart(t0);

    const stop = startHeartbeat(p.id, A, "video", { intervalMs: 20 });
    await sleep(70);
    stop();

    const doc = await getProject(p.id, A);
    expect(doc.progress.phase).toBe("video");
    expect(doc.progress.at, "박동이 시작 시각에 그대로 머물렀다").toBeGreaterThan(t0);
  });

  it("멈추면 더 뛰지 않는다 — 끝난 실행이 살아 있는 척하지 않는다", async () => {
    const p = await projectAtStart(Date.now() - 60_000);

    const stop = startHeartbeat(p.id, A, "video", { intervalMs: 20 });
    await sleep(50);
    stop();
    const afterStop = (await getProject(p.id, A)).progress.at;
    await sleep(80);

    expect((await getProject(p.id, A)).progress.at).toBe(afterStop);
  });

  it("느린 컷을 만드는 동안에도 뛴다 — 이것이 원래의 구멍이다", async () => {
    const t0 = Date.now() - 60_000;
    const p = await projectAtStart(t0);

    let midAt = null;   // 클립이 아직 안 끝난 시점의 박동
    const clip = async () => {
      await sleep(80);
      midAt = (await getProject(p.id, A)).progress?.at;
      return { url: "https://x/v.mp4", seconds: 3, truncated: false };
    };

    await runVideoPipeline(p.id, A, { clip, heartbeatMs: 20 });

    expect(midAt, "컷이 끝나기 전에는 박동이 없었다").toBeGreaterThan(t0);
  });
});
