// 같은 컷을 **동시에 두 번** 다시 만들면 fal 이 한 번만 나가야 한다(2026-09-30 점검).
//
// 라우트는 회차(prior)를 읽고 → 그 회차 값을 받고 → 생성을 부른다. 회차 값은 장부의
// 멱등키가 한 번만 받게 막지만, 생성은 두 요청이 다 돌았다 — 더블클릭 하나로 fal 값이
// 두 번 나갔다. 막는 자리는 **회차를 올리는 원자적 쓰기**다: 라우트가 읽은 회차
// (expectedPrior)가 그 자리의 값과 다르면 다른 요청이 이미 그 회차를 가져간 것이다 —
// 진 쪽은 유료 호출 **전에** RegenBusy 로 끝난다.
import { describe, it, expect, beforeEach, vi } from "vitest";

const llmMock = vi.hoisted(() => ({ callJson: vi.fn() }));
vi.mock("../lib/llm.js", () => ({ callJson: (...a) => llmMock.callJson(...a) }));
const vlmMock = vi.hoisted(() => ({ describePhoto: vi.fn() }));
vi.mock("../lib/vlm.js", async (importOriginal) => ({
  ...(await importOriginal()),
  describePhoto: (...a) => vlmMock.describePhoto(...a),
}));

import * as projects from "../lib/projects.js";
import * as pipeline from "../lib/pipeline.js";
import { RegenBusy } from "../lib/regen-busy.js";
import { resetMemoryStore } from "../lib/store/memory.js";

const OWNER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  resetMemoryStore();
  llmMock.callJson.mockReset();
  vlmMock.describePhoto.mockReset();
  vlmMock.describePhoto.mockResolvedValue({ person: false, what: "", who: null });
});

async function withCut(cut) {
  const p = await projects.createProject({
    ownerId: OWNER,
    settings: { aspect_ratio: "9:16" },
    material: { text: "자료", photos: [] },
  });
  await projects.updateProject(p.id, OWNER, (proj) => ({
    ...proj, status: "video", voice_id: "v1",
    cuts: [{ idx: 0, sentence: "문장", seconds: 5, source: "ai", image: { url: "http://img/0" }, ...cut }],
  }));
  return p;
}

// 유료 호출을 센다. 느리게 끝나야 두 요청이 실제로 겹친다.
function counter(result) {
  const calls = { n: 0 };
  const fn = async () => {
    calls.n += 1;
    await new Promise((r) => setTimeout(r, 5));
    return result;
  };
  return { calls, fn };
}

const imageDeps = (genImage) => ({
  genImage,
  select: async () => ({ selectedIndex: 0, passed: true, note: "ok" }),
});

describe("동시 재생성 — 같은 회차는 한 요청만 만든다", () => {
  it("이미지: 진 쪽은 RegenBusy 이고 그림은 한 번(한 요청 분량)만 그린다", async () => {
    // 한 요청이 그리는 분량을 먼저 잰다 — 후보 장수가 바뀌어도 이 테스트가 안 깨지게
    const solo = await withCut({ regen_count: 1 });
    const one = counter({ url: "http://img/solo" });
    await pipeline.regenCut(solo.id, OWNER, 0, imageDeps(one.fn), null, { expectedPrior: 1 });

    const p = await withCut({ regen_count: 1 });
    const both = counter({ url: "http://img/new" });
    const results = await Promise.allSettled([
      pipeline.regenCut(p.id, OWNER, 0, imageDeps(both.fn), null, { expectedPrior: 1 }),
      pipeline.regenCut(p.id, OWNER, 0, imageDeps(both.fn), null, { expectedPrior: 1 }),
    ]);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(RegenBusy);
    expect(both.calls.n).toBe(one.calls.n);
    expect((await projects.getProject(p.id, OWNER)).cuts[0].regen_count).toBe(2);
  });

  it("목소리: 진 쪽은 RegenBusy 이고 소리는 한 번만 만든다", async () => {
    const p = await withCut({ voice_regen_count: 1 });
    const speak = counter({ url: "http://a.mp3", seconds: 3 });
    const results = await Promise.allSettled([
      pipeline.regenVoice(p.id, OWNER, 0, { speak: speak.fn }, { expectedPrior: 1 }),
      pipeline.regenVoice(p.id, OWNER, 0, { speak: speak.fn }, { expectedPrior: 1 }),
    ]);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(RegenBusy);
    expect(speak.calls.n).toBe(1);
  });

  it("클립: 진 쪽은 RegenBusy 이고 클립은 한 번만 만든다", async () => {
    const p = await withCut({ clip_regen_count: 1 });
    const clip = counter({ url: "http://v.mp4", seconds: 5 });
    const results = await Promise.allSettled([
      pipeline.regenClip(p.id, OWNER, 0, { clip: clip.fn }, null, { expectedPrior: 1 }),
      pipeline.regenClip(p.id, OWNER, 0, { clip: clip.fn }, null, { expectedPrior: 1 }),
    ]);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(RegenBusy);
    expect(clip.calls.n).toBe(1);
  });

  it("이미 지나간 회차를 들고 오면 유료 호출 없이 RegenBusy", async () => {
    const p = await withCut({ clip_regen_count: 2 });
    const clip = counter({ url: "http://v.mp4", seconds: 5 });
    await expect(
      pipeline.regenClip(p.id, OWNER, 0, { clip: clip.fn }, null, { expectedPrior: 1 }),
    ).rejects.toBeInstanceOf(RegenBusy);
    expect(clip.calls.n).toBe(0);
  });

  it("expectedPrior 를 안 주면 예전처럼 돈다(가짜 모드 경로)", async () => {
    const p = await withCut({ voice_regen_count: 4 });
    const speak = counter({ url: "http://a.mp3", seconds: 3 });
    await pipeline.regenVoice(p.id, OWNER, 0, { speak: speak.fn });
    expect(speak.calls.n).toBe(1);
  });
});
