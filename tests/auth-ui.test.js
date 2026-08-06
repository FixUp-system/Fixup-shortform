// 화면 배선을 소스에서 판정한다(staleness-ui·credits-ui 와 같은 패턴).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const login = strip(readFileSync("app/login/page.js", "utf8"));

describe("로그인 화면", () => {
  it("매직링크를 더 이상 부르지 않는다", () => {
    expect(login).not.toMatch(/signInWithOtp/);
    expect(login).not.toMatch(/auth\/callback/);
  });
  it("두 라우트를 부른다", () => {
    expect(login).toMatch(/\/api\/auth\/login/);
    expect(login).toMatch(/\/api\/auth\/signup/);
  });
  it("비밀번호 입력이 있다", () => {
    expect(login).toMatch(/type="password"/);
  });
  it("가입 탭이 승인 대기를 미리 알린다", () => {
    expect(login).toMatch(/승인/);
  });
  it("비밀번호를 화면 상태 밖으로 흘리지 않는다 — 링크·쿼리에 싣지 않는다", () => {
    expect(login).not.toMatch(/password=\$\{/);
  });
});
