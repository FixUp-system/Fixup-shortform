// 비밀번호 규칙이 **한 자리**에 산다 (2026-09-11).
//
// ★★★ 이 판이 생긴 이유. 같은 수(6)가 네 곳에 손으로 적혀 있었다 —
//   운영자 재설정 라우트 · 내 비밀번호 라우트 · 가입 라우트의 문구 · 관리자 화면의 문구.
//   게다가 한쪽 주석이 **"운영자 재설정 라우트와 같은 값"** 이라고 적고 있었다:
//   주석이 "같은 값"이라고 말해야 한다는 것 자체가 두 벌이라는 증거다.
//   CLAUDE.md 의 「값이 사는 곳 — 두 벌이면 갈린다」 표에 걸리는 자리다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PASSWORD_MIN, passwordProblem } from "../lib/password.js";

const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.(js|jsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("비밀번호 규칙 — 값이 한 자리에 산다", () => {
  it("★★★ 최소 길이를 손으로 적은 자리가 없다", () => {
    const offenders = [];
    for (const p of [...walk("app"), ...walk("lib")]) {
      if (p.replace(/\\/g, "/").endsWith("lib/password.js")) continue;   // 여기가 그 한 자리다
      const src = strip(readFileSync(p, "utf8"));
      if (/MIN_LENGTH\s*=/.test(src)) offenders.push(`${p}: MIN_LENGTH 를 또 정의한다`);
      // "6자 이상" · "8자 이상" 처럼 **수를 글자로 박은** 문구
      for (const m of src.matchAll(/["'`][^"'`]*\d+자 이상[^"'`]*["'`]/g)) {
        offenders.push(`${p}: ${m[0].slice(0, 40)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("★★ 규칙을 쓰는 자리 넷이 전부 그 모듈을 가져온다", () => {
    const users = [
      "app/api/auth/signup/route.js",
      "app/api/me/password/route.js",
      "app/api/admin/users/[id]/password/route.js",
      "app/login/page.js",
    ];
    for (const p of users) {
      expect(readFileSync(p, "utf8"), `${p} 가 규칙을 안 가져온다`).toMatch(
        /from\s+["'][^"']*lib\/password(\.js)?["']/
      );
    }
  });

  it("★★★ 라우트가 **Supabase 앞에서** 막는다 — 화면 검사는 예의일 뿐이다", () => {
    const signup = strip(readFileSync("app/api/auth/signup/route.js", "utf8"));
    const gate = signup.search(/passwordProblem\(password\)/);
    const call = signup.search(/auth\.signUp\(/);
    expect(gate, "비밀번호 게이트가 없다").toBeGreaterThan(-1);
    expect(call, "signUp 호출이 없다").toBeGreaterThan(-1);
    expect(gate, "게이트가 signUp 뒤에 있다 — 짧은 비밀번호가 Supabase 까지 간다").toBeLessThan(call);
  });
});

describe("passwordProblem — 무엇이 잘못됐는지 말한다", () => {
  it("짧으면 길이를 말한다", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN - 1))).toContain(`${PASSWORD_MIN}자`);
  });

  it("길이가 되면 통과한다", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN))).toBe("");
  });

  it("★ 확인 값은 **넘길 때만** 잰다 — 라우트는 그 칸을 안 받는다", () => {
    const pw = "a".repeat(PASSWORD_MIN);
    expect(passwordProblem(pw), "인자 하나로 불렀는데 확인까지 쟀다").toBe("");
    expect(passwordProblem(pw, "different"), "서로 다른데 통과시킨다").not.toBe("");
    expect(passwordProblem(pw, pw)).toBe("");
  });

  it("★ 빈 확인 값도 다르면 걸린다 — undefined 와 빈 문자열을 가른다", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN), "")).not.toBe("");
  });
});
