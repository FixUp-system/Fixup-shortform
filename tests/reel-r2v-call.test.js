// refs 를 들고 오면 r2v 로 나간다 — 안 들고 오면 옛 i2v 그대로다(회귀 0).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateClip } from "../lib/i2v.js";
import { runWithActor } from "../lib/actor.js";
import { memoryStore } from "../lib/store/memory.js";

// ★ 사용자 축은 **잔액**이다 — 충전이 없으면 유료 호출이 나가기 전에 막힌다.
//   `"admin"` 을 쓰지 마라: 충전이 불가능한 영구 체험자라 체험 한도에 걸린다.
//   (tests/i2v.test.js 가 쓰는 관행 그대로다.)
beforeEach(() =>
  memoryStore.insertGrant({ user_id: "t-user", amount_credits: 1000, reason: "테스트", granted_by: "admin" })
);

const project = { settings: { i2v_model: "seedance-2.0", resolution: "480p" } };

// fal 을 흉내낸다 — 부른 URL 과 본문을 잡아 둔다.
function spyFetch(box) {
  return async (url, init) => {
    box.url = url;
    box.body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ video: { url: "https://x/v.mp4" } }) };
  };
}

beforeEach(() => { process.env.FAL_KEY = "test-key"; });
afterEach(() => { delete process.env.FAL_KEY; });

const run = (fn) => runWithActor("t-user", fn);

describe("refs 가 있으면", () => {
  it("r2v 엔드포인트로 나간다", async () => {
    const box = {};
    await run(() => generateClip({
      imageUrl: "https://x/cut2.png",
      refs: [{ url: "https://x/face.png" }, { url: "https://x/product.png" }],
      seconds: 4, aspect_ratio: "9:16", prompt: "p",
      projectId: "pid", project, fetchImpl: spyFetch(box),
    }));
    expect(box.url).toBe("https://fal.run/bytedance/seedance-2.0/reference-to-video");
  });

  it("컷 그림이 맨 앞이고 참조가 그 뒤에 순서대로 실린다", async () => {
    const box = {};
    await run(() => generateClip({
      imageUrl: "https://x/cut2.png",
      refs: [{ url: "https://x/face.png" }, { url: "https://x/product.png" }],
      seconds: 4, aspect_ratio: "9:16", prompt: "p",
      projectId: "pid", project, fetchImpl: spyFetch(box),
    }));
    expect(box.body.image_urls).toEqual([
      "https://x/cut2.png", "https://x/face.png", "https://x/product.png",
    ]);
    // r2v 는 image_url 을 안 받는다 — 모르는 필드를 보내면 거절될 수 있다
    expect(box.body.image_url).toBeUndefined();
  });

  it("r2v 를 안 여는 모델이면 던진다 — 조용히 i2v 로 떨어지지 않는다", async () => {
    const kling = { settings: { i2v_model: "kling-v3" } };
    await expect(
      run(() => generateClip({
        imageUrl: "https://x/cut2.png", refs: [{ url: "https://x/face.png" }],
        seconds: 4, aspect_ratio: "9:16", prompt: "p",
        projectId: "pid", project: kling, fetchImpl: spyFetch({}),
      }))
    ).rejects.toThrow(/참조/);
  });
});

describe("★ refs 가 없으면 회귀 0", () => {
  it("옛 i2v 엔드포인트와 image_url 그대로다", async () => {
    const box = {};
    await run(() => generateClip({
      imageUrl: "https://x/cut2.png",
      seconds: 4, aspect_ratio: "9:16", prompt: "p",
      projectId: "pid", project, fetchImpl: spyFetch(box),
    }));
    expect(box.url).toBe("https://fal.run/bytedance/seedance-2.0/image-to-video");
    expect(box.body.image_url).toBe("https://x/cut2.png");
    expect(box.body.image_urls).toBeUndefined();
  });

  it("빈 배열도 없는 것으로 본다", async () => {
    const box = {};
    await run(() => generateClip({
      imageUrl: "https://x/cut2.png", refs: [],
      seconds: 4, aspect_ratio: "9:16", prompt: "p",
      projectId: "pid", project, fetchImpl: spyFetch(box),
    }));
    expect(box.url).toBe("https://fal.run/bytedance/seedance-2.0/image-to-video");
  });
});
