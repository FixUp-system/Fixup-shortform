// 화면 배선을 소스에서 판정한다(이 저장소에 React 렌더 테스트가 없다 —
// credits-ui.test.js·staleness-ui.test.js 와 같은 방식).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const me = strip(readFileSync("app/me/page.js", "utf8"));

describe("마이페이지", () => {
  it("서버에서 내 정보를 읽는다", () => {
    expect(me).toMatch(/\/api\/me/);
  });

  it("이름을 PATCH 로 저장한다", () => {
    expect(me).toMatch(/method:\s*["']PATCH["']/);
  });

  it("비밀번호 변경에 **현재 비밀번호** 칸이 있다", () => {
    expect(me).toMatch(/current/);
    expect(me).toMatch(/현재 비밀번호/);
  });

  it("새 비밀번호를 두 번 받아 화면에서 먼저 맞춰 본다", () => {
    expect(me).toMatch(/confirm/);
  });

  // ★ 라우트가 비밀번호를 바꾸면서 **지금 브라우저 세션까지 끊는다**(scope: global).
  // 화면이 signedOut 을 안 읽으면 사장님은 "비밀번호를 바꿨어요"를 본 직후 아무 안내 없이
  // 로그인 화면으로 튕긴다 — 무슨 일이 났는지 알 방법이 없다.
  it("세션이 끊겼으면 다시 로그인해야 한다고 알리고 로그인 화면으로 보낸다", () => {
    expect(me).toMatch(/signedOut/);
    expect(me).toMatch(/다시 로그인/);
    expect(me).toMatch(/\/login/);
  });

  it("이메일은 바꿀 수 없다고 알린다 — 빈 입력칸을 두면 눌러 보게 된다", () => {
    expect(me).toMatch(/바꿀 수 없어요/);
  });

  it("보관함으로 잇는다 — 흡수하지 않는다", () => {
    expect(me).toMatch(/\/archive/);
  });

  it("이름 상한을 손으로 적지 않고 가격표처럼 한 곳에서 가져온다", () => {
    expect(me).toMatch(/NAME_MAX/);
  });
});
