// 가입할 때 **이름을 함께 받는다** (2026-09-10 사장님 지시).
//
// ★★★ 스키마는 안 건드린다 — `profiles.display_name` 이 **이미 있다**(2026-08-07 에
//   마이페이지가 쓰려고 만들었다). 그래서 이 변경에는 마이그레이션이 없고,
//   "스키마를 라이브에 먼저 올려라"는 규칙(CLAUDE.md)에 걸리지 않는다.
//
// ★★ 이름을 **auth 메타데이터로 안 보낸다.** `signUp({ options: { data } })` 로 넘기면
//   그 값을 읽어 profiles 에 옮기는 일은 **DB 트리거**(handle_new_user)가 해야 하고,
//   그러면 스키마 변경 + 배포 순서 규칙이 딸려 온다. 지금은 트리거가 `(id, email)` 만
//   넣고, 이름은 **가입 라우트가 그 뒤에 채운다**. 고칠 자리가 하나뿐이다.
//
// ★★ 이름을 못 채워도 **가입은 성공한다.** 계정은 이미 만들어졌고 세션도 섰는데 여기서
//   500 을 주면, 사장님은 "가입 실패"로 읽고 다시 시도하다 "이미 가입된 이메일"을 만난다.
//   이름은 마이페이지에서 언제든 고칠 수 있다 — 막을 이유가 없다.
//   (이 저장소의 규율과 같다: 업로드 라우트도 "작은 판 저장에 실패해도 응답은 나간다".)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/auth/signup/route.js", "utf8");
const ui = readFileSync("app/login/page.js", "utf8");

describe("가입 — 이름을 함께 받는다", () => {
  it("★★★ 화면이 이름 칸을 낸다 — 그리고 가입할 때만 낸다", () => {
    // 로그인 탭에도 이름 칸이 뜨면 "로그인에 이름이 필요한가" 하고 멈칫한다.
    expect(ui, "이름 칸이 없다").toMatch(/aria-label="이름"/);
    expect(ui, "이름 칸이 가입일 때만 뜨지 않는다").toMatch(/isSignup\s*&&[\s\S]{0,400}aria-label="이름"/);
  });

  it("★★ 화면이 이름을 실어 보낸다 — 칸만 있고 안 보내면 조용히 버려진다", () => {
    expect(ui, "이름 상태가 없다").toMatch(/\[\s*name,\s*setName\s*\]/);
    // ★ **가입 몸통에만** 싣는지까지 잰다. 처음엔 `JSON.stringify({…name…})` 으로만 쟀는데
    //   그 모양은 "로그인 몸통에도 이름을 넣는" 구현까지 통과시킨다 — 라우트가 안 읽는
    //   값이 섞이면 다음 사람이 "로그인도 이름을 보나" 하고 헷갈린다. 갈래를 잰다.
    expect(ui, "가입 몸통에 이름을 안 싣는다").toMatch(/isSignup\s*\?\s*\{[^}]*\bname\b[^}]*\}/);
  });

  it("★★★ 라우트가 이름을 받아 프로필에 적는다", () => {
    expect(route, "이름을 안 읽는다").toMatch(/body\??\.\s*name/);
    expect(route, "프로필에 안 적는다").toMatch(/updateProfile\(/);
    expect(route, "display_name 으로 안 적는다").toMatch(/display_name/);
  });

  it("★★★ 이름을 못 적어도 가입은 성공한다 — 계정은 이미 만들어졌다", () => {
    // 이름 쓰기를 **막지 않는 자리**에 둔다: 실패해도 아래 200 이 그대로 나가야 한다.
    // 그래서 그 호출은 catch 를 달고 있어야 한다(던지면 500 이 된다).
    expect(route, "이름 쓰기가 실패하면 가입이 통째로 실패한다").toMatch(
      /updateProfile\([\s\S]{0,200}?\.catch\(/
    );
  });

  it("★★ 같은 길이 규칙을 쓴다 — 두 벌이면 한쪽이 낡는다", () => {
    // 마이페이지(PATCH /api/me)가 이미 NAME_MAX 로 자른다. 가입에서 손으로 20 을 적으면
    // 나중에 한쪽만 바뀐다 — 이 저장소가 반복해 겪은 "값이 두 벌" 사고다(CLAUDE.md).
    expect(route, "길이 상한을 손으로 적었다").toMatch(/NAME_MAX/);
    expect(route, "NAME_MAX 를 안 가져온다").toMatch(/from\s+["'][^"']*display-name[^"']*["']/);
  });

  it("★ 이름은 **선택**이다 — 없어도 가입을 막지 않는다", () => {
    // 이메일·비밀번호만 400 으로 막는다. 이름까지 필수로 만들면 가입 문턱이 올라가고,
    // 화면(required)과 라우트(400)가 갈리면 그 자리가 조용한 실패가 된다.
    expect(route, "이름이 없다고 막는다").not.toMatch(
      /!name[\s\S]{0,80}status:\s*400|!email\s*\|\|\s*!password\s*\|\|\s*!name/
    );
    expect(ui, "이름 칸을 필수로 만들었다").not.toMatch(/aria-label="이름"[\s\S]{0,200}required/);
  });
});
