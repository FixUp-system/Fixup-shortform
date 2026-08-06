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

// 시각 규칙은 실측에서 왔다(2026-08-06 네이버·구글). 값이 흔들리면 근거가 사라지므로
// 숫자를 그대로 못 박는다 — 바꾸려면 스펙과 이 테스트를 함께 고쳐야 한다.
const css = readFileSync("app/globals.css", "utf8");

describe("로그인 화면 시각", () => {
  it("로그인 전용 클래스가 CSS 에 있다", () => {
    for (const cls of [".login-card", ".login-tabs", ".login-tab", ".sent-input--lg", ".cta--block"]) {
      expect(css).toContain(cls);
    }
  });

  it("입력칸이 실측값(52px)만큼 크다", () => {
    const block = css.slice(css.indexOf(".sent-input--lg"));
    expect(block).toMatch(/min-height:\s*52px/);
  });

  it("주버튼이 실측값(48px)이고 폭을 채운다", () => {
    const block = css.slice(css.indexOf(".cta--block"));
    expect(block).toMatch(/width:\s*100%/);
    expect(block).toMatch(/min-height:\s*48px/);
  });

  it("상자가 420px 로 좁다", () => {
    const block = css.slice(css.indexOf(".login-card"));
    expect(block).toMatch(/max-width:\s*420px/);
  });

  it("기존 .sent-input 기본형을 키우지 않았다 — 브리핑·StylePicker 가 쓴다", () => {
    const base = css.match(/\n\.sent-input \{[^}]*\}/);
    expect(base).toBeTruthy();
    expect(base[0]).not.toMatch(/min-height/);
  });
});
