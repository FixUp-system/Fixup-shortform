// 광고 영상 생성 — fal 을 부르는 유일한 자리(lib/ad/generate.js)를 잰다.
// ★ 여기서 만드는 fetchImpl 은 전부 가짜다. 진짜 fal 을 부르면 한 번이 $3.63 이다.
import { describe, it, expect, afterEach } from "vitest";
import { generateAdVideo } from "../lib/ad/generate.js";
import { runWithActor } from "../lib/actor.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

const U = "00000000-0000-4000-8000-00000000000a";
const project = {
  id: "00000000-0000-4000-8000-0000000000f1",
  settings: { seconds: 15, aspect_ratio: "9:16", model: "seedance-2.0-fast" },
};
const ok = () => ({
  ok: true,
  json: async () => ({ video: { url: "https://fal.example/v.mp4" } }),
  text: async () => "",
});

// assertBudget 의 체험 상한($0.5, lib/pricing.js FREE_TRIAL_USD)은 "결제도 없고 크레딧도
// 없는" 사람에게 걸린다. 이 파일이 보는 것은 fal 호출의 모양(요청·파싱·원장)이지 그
// 상한 자체가 아니므로, 형제 파일들(tests/i2v.test.js·tests/imagegen.test.js)과 같은
// 방식으로 넉넉히 충전해 그 게이트를 열어 둔다.
async function grantCredits() {
  await getStore().insertGrant({ user_id: U, amount_credits: 1000, reason: "테스트", granted_by: "admin" });
}

describe("광고 영상 생성", () => {
  afterEach(() => { delete process.env.SHOTFORM_FAKE; resetMemoryStore(); });

  it("t2v 는 사진 없이 부른다", async () => {
    resetMemoryStore();
    await grantCredits();
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return ok(); };
    const out = await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl })
    );
    expect(seen.url).toContain("text-to-video");
    expect(seen.body.duration).toBe(15);
    expect(seen.body.aspect_ratio).toBe("9:16");
    expect(seen.body.resolution).toBe("720p");
    expect(seen.body.image_urls).toBeUndefined();
    expect(out.url).toBe("https://fal.example/v.mp4");
    expect(out.seconds).toBe(15);
  });

  it("i2v 는 사진 한 장을 image_url 로 넘긴다", async () => {
    resetMemoryStore();
    await grantCredits();
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return ok(); };
    await runWithActor(U, () =>
      generateAdVideo({
        project, scenario: { text: "P", endpoint: "i2v" },
        refs: [{ key: "a.png", bytes: Buffer.from("x") }], fetchImpl,
      })
    );
    expect(seen.url).toContain("image-to-video");
    expect(seen.body.image_url).toMatch(/^data:image\/png;base64,/);
  });

  it("r2v 는 여러 장을 image_urls 로 넘긴다", async () => {
    resetMemoryStore();
    await grantCredits();
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return ok(); };
    await runWithActor(U, () =>
      generateAdVideo({
        project, scenario: { text: "P", endpoint: "r2v" },
        refs: [{ key: "a.png", bytes: Buffer.from("x") }, { key: "b.jpg", bytes: Buffer.from("y") }],
        fetchImpl,
      })
    );
    expect(seen.url).toContain("reference-to-video");
    expect(seen.body.image_urls.length).toBe(2);
  });

  it("★ 가짜 모드에서는 fal 을 안 부른다", async () => {
    resetMemoryStore();
    process.env.SHOTFORM_FAKE = "fal";
    let called = false;
    const fetchImpl = async () => { called = true; return ok(); };
    const out = await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl })
    );
    expect(called).toBe(false);
    expect(out.url).toBeTruthy();
  });

  it("원장에 그 엔드포인트가 남는다 — 어느 모델로 만들었는지의 유일한 기록", async () => {
    resetMemoryStore();
    await grantCredits();
    const fetchImpl = async () => ok();
    await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl })
    );
    // ⚠️ lib/store/memory.js·lib/store/supabase.js 어디에도 `listCosts` 는 없다
    // (`allCosts()` 전체 목록과 `sumCosts({projectId, actor})` 합계뿐이다). 브리프가
    // 가정한 이름을 실제 계약(allCosts)에 맞춘다 — endpoint 문자열 자체를 확인해야
    // "어느 모델로 만들었는지의 유일한 기록"이라는 이 테스트의 취지가 산다.
    const rows = await getStore().allCosts();
    const mine = rows.filter((r) => r.project_id === project.id);
    expect(mine.some((r) => String(r.endpoint).startsWith("bytedance/seedance-2.0/fast"))).toBe(true);
  });

  it("결과가 비면 던진다", async () => {
    resetMemoryStore();
    await grantCredits();
    const fetchImpl = async () => ({ ok: true, json: async () => ({}), text: async () => "" });
    await expect(
      runWithActor(U, () =>
        generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl })
      )
    ).rejects.toThrow();
  });
});
