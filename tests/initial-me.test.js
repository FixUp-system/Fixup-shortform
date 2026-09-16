// lib/auth/initial-me.js — 레이아웃이 헤더에서 첫 페인트용 신원 힌트를 뽑는 순수 함수.
// 사이드바 [내 계정]·[운영] 이 GET /api/me 가 돌아오기 전에도 옳게 그려지려면
// 이 판정이 middleware 의 헤더와 정확히 같은 답을 내야 한다.
import { describe, it, expect } from "vitest";
import { meInitialFromHeaders } from "../lib/auth/initial-me.js";
import { USER_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const headerList = (map) => ({ get: (k) => map[k] ?? null });

describe("meInitialFromHeaders", () => {
  it("신원 헤더가 없으면 손님이다 — 헤더가 비었을 때 fail-closed", () => {
    expect(meInitialFromHeaders(headerList({}))).toEqual({ guest: true, isAdmin: false });
  });

  it("신원이 있고 role 이 admin 이면 운영자다", () => {
    const h = headerList({ [USER_HEADER]: "u1", [ROLE_HEADER]: "admin" });
    expect(meInitialFromHeaders(h)).toEqual({ guest: false, isAdmin: true });
  });

  it("신원은 있지만 role 이 admin 이 아니면 운영자가 아니다", () => {
    const h = headerList({ [USER_HEADER]: "u1", [ROLE_HEADER]: "user" });
    expect(meInitialFromHeaders(h)).toEqual({ guest: false, isAdmin: false });
  });

  it("role 헤더가 비어 있어도(빈 문자열) 운영자가 아니다 — 모르는 값은 안전한 쪽", () => {
    const h = headerList({ [USER_HEADER]: "u1", [ROLE_HEADER]: "" });
    expect(meInitialFromHeaders(h)).toEqual({ guest: false, isAdmin: false });
  });

  it("신원 헤더가 빈 문자열이면 손님이다 — 값이 있어야 로그인한 것이다", () => {
    const h = headerList({ [USER_HEADER]: "", [ROLE_HEADER]: "admin" });
    expect(meInitialFromHeaders(h)).toEqual({ guest: true, isAdmin: false });
  });
});
