// 공개 경로는 보안 경계다 — 늘어나는 것을 테스트가 알아채야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PUBLIC_PATHS, isPublicPath } from "../lib/auth/paths.js";

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
