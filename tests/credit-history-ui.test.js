// 마이페이지의 크레딧 내역 — 화면 계약.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync("app/me/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("마이페이지 — 크레딧 내역", () => {
  it("내역을 읽어 온다", () => {
    expect(src).toMatch(/\/api\/credits\/history/);
  });

  // 말과 부호 규칙은 lib 하나가 쥔다 — 화면이 다시 적으면 언젠가 갈린다.
  it("말·부호를 lib 에서 가져온다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/ledger["']/);
    expect(src).toMatch(/ledgerLabel/);
  });

  // 지운 영상의 내역은 장부에 남는다(환불하지 않으므로) — 제목이 없다고 빈칸이면
  // 사장님은 "무엇에 썼는지 모르는 줄"을 보게 된다.
  it("지운 영상도 무엇이었는지 말해 준다", () => {
    expect(src).toContain("지운 영상");
  });

  // 크레딧이 는 줄과 준 줄을 눈으로 갈라야 한다. 색은 토큰만 쓴다(디자인 시스템 규칙).
  it("는 줄과 주는 줄을 갈라 보여 준다", () => {
    expect(css).toMatch(/\.led-plus\s*\{[^}]*var\(--good\)/);
  });

  // ★ toISOString() 은 UTC 다 — 한국은 +9 라 오전에 쓴 내역이 **하루 전**으로 찍힌다
  // (08-13 08:00 KST = 08-12 23:00 UTC). 사장님은 자기 시계로 읽는다.
  it("날짜를 사장님 시계로 찍는다", () => {
    expect(src, "UTC 로 날짜를 자르고 있다").not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/);
  });

  it("아직 아무 일도 없으면 그렇게 말해 준다", () => {
    expect(src).toMatch(/아직 (쓰거나 )?충전|내역이 없어요/);
  });
});
