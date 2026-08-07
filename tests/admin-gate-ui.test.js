// 비용 기록(/costs)은 전사 원장이라 운영자 전용이다 — 남의 지출과 프롬프트가 담긴다.
// 화면 배선은 소스를 읽어 판정한다(이 저장소에 React 렌더 테스트가 없다 —
// credits-ui.test.js·staleness-ui.test.js 와 같은 방식).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sidebar = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const middleware = strip(readFileSync("middleware.js", "utf8"));

describe("사이드바 — 비용 기록은 운영자에게만", () => {
  it("서버에서 운영자 여부를 읽는다 — 화면이 혼자 정하지 않는다", () => {
    expect(sidebar).toMatch(/\/api\/me/);
    expect(sidebar).toMatch(/isAdmin/);
  });

  // ★ 이 단정이 회귀 그물이다 — /costs 링크가 isAdmin 조건 밖으로 새어 나오면 잡힌다.
  it("/costs 링크가 isAdmin 조건 안에서만 그려진다", () => {
    expect(sidebar).toMatch(/\{\s*isAdmin\s*&&[\s\S]*?href="\/costs"[\s\S]*?\)\}/);
  });

  it("못 읽었을 때는 숨기는 쪽으로 떨어진다 — 기본값이 false 다", () => {
    expect(sidebar).toMatch(/useState\(false\)/);
    // isAdmin 이 참일 때만 세운다(응답이 없거나 실패하면 그대로 false).
    expect(sidebar).toMatch(/d\?\.isAdmin/);
  });
});

describe("middleware — 운영자 경로 게이트가 진짜 경계다", () => {
  it("isAdminPath 를 lib/auth/paths.js 에서 가져온다 — 목록을 복사하지 않는다", () => {
    expect(middleware).toMatch(/isAdminPath[\s\S]*?from\s+"\.\/lib\/auth\/paths\.js"/);
    expect(middleware).not.toMatch(/"\/costs"/);
  });

  it("비운영자의 화면 요청을 되돌린다 — API 는 라우트의 403 이 답한다", () => {
    expect(middleware).toMatch(/isAdminPath\(pathname\)\s*&&\s*role\s*!==\s*"admin"\s*&&\s*!isApi/);
    expect(middleware).toMatch(/NextResponse\.redirect/);
  });
});
