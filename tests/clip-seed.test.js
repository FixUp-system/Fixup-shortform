import { describe, it, expect, beforeEach } from "vitest";
import { generateClip } from "../lib/i2v.js";
import { clipSeed, seedForProject, CLIP_PROFILES } from "../lib/clip-limits.js";
import { clipKey, isClipStale } from "../lib/steps.js";
import { runWithActor } from "../lib/actor.js";
import { memoryStore } from "../lib/store/memory.js";

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// 원장이 실제로 도는 경로를 지난다 — 저장소의 data/ 를 오염시키지 않게 임시 디렉터리로.
process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-seed-"));

beforeEach(() => {
  process.env.SHOTFORM_FAKE = "off";
  memoryStore.insertGrant({ user_id: "t-user", amount_credits: 1000, reason: "테스트", granted_by: "admin" });
});

const captor = () => {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ video: { url: "https://x/v.mp4" } }) };
    },
  };
};

const base = { imageUrl: "https://x/i.png", seconds: 5, aspect_ratio: "9:16", prompt: "움직인다" };
const seedance = { settings: { i2v_model: "seedance-2.0" } };
const kling = { settings: { i2v_model: "kling-v3" } };

// 씨앗은 프로젝트 id 에서 파는 순수 함수다 — 저장하지 않는다. 저장하면 문서마다 값이 두 벌이
// 되고(파생값 + 저장값) 옛 프로젝트에 없는 값이 생긴다.
describe("clipSeed — 프로젝트 id 에서 결정적으로 파생", () => {
  it("같은 id 는 언제나 같은 씨앗이다", () => {
    const a = clipSeed("6e204c41-9149-477b-a23c-f506bb0a7441");
    const b = clipSeed("6e204c41-9149-477b-a23c-f506bb0a7441");
    expect(a).toBe(b);
  });

  it("32비트 양의 정수다 — fal 이 받는 범위를 넘지 않는다", () => {
    for (const id of ["p1", "p2", "", "6e204c41-9149-477b-a23c-f506bb0a7441", "가나다", "x".repeat(200)]) {
      const s = clipSeed(id);
      expect(Number.isSafeInteger(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(2147483647);
    }
  });

  it("다른 id 는 다른 씨앗이다 — 서로 다른 영상이 같은 목소리를 쓰지 않는다", () => {
    const ids = ["p1", "p2", "p3", "aaa", "aab", "6e204c41-9149-477b-a23c-f506bb0a7441"];
    const seeds = new Set(ids.map(clipSeed));
    expect(seeds.size).toBe(ids.length);
  });
});

// 프로필이 여는 모델에만 싣는다 — 모르는 필드를 보내면 fal 이 거절할 수 있다.
describe("seedForProject — 씨앗을 여는 모델만", () => {
  it("Seedance 는 씨앗을 열고 값은 clipSeed 와 같다", () => {
    expect(seedForProject(seedance, "p-1")).toBe(clipSeed("p-1"));
  });

  it("Kling·옛 프로젝트·모르는 모델은 0 이다", () => {
    expect(seedForProject(kling, "p-1")).toBe(0);
    expect(seedForProject({ settings: {} }, "p-1")).toBe(0);
    expect(seedForProject({ settings: { i2v_model: "veo-9" } }, "p-1")).toBe(0);
    expect(seedForProject(undefined, "p-1")).toBe(0);
  });

  it("프로젝트 id 가 없으면 0 이다 — 고정할 대상이 없다", () => {
    expect(seedForProject(seedance, "")).toBe(0);
    expect(seedForProject(seedance, undefined)).toBe(0);
  });

  // extra 는 정적 객체다. 프로젝트별 값이 거기 섞이면 상수가 요청마다 달라져야 하는 값을
  // 들게 된다 — 그래서 여는지 여부만 프로필이 쥔다.
  it("프로필의 extra 에는 seed 가 없다 — 정적 필드와 프로젝트별 필드를 섞지 않는다", () => {
    for (const p of CLIP_PROFILES) expect(Object.keys(p.extra || {})).not.toContain("seed");
  });
});

describe("요청 본문의 씨앗", () => {
  it("Seedance 요청에 씨앗이 실리고, 컷마다 같다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () =>
      generateClip({ ...base, projectId: "p-seed-fix", project: seedance, fetchImpl })
    );
    await runWithActor("t-user", () =>
      generateClip({ ...base, imageUrl: "https://x/i2.png", projectId: "p-seed-fix", project: seedance, fetchImpl })
    );
    expect(calls[0].body.seed).toBe(clipSeed("p-seed-fix"));
    expect(calls[1].body.seed).toBe(calls[0].body.seed);
  });

  it("다른 프로젝트는 다른 씨앗으로 나간다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () => generateClip({ ...base, projectId: "p-a", project: seedance, fetchImpl }));
    await runWithActor("t-user", () => generateClip({ ...base, projectId: "p-b", project: seedance, fetchImpl }));
    expect(calls[0].body.seed).not.toBe(calls[1].body.seed);
  });

  it("Kling 요청에는 seed 키가 아예 없다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () => generateClip({ ...base, projectId: "p-k", project: kling, fetchImpl }));
    expect("seed" in calls[0].body).toBe(false);
  });

  it("project 를 안 넘긴 옛 호출부에도 seed 키가 없다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () => generateClip({ ...base, projectId: "p-legacy", fetchImpl }));
    expect("seed" in calls[0].body).toBe(false);
  });

  it("projectId 가 없으면 seed 키가 없다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("t-user", () => generateClip({ ...base, project: seedance, fetchImpl }));
    expect("seed" in calls[0].body).toBe(false);
  });
});

// ★★ 씨앗은 프롬프트가 아니다. 각인에 들어가면 이미 값을 치른 클립이 통째로 낡아
//     컷당 재구매가 열린다.
describe("씨앗은 각인을 건드리지 않는다", () => {
  const cut = { idx: 0, image: { url: "https://x/i.png" }, seconds: 5, motion: "slow", sentence: "안녕하세요" };

  it("clipKey 에 씨앗 값이 안 들어간다", () => {
    const key = clipKey(cut, seedance);
    expect(key).not.toContain(String(clipSeed("p-seed-fix")));
    expect(key).not.toContain("seed=");
  });

  it("씨앗을 실은 뒤에도 옛 각인이 낡지 않는다", () => {
    const stamped = { ...cut, video: { url: "https://x/v.mp4", seconds: 5, of: clipKey(cut, seedance) } };
    expect(isClipStale(stamped, { ...seedance, cuts: [stamped] })).toBe(false);
  });
});

// 원장 meta 에 남긴다(새 컬럼이 아니라 jsonb 안이다 — duration·aspect_ratio 와 같은 자리).
// "왜 이 목소리였나"를 나중에 추적할 유일한 채널이다.
describe("원장", () => {
  it("씨앗이 원장에 남는다", async () => {
    const { fetchImpl } = captor();
    await runWithActor("t-user", () =>
      generateClip({ ...base, projectId: "p-ledger-seed", project: seedance, fetchImpl })
    );
    const row = (await memoryStore.allCosts()).find((r) => r.project_id === "p-ledger-seed");
    expect(row.seed).toBe(clipSeed("p-ledger-seed"));
  });

  it("씨앗을 안 실은 모델의 행에는 씨앗이 없다", async () => {
    const { fetchImpl } = captor();
    await runWithActor("t-user", () =>
      generateClip({ ...base, projectId: "p-ledger-kling", project: kling, fetchImpl })
    );
    const row = (await memoryStore.allCosts()).find((r) => r.project_id === "p-ledger-kling");
    expect("seed" in row).toBe(false);
  });
});
