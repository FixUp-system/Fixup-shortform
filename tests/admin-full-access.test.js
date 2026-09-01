// 관리자는 **등급을 안 탄다** — 모든 모델·해상도를 쓸 수 있다(2026-08-21 사장님 결정).
//
// ★ 왜 이 시험이 필요한가: 그전에는 두 게이트가 **다른 축**을 보고 있었다.
//   · 모델   — tier 만 봤다 → 관리자도 basic 이면 2.5 를 못 골랐다
//   · 해상도 — admin 을 봤다 → 관리자면 1080p 가 열렸다
//   그래서 "2.5 의 1080p 는 관리자 전용"이 **아무도 도달할 수 없는 죽은 코드**였다.
//   실제로 그 상태였다(관리자 계정의 tier 가 basic 이었다).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore, memoryStore } from "../lib/store/memory.js";
import { modelsForTier, tierAllowsModel, DEFAULT_TIER } from "../lib/tiers.js";
import { AD_MODELS, adResolutionsFor, isAdResolution } from "../lib/ad/models.js";

vi.mock("../lib/ad/llm.js", async (importOriginal) => ({
  ...(await importOriginal()),
  callJson: vi.fn(async () => ({
    text: "Vertical commercial.",
    shots: [{ beat: "제품 등장", camera: "push-in", action: "놓인다", line: "매일 아침" }],
    endpoint: "i2v",
  })),
}));

import { POST as createAd } from "../app/api/ads/route.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const U = "00000000-0000-4000-8000-0000000000ad";
const headers = (role) => ({ [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: role });
const post = (role, settings) =>
  new Request("http://x/api/ads", {
    method: "POST",
    headers: headers(role),
    body: JSON.stringify({
      material: { text: "앰플 광고" },
      settings: {
        seconds: 15, aspect_ratio: "9:16", format: "hero",
        mood: "premium", narration_lang: "ko", style: "photo", ...settings,
      },
    }),
  });

describe("판정 함수 — 관리자는 등급을 안 탄다", () => {
  it("관리자에게는 숨기지도 은퇴하지도 않은 모델이 전부 열린다", () => {
    // ★ 2026-09-01 — 거르는 축이 둘이다: `hidden`(아무도) · `retired`(새로는 못 고름).
    //   관리자도 **목록**에는 은퇴 모델이 안 나온다 — 다만 게이트는 지난다(아래 시험).
    const all = AD_MODELS.filter((m) => !m.hidden && !m.retired).map((m) => m.id);
    expect(modelsForTier("basic", { admin: true }).map((m) => m.id)).toEqual(all);
    // 등급이 아예 없어도 마찬가지다 — 관리자면 등급을 안 본다.
    expect(modelsForTier(undefined, { admin: true }).map((m) => m.id)).toEqual(all);
  });

  it("기본 등급 손님에게는 여전히 좁다 — 문을 통째로 열어 버린 것이 아니다", () => {
    expect(modelsForTier("basic").map((m) => m.id)).not.toContain("seedance-2.5");
    expect(tierAllowsModel("basic", "seedance-2.5")).toBe(false);
    expect(tierAllowsModel("basic", "seedance-2.5", { admin: true })).toBe(true);
  });

  // ★ 기본값이 닫힌 쪽이다 — 넘기는 것을 잊으면 덜 열어 주는 방향으로 틀린다.
  it("admin 을 안 넘기면 손님으로 본다", () => {
    expect(tierAllowsModel(DEFAULT_TIER, "seedance-2.5")).toBe(false);
  });

  // ★ hidden 은 "은퇴했거나 고장 났다"는 뜻이지 "비싸다"가 아니다 — 관리자도 못 쓴다.
  it("숨긴 모델은 관리자도 못 쓴다", () => {
    expect(tierAllowsModel("pro", "seedance-2.0-fast", { admin: true })).toBe(false);
    expect(tierAllowsModel("pro", "없는-모델", { admin: true })).toBe(false);
  });

  // ★★ 이것이 이 파일의 핵심이다: 두 게이트가 **같은 축**을 봐야 관리자 전용 해상도에
  //    도달할 수 있다. 하나라도 tier 로 돌아가면 그 자리는 다시 죽은 코드가 된다.
  it("★ 관리자는 2.5 를 고를 수 있고, 그래야 1080p 에 도달한다", () => {
    // ★ 2026-09-01 — 2.5 는 **은퇴**라 목록엔 없지만 게이트는 관리자에게 통과시킨다.
    expect(tierAllowsModel("basic", "seedance-2.5", { admin: true })).toBe(true);
    expect(isAdResolution("1080p", "seedance-2.5", { admin: true })).toBe(true);
    expect(adResolutionsFor("seedance-2.5", { admin: true })).toContain("1080p");
  });
});

describe("라우트가 실제로 그렇게 동작한다 — HTTP 로 잰다", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProfile({
      id: U, email: "admin@fix-up.kr", status: "approved", role: "admin", tier: "basic",
    });
  });

  it("★ 등급이 basic 인 관리자가 2.5·1080p·30초로 만든다", async () => {
    const res = await createAd(
      post("admin", { model: "seedance-2.5", seconds: 30, resolution: "1080p" })
    );
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.settings.model).toBe("seedance-2.5");
    expect(doc.settings.resolution).toBe("1080p");
    expect(doc.settings.seconds).toBe(30);
  });

  it("같은 등급의 **손님**은 2.5 에서 403 — 문이 관리자에게만 열렸다", async () => {
    const res = await createAd(post("user", { model: "seedance-2.5", seconds: 15 }));
    expect(res.status).toBe(403);
  });

  // ⚠️ 2026-09-01 — **막히는 자리가 앞당겨졌다.** 그전에는 모델은 통과하고 해상도에서
  //   400 이었는데, 이제 2.5 가 **은퇴**라 손님은 모델 단계에서 403 이다.
  it("손님은 은퇴한 2.5 를 아예 못 만든다 — 해상도까지 가지도 않는다", async () => {
    await memoryStore.insertProfile({
      id: U, email: "pro@fix-up.kr", status: "approved", role: "user", tier: "pro",
    });
    const res = await createAd(post("user", { model: "seedance-2.5", seconds: 15, resolution: "1080p" }));
    expect(res.status).toBe(403);
  });

  it("관리자도 모르는 모델은 400 — 값이 나간 뒤에 fal 이 404 를 내는 것보다 낫다", async () => {
    const res = await createAd(post("admin", { model: "seedance-9.9" }));
    expect(res.status).toBe(400);
  });
});
