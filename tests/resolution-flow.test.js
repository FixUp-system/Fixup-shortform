// 화질이 **저장 → 가격 → 요청 → 각인**까지 한 줄로 흐르는지 본다.
//
// 왜 한 테스트가 셋을 쥐는가: 지금 세 층이 각자 프로젝트를 읽는다(가격은 lib/pricing.js,
// 요청은 lib/i2v.js, 각인은 lib/steps.js). 층마다 따로 그린이어도 **읽는 출처가 갈리면**
// 화면에서 고른 값과 다른 값으로 청구되거나 만들어진다 — 그 어긋남은 층 하나를 보는
// 테스트로는 절대 안 잡힌다. 그래서 여기서는 값을 손으로 만들지 않고 **PATCH 로 실제로
// 저장한 문서**를 스토어에서 다시 꺼내 셋에 그대로 먹인다.
//
// ★ 요청 본문은 흉내 내지 않는다 — lib/i2v.js 가 진짜로 만드는 body 를 fetchImpl 로 찍는다.
//   손으로 흉내 낸 관통 테스트는 이음매를 못 잡는다(이 저장소가 실제로 그렇게 놓쳤다).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { runWithActor } from "../lib/actor.js";
import { generateClip } from "../lib/i2v.js";
import { clipKey } from "../lib/steps.js";
import { videoPrice } from "../lib/pricing.js";
import { modelIdForProject, resolutionForProject } from "../lib/clip-limits.js";

const A = "00000000-0000-4000-8000-00000000000a";
const P = "p-res";

const { PATCH } = await import("../app/api/projects/[id]/route.js");

const patch = (settings) =>
  PATCH(
    new Request(`http://localhost/api/projects/${P}`, {
      method: "PATCH",
      headers: {
        [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
        "content-type": "application/json",
      },
      body: JSON.stringify({ settings }),
    }),
    { params: Promise.resolve({ id: P }) }
  );

// 저장된 문서를 그대로 꺼낸다 — 세 층에 먹일 값은 전부 여기서 나온다.
const saved = async () => (await memoryStore.selectProject(P, A)).doc;

const captor = () => {
  const box = {};
  return {
    box,
    fetchImpl: async (_url, init) => {
      box.body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ video: { url: "https://x/v.mp4" } }) };
    },
  };
};

describe("화질이 저장부터 각인까지 관통한다", () => {
  beforeEach(async () => {
    resetMemoryStore();
    // 클립은 유료 호출이라 잔액이 없으면 요청이 나가기 전에 막힌다.
    await memoryStore.insertGrant({ user_id: "t-user", amount_credits: 5000, reason: "테스트", granted_by: "admin" });
    await memoryStore.insertProject(
      { id: P, created_ts: 1, status: "draft", settings: { target_seconds: 30, i2v_model: "seedance-2.0" } },
      A
    );
    // 가짜 모드면 generateClip 이 조기 반환해 요청이 아예 안 나간다.
    process.env.SHOTFORM_FAKE = "off";
  });
  afterEach(() => { delete process.env.SHOTFORM_FAKE; });

  it("1080p 를 저장하면 가격·요청·각인이 모두 1080p 를 본다", async () => {
    expect((await patch({ resolution: "1080p" })).status).toBe(200);

    const project = await saved();
    expect(project.settings.resolution).toBe("1080p");

    // ① 가격 — 라우트들이 넘기는 것과 같은 모양이다(modelIdForProject·resolutionForProject).
    const price = videoPrice(project.settings.target_seconds, modelIdForProject(project), resolutionForProject(project));
    expect(price).toBe(360);
    // 720p 값(160)으로 걷히면 원가 2.25배를 우리가 문다 — 같은 숫자가 아님을 못 박는다.
    expect(price).not.toBe(videoPrice(project.settings.target_seconds, modelIdForProject(project), "720p"));

    // ② 요청 — 실제로 fal 로 나가는 본문을 찍는다.
    const { box, fetchImpl } = captor();
    await runWithActor("t-user", () =>
      generateClip({ imageUrl: "https://x/i.png", seconds: 5, aspect_ratio: "9:16", prompt: "움직인다", projectId: P, project, fetchImpl })
    );
    expect(box.body.resolution).toBe("1080p");

    // ③ 각인 — 화질을 바꿨으면 이미 만든 클립이 낡아야 한다.
    const cut = { idx: 0, image: { url: "https://x/i.png" }, seconds: 5, motion: "천천히" };
    expect(clipKey(cut, project)).toContain("1080p");
  });

  it("셋이 같은 출처를 본다 — 화질을 480p 로 바꾸면 셋이 함께 따라온다", async () => {
    expect((await patch({ resolution: "480p" })).status).toBe(200);
    const project = await saved();

    expect(videoPrice(30, modelIdForProject(project), resolutionForProject(project))).toBe(80);

    const { box, fetchImpl } = captor();
    await runWithActor("t-user", () =>
      generateClip({ imageUrl: "https://x/i.png", seconds: 5, aspect_ratio: "9:16", projectId: P, project, fetchImpl })
    );
    expect(box.body.resolution).toBe("480p");

    expect(clipKey({ idx: 0, image: { url: "https://x/i.png" }, seconds: 5 }, project)).toContain("480p");
  });
});
