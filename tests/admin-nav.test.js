// 운영자가 사용자 관리로 갈 길 — 화면에 없으면 주소를 외워야 한다.
//
// 실제로 그랬다(2026-08-13 사용자 지적): /admin 은 사용자 목록·크레딧 넣기·승인·차단·
// 비밀번호 재설정·크레딧 내역을 다 하는데, 사이드바에는 링크가 없어 주소를 직접 쳐야
// 들어갈 수 있었다. 운영자 전용 링크는 /costs 하나뿐이었다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const sidebar = readFileSync("components/Sidebar.jsx", "utf8");
const admin = readFileSync("app/admin/page.js", "utf8");

describe("사이드바 — 사용자 관리", () => {
  it("운영자에게 사용자 관리로 가는 길이 있다", () => {
    expect(sidebar).toMatch(/href="\/admin"/);
  });

  // ★ fail-closed 여야 한다 — 못 읽었으면 숨긴다. isAdmin 게이트 안에 있어야 한다.
  it("운영자에게만 보인다", () => {
    const at = sidebar.indexOf('href="/admin"');
    const before = sidebar.slice(0, at);
    expect(before.lastIndexOf("{isAdmin && (")).toBeGreaterThan(before.lastIndexOf("</Link>") - 400);
  });

  // 아이콘은 유니코드 글리프가 아니라 Icon 컴포넌트다(design-system 규칙과 같은 자).
  it("아이콘을 글자로 찍지 않는다", () => {
    const at = sidebar.indexOf('href="/admin"');
    expect(sidebar.slice(at, at + 260)).toMatch(/<Icon name=/);
  });

  // 이 화면은 승인만 하는 자리가 아니다 — 크레딧을 넣고, 막고, 내역을 본다.
  it("화면 이름이 하는 일과 맞는다", () => {
    expect(admin).toMatch(/사용자 관리/);
  });
});

// 목록에 가입일이 없으면 "언제 들어온 사람인지"를 알 수 없다 — 승인 대기가 쌓였을 때
// 먼저 볼 줄을 고르는 근거다(2026-08-13 사용자 요청).
describe("사용자 관리 — 가입일", () => {
  it("표에 가입일 열이 있다", () => {
    expect(admin).toMatch(/가입일/);
  });

  // 마이페이지·크레딧 내역과 같은 규칙 — toISOString 은 UTC 라 한국에서 하루가 밀린다.
  it("사장님 시계로 찍는다", () => {
    expect(admin, "UTC 로 날짜를 자르고 있다").not.toMatch(/created_at[^;]*slice\(0, ?10\)/);
    expect(admin).toMatch(/ymd\(/);
  });
});
