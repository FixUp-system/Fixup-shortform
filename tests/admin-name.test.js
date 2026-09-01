// **운영자가 붙이는 이름** (2026-09-01 사장님 지시:
// "admin은 사용자 관리에서 따로 이름을 부여할 수 있게 … 사용자가 지정한 이름말고",
// "열 하나 더 추가해서 관리자 페이지에서만 해당 이름으로 확인할 수 있게 —
//  지금 내부용으로 계정을 지급했는데 이름이 fixup1 이런식이여서 누군지 나도 헷갈려").
//
// ★★★ 축이 **둘**이다. 뭉치면 안 된다:
//   · `display_name` — **사용자 본인**이 마이페이지에서 고친다. 화면 곳곳에 뜨는 이름이다.
//   · `admin_name`   — **운영자**가 붙인다. `fixup1@test.com` 이 누구 계정인지 적는 자리다.
//   앞엣것을 운영자가 덮어쓰면 사용자 화면의 이름이 남의 손에 바뀐다 — 그래서 칸을 나눈다.
//
// ★★ **관리자 페이지에서만 보인다**(사장님 지시). 그래서 GET /api/me 는 이 값을 안 싣는다 —
//   싣는 순간 사용자 자신이 "운영자가 나를 뭐라고 적었는지" 를 보게 된다.
// ★ 비용 기록의 사용자 칸도 안 바꾼다 — 거기는 displayNameOf 하나를 본다(lib/costs.js).
//   요청은 "관리자 페이지에서만" 이었다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const schema = readFileSync("db/schema.sql", "utf8");
const store = readFileSync("lib/store/supabase.js", "utf8");
const route = strip(readFileSync("app/api/admin/users/[id]/route.js", "utf8"));
const meRoute = strip(readFileSync("app/api/me/route.js", "utf8"));
const page = strip(readFileSync("app/admin/page.js", "utf8"));

describe("자리를 만든다", () => {
  it("★★★ profiles 에 칸이 있다 — display_name 과 **다른 칸**이다", () => {
    expect(schema, "마이그레이션이 없다").toMatch(/add column if not exists admin_name/);
    expect(schema, "display_name 을 없애면 안 된다").toMatch(/add column if not exists display_name/);
  });

  it("★★★ 목록이 그 칸을 판다 — 안 파면 화면이 영원히 빈 칸이다", () => {
    const at = store.indexOf("async listProfiles()");
    expect(at).toBeGreaterThan(-1);
    expect(store.slice(at, at + 600)).toMatch(/admin_name/);
  });
});

describe("운영자만 쓰고, 운영자만 본다", () => {
  it("★★★ PATCH 가 그 값을 받는다", () => {
    expect(route).toMatch(/admin_name/);
  });

  it("★★★ **사용자에게는 안 나간다** — /api/me 가 안 싣는다", () => {
    expect(meRoute, "본인이 자기에 대한 운영자 메모를 보게 된다").not.toMatch(/admin_name/);
  });

  it("★★ 사용자가 스스로 고치는 길이 없다 — 마이페이지는 자기 이름만 바꾼다", () => {
    // PATCH /api/me 는 화이트리스트로 name 하나만 뽑는다(그 라우트의 규약).
    expect(meRoute).toMatch(/body\?\.name/);
    expect(meRoute).not.toMatch(/admin_name/);
  });

  // ★ 숫자를 그 자리에 박지 않고 이름 있는 상수로 두는 편이 낫다 — 그래서 둘 다 인정한다.
  it("★★ 길이 상한이 있다 — 표 한 칸에 들어가야 한다", () => {
    expect(route, "상한이 없다 — 긴 이름이 들어오면 표가 밀린다")
      .toMatch(/ADMIN_NAME_MAX\s*=\s*\d+/);
    expect(route).toMatch(/slice\(0,\s*(ADMIN_NAME_MAX|\d+)\)/);
  });

  it("★ 비우면 지운다 — 빈 글자를 남기면 '이름이 있다' 로 읽힌다", () => {
    const at = route.indexOf("admin_name");
    expect(route.slice(Math.max(0, at - 600), at + 600)).toMatch(/null/);
  });
});

describe("화면 — 열 하나가 는다", () => {
  it("★★★ 표에 그 열이 있다", () => {
    expect(page).toMatch(/운영자 이름/);
  });

  it("★★ 그 자리에서 바로 고친다 — 별도 화면으로 보내지 않는다", () => {
    expect(page).toMatch(/setAdminName\(/);
    expect(page, "등급·역할과 같은 문(PATCH)을 안 쓴다")
      .toMatch(/JSON\.stringify\(\{ admin_name/);
  });

  it("★ 사용자 본인 이름 칸은 그대로 남는다 — 둘을 나란히 봐야 누군지 안다", () => {
    expect(page).toMatch(/displayNameOf\(u\)/);
  });

  it("★★ 찾기가 그 이름으로도 걸린다 — 누군지 적어 두고 못 찾으면 뜻이 없다", () => {
    const at = page.indexOf("toLowerCase().includes(q)");
    expect(page.slice(Math.max(0, at - 400), at + 200)).toMatch(/admin_name/);
  });
});
