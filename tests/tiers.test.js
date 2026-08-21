import { describe, it, expect } from "vitest";
import { TIERS, DEFAULT_TIER, isTier, tierOf, modelsForTier, tierAllowsModel } from "../lib/tiers.js";
import { AD_MODELS } from "../lib/ad/models.js";

describe("등급 표", () => {
  it("★ 등급은 둘이다 — basic·pro", () => {
    expect(TIERS.map((t) => t.id)).toEqual(["basic", "pro"]);
  });

  it("★ 표는 못 바꾼다 — 호출부가 늘리면 화면이 여는 문과 서버가 닫는 문이 갈린다", () => {
    expect(Object.isFrozen(TIERS)).toBe(true);
    expect(() => TIERS.push({ id: "hack" })).toThrow();
  });

  it("★ 기본은 basic 이다 — 새로 가입한 사람은 좁은 쪽에서 시작한다", () => {
    expect(DEFAULT_TIER).toBe("basic");
  });

  // ★ 표의 모델 id 가 실제 모델 표와 어긋나면, 등급은 있는데 고를 수 있는 것이 없거나
  //   없는 모델을 열어 주게 된다. 두 표를 여기서 대조한다(lib/pricing.js 와 같은 규율).
  it("★ 등급이 가리키는 모델이 전부 실제로 있다", () => {
    const known = new Set(AD_MODELS.map((m) => m.id));
    for (const t of TIERS) for (const id of t.models) expect(known, `${t.id} → ${id}`).toContain(id);
  });
});

describe("모르는 값은 좁은 쪽으로 떨어진다", () => {
  // ★★ lib/fake.js 가 "모르는 값은 진짜(돈이 나감)로 본다"로 안전한 쪽을 고르는 것과 같은
  //   규율이다. 여기서 안전한 쪽은 **덜 열어 주는 쪽**이다 — 잘못 열면 원가가 3배인 모델로
  //   값이 나가고, 잘못 닫으면 사장님이 관리자 화면에서 올려 주면 된다.
  it("★ 티어가 없으면 basic 이다 — 컬럼이 생기기 전 만들어진 계정", () => {
    expect(tierOf({ email: "a@b.c" })).toBe("basic");
    expect(tierOf(null)).toBe("basic");
  });

  it("★ 모르는 티어 값도 basic 이다", () => {
    expect(tierOf({ tier: "enterprise" })).toBe("basic");
    expect(tierOf({ tier: "" })).toBe("basic");
  });

  it("아는 값은 그대로 돌려준다", () => {
    expect(tierOf({ tier: "pro" })).toBe("pro");
  });

  it("isTier 는 표에 있는 것만 참이다", () => {
    expect(isTier("basic")).toBe(true);
    expect(isTier("pro")).toBe(true);
    expect(isTier("nope")).toBe(false);
  });
});

describe("등급이 쓸 수 있는 모델", () => {
  it("★ 기본 등급은 2.0 만 쓴다", () => {
    // ★ 2026-08-21 — H3 가 기본 등급에 들어왔다. 등급의 근거는 원가이고 H3 는 그 축에서
    //   가장 싸다(15초 2K $1.95 < 2.0 720p $4.55) — 좁힐 이유가 없다.
    expect(modelsForTier("basic").map((m) => m.id)).toEqual(["seedance-2.0", "minimax-h3"]);
  });

  it("★ 프로 등급은 2.5 도 쓴다", () => {
    expect(modelsForTier("pro").map((m) => m.id)).toContain("seedance-2.5");
  });

  it("★ 모르는 등급은 기본 등급과 같다 — 조용히 열어 주지 않는다", () => {
    expect(modelsForTier("nope").map((m) => m.id)).toEqual(["seedance-2.0", "minimax-h3"]);
  });

  it("★ 돌려주는 것은 모델 표의 원소다 — 화면이 label·hint 를 그대로 쓴다", () => {
    for (const m of modelsForTier("pro")) {
      expect(m).toHaveProperty("label");
      expect(m).toHaveProperty("endpoints");
    }
  });
});

describe("이 등급이 이 모델을 써도 되는가 — 서버가 보는 판정", () => {
  it("★ 기본 등급은 2.5 를 못 쓴다", () => {
    expect(tierAllowsModel("basic", "seedance-2.5")).toBe(false);
  });

  it("★ 프로 등급은 쓴다", () => {
    expect(tierAllowsModel("pro", "seedance-2.5")).toBe(true);
  });

  it("둘 다 2.0 은 쓴다", () => {
    expect(tierAllowsModel("basic", "seedance-2.0")).toBe(true);
    expect(tierAllowsModel("pro", "seedance-2.0")).toBe(true);
  });

  it("★ 모르는 모델은 어느 등급도 못 쓴다 — 판정이 통과시키면 값이 나간 뒤에 404 다", () => {
    expect(tierAllowsModel("pro", "seedance-9.9")).toBe(false);
  });
});

// ★★ hidden 과 등급은 **다른 축**이다(2026-08-20).
//   · hidden — **아무도** 못 쓴다(표에는 남는다: 옛 문서가 안 깨지게).
//   · 등급   — **누가** 쓸 수 있나.
//   2.5 는 지금까지 hidden 으로 전부 숨겨져 있었는데, 그것은 화면에서만 거르는 것이라
//   서버는 그대로 받고 있었다(isAdModel 이 true). 이제 등급이 판정한다.
describe("2.5 는 숨김이 아니라 등급으로 다룬다", () => {
  const m25 = AD_MODELS.find((m) => m.id === "seedance-2.5");

  it("★ 2.5 는 더 이상 숨김이 아니다 — 숨겨 두면 프로 등급도 못 고른다", () => {
    expect(m25.hidden).toBeFalsy();
  });

  it("★ 그래도 기본 등급에는 안 보인다 — 등급이 그 자리를 대신한다", () => {
    expect(modelsForTier("basic").some((m) => m.id === "seedance-2.5")).toBe(false);
  });
});
