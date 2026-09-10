// fal 웹훅 서명 검증 — **열린 문을 지키는 유일한 자물쇠다** (2026-09-10).
//
// ★★★ 왜 이 문이 열려 있어야 하나. fal 은 우리 서버를 **로그인 없이** 부른다. 그리고
//   fal 문서가 못 박는다: *"Redirects are not followed. If your endpoint responds with a
//   3xx status code, the delivery is treated as a permanent failure and is not retried."*
//   우리 middleware 는 미인증 요청을 **307 로 /login 에 튕긴다** — 그러니 이 경로를
//   PUBLIC_PATHS 에 넣지 않으면 **한 번 튕기고 영영 재시도가 없다**(09-10 에 표지 정적
//   파일이 같은 자리에서 307 을 맞았다).
//
// ★★ 그래서 자물쇠가 서명뿐이다. fal 은 ED25519 로 서명하고 공개키는 JWKS 로 준다.
//   검증할 메시지는 **줄바꿈으로 이어 붙인 넷**이다(문서 그대로):
//     request-id · user-id · timestamp · **본문의 SHA-256 을 16진수로**
//
// ★ 그리고 이 문은 **페이로드를 믿지 않는다**(라우트 쪽 규율). 여기서 하는 일은
//   "fal 이 정말 보냈나"만 가리는 것이고, 무엇이 끝났는지는 우리가 fal 에 다시 묻는다.
import { describe, it, expect } from "vitest";
import { createHash, generateKeyPairSync, sign as edSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyFalWebhook } from "../lib/fal-webhook.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwk = publicKey.export({ format: "jwk" });

const REQ = "req-1";
const USER = "user-1";
const NOW = 1_700_000_000; // 초

function signed(body, { ts = NOW, key = privateKey } = {}) {
  const msg = [REQ, USER, String(ts), createHash("sha256").update(body).digest("hex")].join("\n");
  return edSign(null, Buffer.from(msg, "utf8"), key).toString("hex");
}

const headersFor = (body, opts = {}) =>
  new Headers({
    "x-fal-webhook-request-id": REQ,
    "x-fal-webhook-user-id": USER,
    "x-fal-webhook-timestamp": String(opts.ts ?? NOW),
    "x-fal-webhook-signature": opts.sig ?? signed(body, opts),
  });

// JWKS 를 흉내 낸다 — 진짜 fal 에 나가지 않는다(판은 회선을 안 쓴다).
const jwksFetch = (keys = [jwk]) => async () => ({ ok: true, json: async () => ({ keys }) });

const call = (body, opts = {}, deps = {}) =>
  verifyFalWebhook({
    headers: headersFor(body, opts),
    body,
    now: () => (opts.nowMs ?? NOW * 1000),
    fetchImpl: deps.fetchImpl || jwksFetch(),
    cache: deps.cache || {},
  });

describe("fal 웹훅 — 진짜 fal 이 보낸 것만 통과한다", () => {
  it("★★★ 올바른 서명은 통과한다", async () => {
    expect(await call('{"status":"OK"}')).toBe(true);
  });

  it("★★★ 본문이 **한 글자라도** 다르면 거부한다", async () => {
    const body = '{"status":"OK"}';
    const sig = signed(body);
    // 서명은 그대로 두고 본문만 바꾼다 — 중간에서 내용을 바꿔치기하는 그 모양이다.
    const res = await verifyFalWebhook({
      headers: headersFor(body, { sig }),
      body: '{"status":"ERROR"}',
      now: () => NOW * 1000,
      fetchImpl: jwksFetch(),
      cache: {},
    });
    expect(res).toBe(false);
  });

  it("★★★ 다른 키로 서명한 것은 거부한다", async () => {
    const other = generateKeyPairSync("ed25519").privateKey;
    expect(await call('{"a":1}', { key: other })).toBe(false);
  });

  it("★★ 헤더가 하나라도 빠지면 거부한다 — 모르면 닫는다", async () => {
    for (const drop of [
      "x-fal-webhook-request-id",
      "x-fal-webhook-user-id",
      "x-fal-webhook-timestamp",
      "x-fal-webhook-signature",
    ]) {
      const body = '{"a":1}';
      const h = headersFor(body);
      h.delete(drop);
      const res = await verifyFalWebhook({
        headers: h, body, now: () => NOW * 1000, fetchImpl: jwksFetch(), cache: {},
      });
      expect(res, `${drop} 없이 통과했다`).toBe(false);
    }
  });
});

describe("fal 웹훅 — 오래된 것은 안 받는다 (재생 공격)", () => {
  it("★★★ ±5분을 넘으면 거부한다", async () => {
    // 문서 권고: "Allow a leeway of ±5 minutes (300 seconds)".
    expect(await call('{"a":1}', { nowMs: (NOW + 301) * 1000 }), "6분 지난 것을 받았다").toBe(false);
    expect(await call('{"a":1}', { nowMs: (NOW - 301) * 1000 }), "미래 것을 받았다").toBe(false);
  });

  it("★★ 5분 안쪽은 통과한다 — 시계 차이와 회선 지연이 있다", async () => {
    expect(await call('{"a":1}', { nowMs: (NOW + 299) * 1000 })).toBe(true);
  });
});

describe("fal 웹훅 — 모르면 닫는다", () => {
  it("★★★ JWKS 를 못 받으면 **거부한다** — 열리는 쪽으로 안 떨어진다", async () => {
    const dead = async () => ({ ok: false, status: 500, json: async () => ({}) });
    expect(await call('{"a":1}', {}, { fetchImpl: dead })).toBe(false);
  });

  it("★★ 키가 여러 개면 **하나만 맞아도** 통과한다 — fal 이 키를 돌린다", async () => {
    const other = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" });
    expect(await call('{"a":1}', {}, { fetchImpl: jwksFetch([other, jwk]) })).toBe(true);
  });

  it("★★ JWKS 를 **한 번만** 받아 온다 — 웹훅마다 받으면 그것이 곧 지연이다", async () => {
    let hits = 0;
    const counting = async () => { hits += 1; return { ok: true, json: async () => ({ keys: [jwk] }) }; };
    const cache = {};
    await call('{"a":1}', {}, { fetchImpl: counting, cache });
    await call('{"b":2}', {}, { fetchImpl: counting, cache });
    expect(hits, "JWKS 를 두 번 받았다").toBe(1);
  });
});

describe("fal 웹훅 주소 — 접수할 때 실어 보낸다", () => {
  it("★★★ 프로덕션 주소를 모르면 **안 붙인다** — 로컬 주소를 주면 fal 이 31번 헛걸음한다", async () => {
    const { falWebhookUrl } = await import("../lib/fal-webhook.js");
    expect(falWebhookUrl("p1", { base: "" }), "주소도 모르면서 붙였다").toBe(null);
    expect(falWebhookUrl("", { base: "https://x.app" }), "가리킬 편도 없이 붙였다").toBe(null);
  });

  it("★★★ **어느 편인지**를 주소에 싣는다 — 이것이 접수증 유실을 막는 유일한 단서다", async () => {
    const { falWebhookUrl } = await import("../lib/fal-webhook.js");
    const u = falWebhookUrl("11111111-1111-4111-8111-111111111111", { base: "https://x.app" });
    expect(u).toBe("https://x.app/api/fal/webhook?p=11111111-1111-4111-8111-111111111111");
  });

  it("★★ 끝 슬래시가 겹치지 않는다", async () => {
    const { falWebhookUrl } = await import("../lib/fal-webhook.js");
    expect(falWebhookUrl("p1", { base: "https://x.app/" })).toBe("https://x.app/api/fal/webhook?p=p1");
  });
});

describe("접수 — 큐 주소에 웹훅을 건다", () => {
  it("★★★ reel 통짜 접수가 웹훅을 실어 보낸다", () => {
    const src = readFileSync("lib/i2v.js", "utf8");
    expect(src, "웹훅 주소를 안 만든다").toMatch(/falWebhookUrl/);
    expect(src, "큐 주소에 fal_webhook 을 안 붙인다").toMatch(/fal_webhook/);
  });
});
