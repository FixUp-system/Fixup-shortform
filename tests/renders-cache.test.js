// 완성본 302 의 캐시 — 전송(egress)을 무는 자리 (2026-09-10).
//
// ★ 왜 생겼나. 2026-09-07 에 Supabase 무료 전송량(5GB/월)을 다 써서 프로젝트가 402 로
//   통째로 막혔다 — 영상을 보는 행위가 **로그인까지** 죽였다. 그래서 이 저장소에서
//   전송량은 성능이 아니라 **가용성** 문제다.
//
// 그날 서명 주소 재사용(lib/signed-url-cache.js)이 들어갔는데, 문 앞이 그대로였다:
//   · 302 응답이 `private, no-store` 라 브라우저가 **볼 때마다** 이 문을 다시 두드린다.
//     `<video>` 는 되감기·이어보기마다 다시 물으므로 그 횟수가 재생 한 번에 여러 번이다.
//   · 서버리스라 표는 **함수 인스턴스마다** 산다 — 찬 인스턴스에 닿으면 주소가 달라지고,
//     그 순간 브라우저에 이미 받아 둔 3~13MB 가 통째로 헛것이 된다.
//
// 이 판이 못 박는 것 둘:
//   ① 302 가 캐시된다 — 다시 안 물으면 바이트가 아예 안 나간다.
//   ② 그 캐시 수명이 **서명 수명보다 짧다** — 만료된 주소를 물고 있으면 영상이 안 열린다.
//      이 항목의 유일한 위험이 그것이라 여유까지 잰다.
//
// ⚠️ 소스를 문자열로 재는 판이라 **주석을 먼저 걷는다.** 안 걷으면 설명 주석에 인용된
//   코드 조각이 판정을 통과시킨다(이 저장소에서 실제로 밟았다).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { cachedSignedUrl, resetSignedUrlCache } from "../lib/signed-url-cache.js";
import { memoryStore } from "../lib/store/memory.js";
import { createProject, updateProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET as RENDER_GET } from "../app/api/renders/[name]/route.js";

const strip = (src) =>
  src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const routeSrc = strip(readFileSync("app/api/renders/[name]/route.js", "utf8"));

// 서명 수명은 라우트가 정한다. 판이 숫자를 손으로 적으면 두 벌이 되어 갈린다 —
// 소스에서 읽어 그 값으로 잰다.
const SIGNED_URL_SECONDS = (() => {
  const m = /SIGNED_URL_SECONDS\s*=\s*([0-9*+\s]+);/.exec(routeSrc);
  if (!m) throw new Error("라우트에서 SIGNED_URL_SECONDS 를 못 찾았다");
  return Number(new Function(`return ${m[1]}`)());
})();

const A = "00000000-0000-4000-8000-0000000000aa";
const headers = () =>
  new Headers({ [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" });
const ctx = (v) => ({ params: Promise.resolve(v) });

// ── ① 문 앞: 302 가 캐시되는가 ──────────────────────────────────────────────
describe("완성본 302 — 브라우저가 다시 안 묻게 한다", () => {
  it("★★ 302 에 no-store 를 달지 않는다 — 그러면 볼 때마다 이 문을 다시 두드린다", () => {
    expect(routeSrc).not.toMatch(/private,\s*no-store/);
  });

  it("★ 302 의 Cache-Control 이 max-age 를 싣는다", () => {
    expect(routeSrc).toMatch(/private,\s*max-age=/);
  });

  it("★ 공유 캐시(CDN·프록시)에는 안 남긴다 — 서명 주소는 그 자체가 열쇠다", () => {
    expect(routeSrc).not.toMatch(/Cache-Control["']?\s*:\s*[`"']public/);
  });
});

// ── ② 만료 여유: 이 항목의 유일한 위험 ──────────────────────────────────────
describe("캐시 수명 < 서명 수명", () => {
  beforeEach(() => resetSignedUrlCache());

  const ttl = SIGNED_URL_SECONDS;

  it("갓 서명한 주소도 서명 수명만큼 물려주지 않는다", async () => {
    let t = 1_000_000_000_000;
    const got = await cachedSignedUrl("k", ttl, () => `sig-${t}`, () => t);
    expect(got.url).toBe(`sig-${t}`);
    expect(got.maxAge).toBeGreaterThan(0);
    expect(got.maxAge, "브라우저가 서명보다 오래 물고 있다").toBeLessThan(ttl);
  });

  it("★★ 표가 물고 있던 낡은 주소를 줄 때도 만료 전에 놓게 한다", async () => {
    // 서버 표는 서명 하나를 수명 가까이 재사용한다(그것이 절감의 본체다). 그때 브라우저에게
    // 남은 수명보다 긴 max-age 를 주면 **만료된 주소를 물고 있는** 상태가 되고, 영상이
    // 안 열린다. 그래서 남은 수명에서 재는지를 본다.
    const t0 = 1_000_000_000_000;
    let t = t0;
    const now = () => t;
    const first = await cachedSignedUrl("k", ttl, () => `sig-${t}`, now);
    t = t0 + (ttl * 1000 - 300_000); // 만료 5분 전
    const late = await cachedSignedUrl("k", ttl, () => `sig-${t}`, now);
    expect(late.url, "표를 안 쓰고 새로 서명했다").toBe(first.url);
    expect(t + late.maxAge * 1000, "브라우저가 만료된 주소를 물게 된다")
      .toBeLessThan(t0 + ttl * 1000);
  });

  it("만료가 코앞이면 브라우저에게는 캐시를 아예 안 준다", async () => {
    const t0 = 1_000_000_000_000;
    let t = t0;
    const now = () => t;
    await cachedSignedUrl("k", ttl, () => "sig", now);
    t = t0 + (ttl * 1000 - 70_000); // 만료 70초 전 — 표는 아직 물고 있다
    const late = await cachedSignedUrl("k", ttl, () => "sig2", now);
    expect(late.maxAge).toBe(0);
  });

  it("키가 없으면(옛 문서 = 무효화할 버전을 모른다) 캐시를 안 준다", async () => {
    const got = await cachedSignedUrl(null, ttl, () => "sig");
    expect(got.url).toBe("sig");
    expect(got.maxAge, "무효화할 방법이 없는데 브라우저가 물고 있다").toBe(0);
  });

  it("같은 키는 같은 주소다 — 09-07 절감의 본체(회귀 방어)", async () => {
    let n = 0;
    const sign = () => `sig-${++n}`;
    const a = await cachedSignedUrl("k", ttl, sign);
    const b = await cachedSignedUrl("k", ttl, sign);
    expect(b.url).toBe(a.url);
    expect(n, "두 번 서명했다").toBe(1);
  });

  it("서명을 못 만들면 담지 않는다 — 실패를 캐시하면 그 자리가 수명 내내 죽는다", async () => {
    const a = await cachedSignedUrl("k", ttl, () => null);
    expect(a.url).toBeNull();
    const b = await cachedSignedUrl("k", ttl, () => "sig");
    expect(b.url).toBe("sig");
  });
});

// ── ③ 라우트를 실제로 지나게 해서 본다 ──────────────────────────────────────
describe("GET /api/renders/[name] — 302 를 실제로 받아 본다", () => {
  // 인메모리 저장소에는 서명 문이 없다(로컬 개발은 바이트를 그대로 흘린다).
  // 프로덕션 갈래를 재려면 그 문을 잠깐 달아 준다.
  let signs;
  beforeEach(() => {
    resetSignedUrlCache();
    signs = 0;
    memoryStore.signedObjectUrl = async (bucket, key) => `https://storage/${key}?token=${++signs}`;
  });
  afterEach(() => {
    delete memoryStore.signedObjectUrl;
  });

  const make = async (ts) => {
    const p = await createProject({ ownerId: A, settings: {}, material: { text: "자료", photos: [] } });
    await updateProject(p.id, A, (d) => ({
      ...d,
      render: ts ? { url: `/api/renders/${p.id}.mp4`, ts } : { url: `/api/renders/${p.id}.mp4` },
    }));
    return p.id;
  };
  const get = (id) =>
    RENDER_GET(new Request(`http://t/api/renders/${id}.mp4`, { headers: headers() }), ctx({ name: `${id}.mp4` }));

  it("★★ 302 가 캐시된다 — max-age 가 0 보다 크다", async () => {
    const res = await get(await make(1757400000000));
    expect(res.status).toBe(302);
    const cc = res.headers.get("Cache-Control");
    expect(cc).toMatch(/private/);
    expect(cc).not.toMatch(/no-store/);
    const m = /max-age=(\d+)/.exec(cc);
    expect(m, `Cache-Control 에 max-age 가 없다: ${cc}`).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThan(0);
    expect(Number(m[1]), "서명보다 오래 물린다").toBeLessThan(SIGNED_URL_SECONDS);
  });

  it("★ 각인(ts)이 없는 옛 문서는 캐시하지 않는다 — 다시 구워도 옛 영상이 남는다", async () => {
    const res = await get(await make(null));
    expect(res.status).toBe(302);
    const cc = res.headers.get("Cache-Control");
    expect(cc, "무효화할 버전을 모르는데 물려줬다").not.toMatch(/max-age=[1-9]/);
    expect(cc).toMatch(/no-cache|no-store/);
  });

  it("★ 같은 영상은 두 번째에도 같은 주소다 — 브라우저가 받아 둔 것을 그대로 쓴다", async () => {
    const id = await make(1757400000000);
    const a = await get(id);
    const b = await get(id);
    expect(b.headers.get("Location")).toBe(a.headers.get("Location"));
    expect(signs, "요청마다 새로 서명한다").toBe(1);
  });

  it("★ 다시 구우면(각인이 바뀌면) 새 주소가 나간다 — 캐시가 옛 영상을 안 붙잡는다", async () => {
    const id = await make(1757400000000);
    const a = await get(id);
    await updateProject(id, A, (d) => ({ ...d, render: { ...d.render, ts: 1757499999999 } }));
    const b = await get(id);
    expect(b.headers.get("Location")).not.toBe(a.headers.get("Location"));
  });
});

// ★★★ 2026-09-10 **라이브 실측 뒤 보탠 판.** 배포하고 나서 재 보니 주력 둘이 캐시를
//   전혀 안 타고 있었다:
//     reel → private, no-cache   (각인이 `reel.video.ts` 인데 라우트가 `render.ts` 만 봤다)
//     ad   → private, no-cache   (`videos[0]` 에 각인이 **아예 없었다**)
//   각인이 없으면 캐시를 안 거는 규칙 자체는 옳다(재굽기 때 옛 영상을 못 밀어낸다).
//   틀린 것은 **각인을 찾는 자리**였다 — 그래서 절감이 단계별·film 에만 걸렸다.
describe("각인을 찾는 자리 — 주력 둘이 빠져 있었다", () => {
  const route = readFileSync("app/api/renders/[name]/route.js", "utf8");
  const bare = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("★★★ reel 의 각인(`reel.video.ts`)을 읽는다", () => {
    expect(bare, "reel 각인을 안 본다 — 주력이 캐시를 못 탄다").toMatch(/reel\?\.video\?\.ts|reel\.video\.ts/);
  });

  it("★★★ 광고의 각인(`videos[0].ts`)을 읽는다", () => {
    expect(bare, "광고 각인을 안 본다").toMatch(/videos\?\.\[0\]\?\.ts|videos\[0\]\.ts/);
  });

  it("★★★ 광고 완성본에 각인을 **적는다** — 없으면 읽어도 소용없다", () => {
    const ad = readFileSync("lib/ad/pipeline.js", "utf8");
    const i = ad.indexOf("videos: [{");
    expect(i, "완성본을 적는 자리를 못 찾았다").toBeGreaterThan(0);
    expect(ad.slice(i, i + 200), "각인 없이 적는다 — 재굽기를 구별할 수 없다").toMatch(/\bts\b/);
  });
});
