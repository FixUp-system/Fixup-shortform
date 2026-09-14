// 로그인 뒤 **원래 가려던 자리로 되돌린다** (2026-09-14 사장님 지적).
//
// 그전에는 이랬다: 손님이 랜딩에서 [시작하기]를 누른다 → `/login` → 로그인 성공 →
// `router.replace("/")` → 루트가 `/home` 으로 보낸다 → **첫 화면**이다. 만들러 가려고
// 로그인까지 마친 사람이 버튼을 **한 번 더** 눌러야 했다. 주소창에 `/ads/new` 를 직접
// 친 경우도 같았다 — middleware 가 튕길 때 원래 주소를 안 실었다.
//
// ★★ 되돌릴 자리는 **주소창에서 온다**. 그래서 이 판의 절반은 보안이다:
//   그 값을 검사 없이 쓰면 우리 로그인 화면이 남의 사이트로 보내는 문이 된다(open redirect).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { safeNext } from "../lib/auth/paths.js";

const mw = readFileSync("middleware.js", "utf8");
const login = readFileSync("app/login/page.js", "utf8");
const home = readFileSync("app/home/page.js", "utf8");

describe("safeNext — 돌아갈 자리는 **우리 안**이어야 한다", () => {
  it("우리 경로는 그대로 통과한다(쿼리·조각까지)", () => {
    expect(safeNext("/ads/new")).toBe("/ads/new");
    expect(safeNext("/archive/abc123?tab=done")).toBe("/archive/abc123?tab=done");
    expect(safeNext("/reel/abc123#top")).toBe("/reel/abc123#top");
  });

  it("★★★ 바깥으로 나가는 모양은 전부 막는다 — open redirect", () => {
    for (const evil of [
      "https://evil.example/login",   // 스킴
      "http://evil.example",
      "//evil.example",               // 프로토콜 상대 — 브라우저는 **다른 호스트**로 읽는다
      "/\\evil.example",              // 백슬래시도 같은 취급을 받는 브라우저가 있다
      "javascript:alert(1)",
      "evil.example",                 // 슬래시로 시작하지 않는다
    ]) {
      expect(safeNext(evil), `${evil} 가 통과했다`).toBe("");
    }
  });

  it("★★ 제어문자가 섞이면 막는다 — 헤더를 쪼개는 옛 수법", () => {
    expect(safeNext("/ads/new\nLocation: https://evil.example")).toBe("");
    expect(safeNext("/ads/new\r\n")).toBe("");
  });

  it("★★ 로그인 화면으로는 안 돌려보낸다 — 고리가 된다", () => {
    expect(safeNext("/login")).toBe("");
    expect(safeNext("/login?next=/login")).toBe("");
    expect(safeNext("/login/extra")).toBe("");
    // 이름만 겹치는 다른 화면은 막지 않는다(세그먼트로 자른다).
    expect(safeNext("/login-help")).toBe("/login-help");
  });

  it("값이 없거나 이상하면 **빈 문자열**이다 — 부르는 쪽이 자기 기본값으로 간다", () => {
    expect(safeNext(null)).toBe("");
    expect(safeNext(undefined)).toBe("");
    expect(safeNext("")).toBe("");
    expect(safeNext(42)).toBe("");
  });
});

describe("배선 — 세 자리가 같은 함수를 쓴다", () => {
  it("★★★ middleware 가 튕길 때 **원래 주소를 싣는다**", () => {
    expect(mw, "safeNext 를 안 쓴다 — 주소창 값을 그대로 실으면 안 된다").toMatch(/safeNext\(/);
    expect(mw, "next 파라미터를 안 싣는다").toMatch(/searchParams\.set\("next",/);
    // ★ 원래 쿼리는 next 안에 통째로 들어간다 — 바깥 쿼리를 안 비우면 /login 주소에
    //   남의 파라미터가 그대로 붙어 다닌다.
    expect(mw, "바깥 쿼리를 안 비운다").toMatch(/to\.search\s*=\s*""/);
  });

  it("★★★ 로그인 화면이 그 자리로 되돌린다", () => {
    expect(login, "safeNext 를 안 쓴다").toMatch(/safeNext\(/);
    expect(login, "next 를 안 읽는다").toMatch(/get\("next"\)/);
    expect(login, "여전히 무조건 첫 화면으로 간다").not.toMatch(/router\.replace\("\/"\)/);
    expect(login, "돌아갈 자리가 없을 때의 기본값이 없다").toMatch(/router\.replace\([\w]+\s*\|\|\s*"\/"\)/);
  });

  it("★★ 랜딩의 손님 버튼이 **돌아올 자리를 실어서** 보낸다", () => {
    // 버튼이 둘이다(위 껍데기 · 아래 마무리). 둘 다 같은 문이어야 한다.
    const doors = [...home.matchAll(/href=\{signedIn \? "\/ads\/new" : "([^"]+)"\}/g)].map((m) => m[1]);
    expect(doors.length, "신원으로 갈리는 문이 둘이 아니다").toBe(2);
    for (const d of doors) {
      expect(d, "손님 문에 돌아올 자리가 없다").toBe("/login?next=/ads/new");
    }
    // 그리고 그 값은 위 safeNext 를 통과하는 값이어야 한다(안 그러면 조용히 버려진다).
    expect(safeNext("/ads/new")).toBe("/ads/new");
  });
});
