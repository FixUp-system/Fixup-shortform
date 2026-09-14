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
    expect(info).toMatch(/차감 안 함/);
  });

  it("크레딧 탭 — 요약 카드(보유·총 충전·사용) · 코드 등록 · 내역 [전체 | 충전 | 사용]", () => {
    const credits = src.slice(src.indexOf('tab === "credits" && ('));
    expect(credits).toMatch(/className="cost-summary"/);
    for (const label of ["보유", "총 충전", "사용"]) expect(credits).toMatch(new RegExp(`<small>${label}</small>`));
    expect(credits).toMatch(/<CreditCodeForm/);
    expect(credits).toMatch(/aria-label="내역"/);
    expect(credits).toMatch(/크레딧이 차감되지 않아요/);
  });

  it("좁히기는 서버에 맡긴다 — 받은 쪽만 거르면 20줄 안에서만 걸러진다", () => {
    expect(src).toMatch(/params\.set\("source", source\)/);
    expect(src).toMatch(/\/api\/credits\/history\$\{q\}/);
  });
});
