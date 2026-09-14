// 크레딧 코드 — 화면 계약(소스 판). 설계: docs/superpowers/specs/2026-09-14-credit-codes-design.md
// ⚠️ 소스 문자열 판은 문법 오류를 못 잡는다 — 화면을 고쳤으면 `npx next build` 로 한 번 굽는다(CLAUDE.md).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("등록 입력칸(components/CreditCodeForm.jsx)", () => {
  const src = strip(read("components/CreditCodeForm.jsx"));
  it("등록 라우트를 부르고 결과 문구를 보여 준다", () => {
    expect(src).toMatch(/fetch\("\/api\/credits\/redeem"/);
    expect(src).toMatch(/크레딧이 들어왔어요/);
    expect(src).toMatch(/승인되면 바로 쓰실 수 있어요/);
  });
  it("서버의 오류 문구를 그대로 보여 준다 — 없음·이미 씀을 뭉개지 않는다", () => {
    expect(src).toMatch(/\.error/);
  });
});

describe("승인 대기·마이페이지가 입력칸을 쓴다", () => {
  it("/pending", () => {
    const src = strip(read("app/pending/page.js"));
    expect(src).toMatch(/<CreditCodeForm[^>]*pending/);
  });
  it("/me — 크레딧 내역 절 안에서, 등록 뒤 잔액·내역을 다시 읽는다", () => {
    const src = strip(read("app/me/page.js"));
    const at = src.indexOf("<CreditCodeForm");
    expect(at).toBeGreaterThan(src.indexOf("크레딧 내역"));
    expect(src.slice(at, at + 200)).toMatch(/onRedeemed=\{[^}]*load\(\)/);
  });
});

describe("운영자 화면(/admin/codes)", () => {
  const path = "app/admin/codes/page.js";
  it("있다 — 운영자 경로 아래라 middleware 역할 게이트가 덮는다", () => {
    expect(existsSync(path)).toBe(true);
  });
  const src = existsSync(path) ? strip(read(path)) : "";
  it("발급·목록·삭제·승인 라우트를 부른다", () => {
    expect(src).toMatch(/fetch\("\/api\/admin\/codes"/);
    expect(src).toMatch(/\/api\/admin\/codes\/\$\{/);
    expect(src).toMatch(/\/api\/admin\/users\/\$\{[^}]+\}`/);
    expect(src).toMatch(/status: "approved"/);
  });
  it("붙여 넣기를 파싱하고 CSV 를 만든다 — 규칙은 lib 한 벌", () => {
    expect(src).toMatch(/parsePasted\(/);
    expect(src).toMatch(/toCsv\(/);
    expect(src).toMatch(/formatCode\(/);
  });
  // ★ 개인정보 — 와디즈 명단에는 이름·연락처·배송지가 있다. DB 에는 식별 열과 리워드만 남기고,
  //   메일 머지용 전체 행 CSV 는 붙여 넣은 원본으로 브라우저에서만 만든다(서버로 안 보낸다).
  it("서버에 붙여 넣은 행을 통째로 보내지 않는다", () => {
    expect(src).not.toMatch(/meta:\s*r\s*[,}]/);
    expect(src).toMatch(/keepCol/);
  });
  // ★ 비용 기록(/costs)과 같은 구성(2026-09-14 사장님 지시) — 카드 안의 좁히기 줄 · 요약 타일 · 표.
  it("비용 기록과 같은 틀을 쓴다 — 카드 줄·요약 타일", () => {
    expect(src.match(/className="panel cost-filters"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/className="cost-summary"/);
    expect(src).toMatch(/className="cost-tile"/);
    expect(src).not.toMatch(/me-form|me-row|me-label|tier-pick/);
  });
  it("지우기는 확인을 받는다", () => {
    expect(src).toMatch(/await confirm\(/);
  });
  it("폴링 루프를 직접 돌리지 않는다", () => {
    expect(src).not.toMatch(/setInterval/);
  });
});

describe("사이드바 — 크레딧 코드로 가는 길", () => {
  const sidebar = read("components/Sidebar.jsx");
  it("운영자에게만 보인다", () => {
    const at = sidebar.indexOf('href="/admin/codes"');
    expect(at).toBeGreaterThan(0);
    const before = sidebar.slice(0, at);
    expect(before.lastIndexOf("{isAdmin && (")).toBeGreaterThan(before.lastIndexOf("</Link>"));
  });
});
