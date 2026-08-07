// 비용 기록(/costs)은 전사 원장이라 운영자 전용이다 — 남의 지출과 프롬프트가 담긴다.
// 화면 배선은 소스를 읽어 판정한다(이 저장소에 React 렌더 테스트가 없다 —
// credits-ui.test.js·staleness-ui.test.js 와 같은 방식).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sidebar = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const middleware = strip(readFileSync("middleware.js", "utf8"));

describe("사이드바 — 비용 기록은 운영자에게만", () => {
  // ★ 판정 대상이 옮겨졌다 — 예전에는 사이드바가 GET /api/me 를 직접 불렀다(상단바와
  // 합쳐 한 화면에 요청 두 번). 이제는 공유본(components/MeContext.jsx)에서 받는다.
  // "서버가 답한 isAdmin 을 쓴다"는 뜻은 그대로 두고, 요청을 실제로 보내는지에 대한
  // 단정은 tests/me-context.test.js 로 옮겼다.
  it("서버에서 운영자 여부를 읽는다 — 화면이 혼자 정하지 않는다", () => {
    expect(sidebar).toMatch(/useMe\(\)/);
    expect(sidebar).toMatch(/isAdmin/);
    // 직접 부르지 않는다 — 같은 요청이 두 번 나가던 자리다.
    expect(sidebar).not.toMatch(/fetch\(/);
  });

  // ★ 이 단정이 회귀 그물이다 — /costs 링크가 isAdmin 조건 밖으로 새어 나오면 잡힌다.
  it("/costs 링크가 isAdmin 조건 안에서만 그려진다", () => {
    expect(sidebar).toMatch(/\{\s*isAdmin\s*&&[\s\S]*?href="\/costs"[\s\S]*?\)\}/);
  });

  // ★ fail-closed 는 이제 두 조각이 함께 지킨다:
  //   ① 공유본이 못 읽으면 me 를 null 로 남긴다(tests/me-context.test.js 가 문다)
  //   ② 여기서 `!!me?.isAdmin` 이라 null 이면 false 다
  // 옛 단정(useState(false) 기본값 · d?.isAdmin 일 때만 세움)이 문 성질이 그대로 남아 있다.
  it("못 읽었을 때는 숨기는 쪽으로 떨어진다 — me 가 없으면 false 다", () => {
    expect(sidebar).toMatch(/const isAdmin = !!me\?\.isAdmin/);
    // 원문 role 이 아니라 서버가 답한 판정 하나만 본다.
    expect(sidebar).not.toMatch(/role\s*===/);
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
