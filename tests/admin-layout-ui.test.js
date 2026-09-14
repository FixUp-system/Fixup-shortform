// 운영자 화면의 구성 한 벌 — 비용 기록(/costs)과 같은 틀(카드 줄 · 요약 타일 · 표). 2026-09-14 사장님 지시:
// "사용자 관리 페이지도 같은 방식으로" · "크레딧 코드 안에서 탭을 나눠 코드 생성과 현황을 볼 수 있게".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("사용자 관리(/admin) — 비용 기록과 같은 구성", () => {
  const src = strip(readFileSync("app/admin/page.js", "utf8"));

  it("찾기 줄이 카드 안에 있고, 작은 라벨 위 · 칸 아래다", () => {
    expect(src).toMatch(/className="panel cost-filters"/);
    expect(src).toMatch(/<small>찾기<\/small>/);
    expect(src).not.toMatch(/admin-tools/);
  });

  // 2026-09-14 사장님 요청 — 가입일 기간으로 좁힌다. 날짜 규칙은 비용 기록과 같은 한 벌(inDayRange).
  it("가입일 기간으로 좁힌다 — 시작일·종료일 · 규칙은 lib 한 벌", () => {
    expect(src).toMatch(/<small>시작일<\/small>/);
    expect(src).toMatch(/<small>종료일<\/small>/);
    expect(src.match(/type="date"/g)).toHaveLength(2);
    expect(src).toMatch(/inDayRange\(u\.created_at, from, to\)/);
  });

  it("상태로 좁힌다 — 세그먼트(aria-pressed)", () => {
    expect(src).toMatch(/aria-label="상태"/);
    // ★ 이름이 statusFilter 인 이유: 이 화면에는 이미 승인·차단을 쓰는 setStatus(id, status) 가 있다.
    expect(src).toMatch(/aria-pressed=\{statusFilter === /);
  });

  it("요약 타일이 있다 — 전체·승인 대기·승인됨·차단됨", () => {
    expect(src).toMatch(/className="cost-summary"/);
    for (const label of ["전체", "승인 대기", "승인됨", "차단됨"]) {
      expect(src).toMatch(new RegExp(`<small>${label}</small>`));
    }
  });
});

describe("크레딧 코드(/admin/codes) — 탭", () => {
  const src = strip(readFileSync("app/admin/codes/page.js", "utf8"));

  // 2026-09-14 사장님 지적 — 묶음 드롭다운이 브라우저 기본 모양이었다. 이제 드롭다운은 앱 전체가
  // components/Select.jsx 한 벌이다(tests/select-unified-ui.test.js 가 전체를 잰다).
  it("드롭다운 셋(리워드 열·식별 열·묶음)이 공용 Select 를 쓴다", () => {
    expect((src.match(/<Select\b/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("[코드 만들기 | 현황] 세그먼트로 갈아 끼운다", () => {
    expect(src).toMatch(/aria-label="보기"/);
    expect(src).toMatch(/aria-pressed=\{tab === "create"\}/);
    expect(src).toMatch(/aria-pressed=\{tab === "status"\}/);
  });

  it("만들기 카드와 현황(좁히기·타일·표)은 각자의 탭에서만 그린다", () => {
    const create = src.indexOf('tab === "create" && (');
    const status = src.indexOf('tab === "status" && (');
    expect(create).toBeGreaterThan(0);
    expect(status).toBeGreaterThan(0);
    expect(src.indexOf("코드 만들기", create)).toBeGreaterThan(create);
    expect(src.indexOf('className="cost-summary"')).toBeGreaterThan(status);
  });
});
