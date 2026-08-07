// 공개 경로는 보안 경계다 — 늘어나는 것을 테스트가 알아채야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PUBLIC_PATHS, isPublicPath, ADMIN_PATHS, isAdminPath } from "../lib/auth/paths.js";

describe("공개 경로", () => {
  it("셋뿐이다", () => {
    expect([...PUBLIC_PATHS].sort()).toEqual(
      ["/api/auth/login", "/api/auth/signup", "/login"].sort()
    );
  });

  it("매직링크 콜백은 더 이상 공개가 아니다", () => {
    expect(isPublicPath("/auth/callback")).toBe(false);
  });

  it("접두어만 겹치는 경로가 공개로 새지 않는다", () => {
    expect(isPublicPath("/login-debug")).toBe(false);
    expect(isPublicPath("/api/auth/login-as-admin")).toBe(false);
  });

  it("보호된 경로는 그대로 보호된다", () => {
    expect(isPublicPath("/create")).toBe(false);
    expect(isPublicPath("/api/projects")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
  });

  it("콜백 라우트 파일이 저장소에 없다", () => {
    let exists = true;
    try { readFileSync("app/auth/callback/route.js"); } catch { exists = false; }
    expect(exists).toBe(false);
  });
});

// 운영자 경로도 보안 경계다 — 여기 없는 화면은 middleware 가 안 막는다.
describe("운영자 전용 경로", () => {
  it("둘뿐이다 — 원장(/costs)과 백오피스(/admin)", () => {
    expect([...ADMIN_PATHS].sort()).toEqual(["/admin", "/costs"].sort());
  });

  it("운영자 화면과 그 하위 경로를 맞힌다", () => {
    expect(isAdminPath("/costs")).toBe(true);
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/users/abc")).toBe(true);
  });

  it("접두어만 겹치는 경로가 운영자 경로로 새지 않는다", () => {
    expect(isAdminPath("/costsomething")).toBe(false);
    expect(isAdminPath("/admins")).toBe(false);
    expect(isAdminPath("/admin-debug")).toBe(false);
  });

  it("사장님 화면은 운영자 경로가 아니다", () => {
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/create")).toBe(false);
    expect(isAdminPath("/archive")).toBe(false);
    expect(isAdminPath("/me")).toBe(false);
  });

  it("API 는 목록에 없다 — 라우트의 adminOnly 가 403 으로 답한다", () => {
    expect(isAdminPath("/api/costs")).toBe(false);
    expect(isAdminPath("/api/admin/users")).toBe(false);
  });

  it("운영자 경로가 공개 경로와 겹치지 않는다", () => {
    for (const p of ADMIN_PATHS) expect(isPublicPath(p)).toBe(false);
  });
});
