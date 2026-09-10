// fal 웹훅 문 — **신호로만 쓴다** (2026-09-10 사장님 지시: "크론 요청을 동적으로").
//
// ★★★ 왜 크론이 아니라 웹훅인가. 이 계정은 Hobby 라 1분 크론이 **배포 자체를 거부한다**
//   (09-10 실측). 웹훅은 플랜과 무관하고, 게다가 크론보다 낫다 —
//     크론  "혹시 끝났나"를 1분마다 묻는다 (대부분 헛걸음)
//     웹훅  fal 이 "끝났다"고 우리를 부른다 (정확히 그때 · 헛걸음 0)
//
// ★★★ 그리고 크론이 **못 고치는 구멍**을 하나 막는다. 접수는 됐는데 문서에 접수증을
//   적기 전에 함수가 죽으면, fal 엔 영상이 있고 우리는 그 요청이 있었는지조차 모른다.
//   fal 에 요청 목록 API 가 없으니(09-10 실측) 영영 못 찾는다 — 크론도 못 찾는다(찾을
//   접수증이 없다). 웹훅 주소에 projectId 를 실어 두면 fal 이 그것을 들고 우리를 부른다.
//
// ★★ **페이로드를 믿지 않는다.** 이 문이 하는 일은 "그 편을 지금 걷어라"는 방아쇠뿐이고,
//   무엇이 끝났는지는 이미 있는 수거가 fal 에 **다시 물어** 확인한다. 그래서 서명이
//   뚫려도 할 수 있는 일이 "이미 우리 것인 편을 한 번 더 걷게 하는 것"뿐이다(돈 0원).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const routePath = "app/api/fal/webhook/route.js";
const src = readFileSync(routePath, "utf8");

// 서명 검증은 이미 tests/fal-webhook-verify.test.js 가 잰다 — 여기서는 **문의 태도**만 본다.
const swept = [];
vi.mock("../lib/fal-webhook.js", () => ({
  verifyFalWebhook: async ({ headers }) => headers.get("x-test-ok") === "1",
}));
vi.mock("../lib/collect-sweep.js", () => ({
  sweepBakingProjects: async () => ({ swept: 0 }),
  sweepOneProject: async (id) => { swept.push(id); return { swept: 1, collected: 1 }; },
}));

const post = async (url, ok) => {
  const { POST } = await import("../app/api/fal/webhook/route.js");
  return POST(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(ok ? { "x-test-ok": "1" } : {}) },
    body: JSON.stringify({ request_id: "r1", status: "OK" }),
  }));
};

const URL_OK = "http://x/api/fal/webhook?p=11111111-1111-4111-8111-111111111111";

describe("fal 웹훅 문 — 서명이 자물쇠다", () => {
  beforeEach(() => { swept.length = 0; });

  it("★★★ 서명이 아니면 **401 이고 아무것도 안 걷는다**", async () => {
    const res = await post(URL_OK, false);
    expect(res.status).toBe(401);
    expect(swept, "서명도 없이 걷었다").toEqual([]);
  });

  it("★★★ 서명이 맞으면 **그 편만** 걷는다", async () => {
    const res = await post(URL_OK, true);
    expect(res.status).toBe(200);
    expect(swept).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("★★★ 가리키는 편이 없어도 **2xx** 다 — 재시도를 부르지 않는다", async () => {
    // fal 은 2xx 가 아니면 **최대 31번** 다시 보낸다. 우리가 할 일이 없는 요청에
    // 4xx/5xx 를 주면 그 재시도가 전부 헛걸음이 된다.
    const res = await post("http://x/api/fal/webhook", true);
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(swept).toEqual([]);
  });
});

describe("fal 웹훅 문 — 형태", () => {
  it("★★★ **POST 만** 받는다 — 웹훅은 POST 다", () => {
    expect(src, "GET 을 연다").not.toMatch(/export\s+(async\s+)?function\s+GET|export\s+const\s+GET/);
    expect(src).toMatch(/export\s+async\s+function\s+POST/);
  });

  it("★★★ 로그인 벽 **밖**에 있다 — 3xx 는 fal 이 영구 실패로 본다", async () => {
    const { isPublicPath, PUBLIC_PATHS } = await import("../lib/auth/paths.js");
    expect(isPublicPath("/api/fal/webhook"), "307 로 튕겨 영영 재시도가 없어진다").toBe(true);
    // ★ 접두사로 열지 않는다 — 앞으로 만드는 fal 문이 검사 없이 공개가 된다.
    expect(PUBLIC_PATHS, "경로를 접두사로 열었다").not.toContain("/api/fal");
    expect(isPublicPath("/api/fal/anything-else"), "다음 문까지 열렸다").toBe(false);
  });

  it("★★ 본문을 **받은 그대로** 검증에 넘긴다 — 파싱하면 해시가 달라진다", () => {
    // JSON 으로 파싱했다 다시 문자열로 만들면 공백 하나에 SHA-256 이 달라져 전부 거부된다.
    expect(src, "req.text() 로 원문을 안 읽는다").toMatch(/await\s+req\.text\(\)/);
    const upto = src.slice(0, src.indexOf("verifyFalWebhook("));
    expect(upto, "검증 전에 JSON.parse 를 한다").not.toMatch(/JSON\.parse|req\.json\(\)/);
  });
});
