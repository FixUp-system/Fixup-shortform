import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { submitAdVideo } from "../lib/ad/generate.js";
import { runWithActor } from "../lib/actor.js";
import { getStore } from "../lib/store/index.js";
import { resetMemoryStore } from "../lib/store/memory.js";

// assertBudget 이 actor 컨텍스트를 요구한다(lib/actor.js 는 없으면 던진다) — 브리프의
// 테스트를 그대로 두면 단정에 닿기 전에 죽는다. 그래서 tests/ad-generate.test.js 와
// 똑같이 runWithActor 로 감싼다. 재는 것은 바뀌지 않는다(나가는 body 뿐).
const U = "00000000-0000-4000-8000-00000000000a";

const PROJECT = { id: "p1", settings: { seconds: 15, model: "seedance-2.0", resolution: "480p", aspect_ratio: "9:16" } };
const SCENARIO = { text: "a video", endpoint: "r2v", shots: [] };

let sent;
const fakeFetch = async (url, opt) => {
  sent = JSON.parse(opt.body);
  return { ok: true, json: async () => ({ request_id: "r1", status_url: "s", response_url: "res" }) };
};

// 체험 축(FREE_TRIAL_USD)에 걸리지 않게 크레딧을 넣어 둔다 — ad-generate.test.js 와 같은 방식.
beforeEach(async () => {
  process.env.FAL_KEY = "k"; delete process.env.SHOTFORM_FAKE; sent = null;
  resetMemoryStore();
  await getStore().insertGrant({ user_id: U, amount_credits: 1000, reason: "테스트", granted_by: "admin" });
});
afterEach(() => { delete process.env.FAL_KEY; resetMemoryStore(); });

describe("참조를 URL 로 넘긴다", () => {
  it("★ url 만 있는 참조는 그대로 실린다 — 만든 이미지는 이미 공개 주소다", async () => {
    await runWithActor(U, () => submitAdVideo({
      project: PROJECT, scenario: SCENARIO,
      refs: [{ url: "https://v3b.fal.media/files/a.png" }, { url: "https://v3b.fal.media/files/b.png" }],
      fetchImpl: fakeFetch,
    }));
    expect(sent.image_urls).toEqual([
      "https://v3b.fal.media/files/a.png",
      "https://v3b.fal.media/files/b.png",
    ]);
  });

  it("★ 바이트 참조는 예전과 똑같이 data URI 가 된다 — 광고 경로가 안 다친다", async () => {
    await runWithActor(U, () => submitAdVideo({
      project: PROJECT, scenario: SCENARIO,
      refs: [{ bytes: Buffer.from([1, 2, 3]), key: "x.png" }],
      fetchImpl: fakeFetch,
    }));
    expect(sent.image_urls[0].startsWith("data:")).toBe(true);
  });
});
