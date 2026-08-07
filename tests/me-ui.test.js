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

  // 2026-08-07 사용자 요청으로 "바꿀 수 없어요" 문구를 뺐다. 원래 근거는 "빈 입력칸을
  // 두면 눌러 보게 된다"였는데, 이메일은 애초에 입력칸이 아니라 읽기 전용 텍스트라
  // 누를 것이 없다 — 근거가 실물과 안 맞았다. 대신 **입력칸이 되지 않았는지**를 문다.
  it("이메일은 읽기 전용이다 — 입력칸으로 두지 않는다", () => {
    expect(me).toMatch(/me-value mono/);
    expect(me).not.toMatch(/value=\{[^}]*email/);
  });

  it("보관함으로 잇는다 — 흡수하지 않는다", () => {
    expect(me).toMatch(/\/archive/);
  });

  it("이름 상한을 손으로 적지 않고 가격표처럼 한 곳에서 가져온다", () => {
    expect(me).toMatch(/NAME_MAX/);
  });

  // ★ 아직 못 읽었으면 name 이 "" 다. 그대로 PATCH 하면 라우트가 display_name 을 null 로
  // 덮어 **저장돼 있던 이름이 지워진다**. 버튼을 막는 것만으로는 부족하다 — 응답이 오기 전에
  // 누르는 정상 경로도 같은 결과라 저장 함수 초입에서도 막아야 한다.
  it("내 정보를 못 읽었으면 이름을 저장하지 않는다", () => {
    // 저장 함수가 me 없이는 일찍 돌아간다
    expect(me).toMatch(/if\s*\(!me\)\s*\{[\s\S]{0,200}?return;/);
    // 버튼도 함께 막힌다
    expect(me).toMatch(/disabled=\{[^}]*!me[^}]*\}/);
  });

  it("정보를 못 읽으면 그 사실을 알리고 다시 시도할 길을 준다", () => {
    expect(me).toMatch(/loadErr/);
    expect(me).toMatch(/읽지 못했어요/);
    expect(me).toMatch(/다시 불러오기/);
  });

  // ★ 안내문이 "모든 기기에서 로그아웃된다"고 약속한다. 서버가 세션 끊기에 실패하면
  // (signedOut=false) 침입자 세션이 살아남는데, 화면이 "바꿨어요"만 띄우면 사장님은
  // 쫓아냈다고 믿는다 — 비밀번호를 바꾼 이유 자체가 조용히 실패하는 자리다.
  it("세션을 못 끊었으면 그 사실과 다음에 할 일을 알린다", () => {
    expect(me).toMatch(/끊지 못했어요/);
    expect(me).toMatch(/직접 로그아웃/);
  });

  it("로그인 화면으로 보내는 타이머를 언마운트 때 정리한다", () => {
    expect(me).toMatch(/clearTimeout/);
  });
});
