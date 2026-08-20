import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// 주석은 판정이 아니다 — 코드에서만 찾는다(오늘 이 저장소에서 주석을 재는 거짓 통과를
// 세 번 밟았다: 옷차림 규칙 창 둘, film 레이아웃 하나).
const code = (p) => readFileSync(p, "utf8").replace(/\/\/[^\n]*/g, "");

// ★★★ **등급은 서버가 판정한다**(2026-08-20).
//
// 2.5 는 지금까지 `hidden: true` 로 숨겨져 있었는데 그것은 **화면에서만** 거르는 것이라
// (app/ads/new/page.js 의 filter) 서버의 isAdModel 은 그대로 true 였다 — API 를 직접
// 두드리면 만들어졌다. 즉 잠금이 아니라 가림막이었다.
//
// 이 저장소가 같은 자리에서 이미 배운 것이 있다(lib/ad/pipeline.js 의 주석):
//   "화면 잠금은 한 벌뿐이라 샌다(탭 둘·새로고침 실패·직접 호출). 그리고 새면 돈이
//    두 번 나간다. 그래서 지켜져야 하는 것을 서버가 판정한다."
// 2.5 는 원가가 2.0 의 3배 이상이다(15초 720p ≈ $6.93) — 새면 그만큼이 나간다.
describe("등급 문은 서버에 있다", () => {
  it("★ 광고를 만들 때 서버가 등급을 본다", () => {
    const src = code("app/api/ads/route.js");
    expect(src).toMatch(/tierAllowsModel|modelsForTier/);
  });

  it("★ 굽기에서도 다시 본다 — 만든 뒤 문서를 고쳐 값을 치를 길을 안 남긴다", () => {
    const src = code("app/api/ads/[id]/render/route.js");
    expect(src).toMatch(/tierAllowsModel|modelsForTier/);
  });

  it("★ 판정은 lib/tiers 하나다 — 라우트가 모델 id 를 손으로 적으면 표와 갈린다", () => {
    for (const p of ["app/api/ads/route.js", "app/api/ads/[id]/render/route.js"]) {
      expect(code(p), p).not.toMatch(/["']seedance-2\.5["']/);
    }
  });
});

// ★ 등급이 실제로 저장되는 자리 — 컬럼이 없으면 운영자가 올려 줘도 다음 요청에 사라진다.
describe("등급이 저장되고 읽힌다", () => {
  it("★ 스키마에 tier 컬럼이 있다", () => {
    const sql = readFileSync("db/schema.sql", "utf8");
    expect(sql).toMatch(/alter table profiles add column if not exists tier/);
  });

  it("★ 기본값이 코드의 기본 등급과 같다 — 갈리면 DB 는 pro 인데 코드는 basic 으로 읽는다", () => {
    const sql = readFileSync("db/schema.sql", "utf8");
    expect(sql).toMatch(/tier[\s\S]{0,60}default 'basic'/);
  });

  it("★ 프로필을 읽는 두 자리가 tier 를 함께 가져온다 — 한쪽만 빠지면 그 화면만 basic 으로 보인다", () => {
    const src = readFileSync("lib/store/supabase.js", "utf8");
    // listProfiles(관리자 목록) · findProfiles(개별 조회) 둘 다 열을 손으로 적는다.
    const selects = [...src.matchAll(/\.from\("profiles"\)\s*\.select\(([^)]*)\)/g)].map((m) => m[1]);
    expect(selects.length).toBeGreaterThanOrEqual(2);
    for (const s of selects) expect(s, `select 에 tier 가 없다: ${s}`).toMatch(/tier/);
  });
});

// ★ 운영자가 올려 주는 자리. status·role 과 같은 문에서 받되, **이중 쓰기는 안 늘린다**.
describe("운영자가 등급을 바꾼다", () => {
  const src = () => code("app/api/admin/users/[id]/route.js");

  it("★ PATCH 가 tier 를 받는다", () => {
    expect(src()).toMatch(/\btier\b/);
  });

  it("★ 모르는 등급은 400 — 조용히 받으면 아무 문자열이나 컬럼에 들어간다", () => {
    expect(src()).toMatch(/isTier/);
  });

  // ★★ status·role 은 app_metadata 에도 쓴다(middleware 가 매 요청 읽는 게이트 캐시다).
  //   tier 는 게이트가 아니라 **라우트가 필요할 때 읽는 값**이라 원장(profiles)에만 둔다 —
  //   display_name 이 같은 판단으로 그 자리에 있다(db/schema.sql 의 그 주석).
  //   거기 두면 이중 쓰기를 지켜야 하는 자리가 하나 더 는다.
  it("★ tier 를 app_metadata 에 쓰지 않는다 — 이중 쓰기를 늘리지 않는다", () => {
    const s = src();
    const at = s.indexOf("app_metadata");
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, at + 200)).not.toMatch(/\btier\b/);
  });
});
