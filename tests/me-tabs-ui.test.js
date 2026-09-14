// 마이페이지 — [내 정보 | 크레딧] 탭(2026-09-14 사장님 지시).
// "크레딧 보유 450/1000 이런 식으로 간단하게 내 정보에서 보고, 탭으로 크레딧 등록 및 사용 내역을 확인".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (t) => t.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const src = strip(readFileSync("app/me/page.js", "utf8"));

describe("마이페이지 — 탭", () => {
  it("[내 정보 | 크레딧] 세그먼트로 갈아 끼운다", () => {
    expect(src).toMatch(/aria-label="마이페이지"/);
    expect(src).toMatch(/aria-pressed=\{tab === "info"\}/);
    expect(src).toMatch(/aria-pressed=\{tab === "credits"\}/);
  });

  it("주소로 크레딧 탭을 연다(?tab=credits) — useSearchParams 없이(정적 화면이라 Suspense 가 필요해진다)", () => {
    expect(src).toMatch(/URLSearchParams\(window\.location\.search\)/);
    expect(src).toMatch(/"credits"/);
    expect(src).not.toMatch(/useSearchParams/);
  });

  it("내 정보 탭에 보유/총 충전 한 줄과 크레딧 탭으로 가는 버튼이 있다", () => {
    const info = src.slice(src.indexOf('tab === "info" && ('), src.indexOf('tab === "credits" && ('));
    expect(info).toMatch(/formatCredits\(sums\.balance\)\} \/ \{formatCredits\(sums\.granted\)/);
    expect(info).toMatch(/크레딧 관리/);
    expect(info).toMatch(/내부 계정/);
  });

  it("크레딧 탭 — 요약 카드(보유·총 충전·사용) · 코드 등록 · 내역 [전체 | 충전 | 사용]", () => {
    const credits = src.slice(src.indexOf('tab === "credits" && ('));
    expect(credits).toMatch(/className="cost-summary"/);
    for (const label of ["보유", "총 충전", "사용"]) expect(credits).toMatch(new RegExp(`<small>${label}</small>`));
    expect(credits).toMatch(/<CreditCodeForm/);
    expect(credits).toMatch(/aria-label="내역"/);
    expect(credits).toMatch(/freeNote/);
  });

  it("좁히기는 서버에 맡긴다 — 받은 쪽만 거르면 20줄 안에서만 걸러진다", () => {
    expect(src).toMatch(/params\.set\("source", source\)/);
    expect(src).toMatch(/\/api\/credits\/history\$\{q\}/);
  });
});

// 2026-09-14 사장님 요청 — 크레딧 내역 날짜 좁히기 · 내 정보 줄의 버튼 정렬 · "차감 안 함" 문구가 무슨 뜻인지 모르겠다.
describe("마이페이지 — 날짜 좁히기 · 버튼 정렬 · 문구", () => {
  const credits = src.slice(src.indexOf('tab === "credits" && ('));
  const info = src.slice(src.indexOf('tab === "info" && ('), src.indexOf('tab === "credits" && ('));

  it("크레딧 내역을 날짜로 좁힌다 — 경계는 브라우저가 dayBounds 로 만들어 ms 로 보낸다", () => {
    expect(credits.match(/type="date"/g)).toHaveLength(2);
    expect(credits).toMatch(/<small>시작일<\/small>/);
    expect(credits).toMatch(/<small>종료일<\/small>/);
    expect(src).toMatch(/dayBounds\(/);
    expect(src).toMatch(/params\.set\("from_ts"/);
    expect(src).toMatch(/params\.set\("to_ts"/);
  });

  it("내 정보 줄은 한 틀(.me-info) — 값 칸 폭이 같아 버튼이 한 세로선에 선다", () => {
    expect(info).toMatch(/className="panel me-panel me-info"/);
    // 비밀번호 줄에도 값 칸이 있다(버튼이 라벨에 붙어 떠 있지 않게)
    expect(info).toMatch(/비밀번호[\s\S]{0,200}className="me-value"/);
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.me-info \.me-value \{[^}]*width:\s*380px/);
    expect(css).toMatch(/\.me-info > \.me-row \{[^}]*min-height/);
  });

  it("'차감 안 함' 대신 무엇이 왜 안 줄어드는지 말한다 — 내부 계정과 전체 스위치를 가른다", () => {
    expect(src).not.toMatch(/차감 안 함/);
    expect(src).toMatch(/me\?\.internal/);
    expect(src).toMatch(/내부 계정/);
    expect(src).toMatch(/써도 줄지 않아요/);
  });
});
