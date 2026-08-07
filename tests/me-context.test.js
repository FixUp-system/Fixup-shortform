// 내 정보 공유본(components/MeContext.jsx) — GET /api/me 를 한 번만 읽어 화면 셋이 나눠 쓴다.
// 화면 배선은 소스에서 판정한다(이 저장소에 React 렌더 테스트가 없다 —
// topbar-ui.test.js·me-ui.test.js·credits-ui.test.js 와 같은 방식).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ctx = strip(readFileSync("components/MeContext.jsx", "utf8"));
const shell = strip(readFileSync("components/AppShell.jsx", "utf8"));
const menu = strip(readFileSync("components/UserMenu.jsx", "utf8"));
const side = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const page = strip(readFileSync("app/me/page.js", "utf8"));

describe("내 정보 공유본", () => {
  // ★ topbar-ui.test.js·admin-gate-ui.test.js 에 각각 있던 "서버에서 내 정보를 읽는다"가
  // 옮겨 온 자리다. 읽는 곳이 하나가 됐으니 단정도 하나여야 한다.
  it("GET /api/me 를 읽는 곳은 여기 하나다", () => {
    expect(ctx).toMatch(/fetch\("\/api\/me"\)/);
    expect(ctx.match(/\/api\/me/g)).toHaveLength(1);
    // 소비자 셋은 직접 부르지 않는다 — 예전에는 한 화면에서 같은 요청이 두 번 나갔다.
    expect(menu).not.toMatch(/\/api\/me/);
    expect(side).not.toMatch(/\/api\/me/);
    // 마이페이지에는 저장(PATCH)만 남는다. 읽기(GET)는 공유본이 한다.
    expect(page).not.toMatch(/fetch\("\/api\/me"\)/);
  });

  it("읽은 값·실패 여부·다시 읽는 함수 셋을 내준다", () => {
    expect(ctx).toMatch(/\{\s*me,\s*failed,\s*load\s*\}/);
    expect(ctx).toMatch(/const load = useCallback/);
  });

  // ★ 사이드바의 운영자 링크(비용 기록)가 이 성질에 기대어 fail-closed 다.
  // 못 읽었는데 me 가 무언가로 채워지면 링크가 새어 나올 수 있다.
  it("못 읽으면 me 를 채우지 않는다 — 실패는 failed 로만 알린다", () => {
    const fail = ctx.slice(ctx.indexOf("} catch"));
    expect(fail).toMatch(/setFailed\(true\)/);
    expect(fail).not.toMatch(/setMe\(/);
    // 성공했을 때만 값을 세우고 실패 표시를 내린다.
    expect(ctx).toMatch(/setMe\(data\);\s*setFailed\(false\)/);
  });

  it("진입 때 한 번 읽는다", () => {
    expect(ctx).toMatch(/useEffect\(\(\) => \{ load\(\); \}, \[load\]\)/);
  });

  // ★ 이 파일은 AppShell 과 UserMenu 사이에 새로 낀 **문지기**다.
  // "로그아웃은 GET /api/me 가 실패해도 항상 그려진다"는 tests/topbar-ui.test.js 가
  // 다섯 라운드에 걸쳐 좁혀 온 그물인데, 그 그물은 **UserMenu 만 본다.**
  // 그래서 여기서 children 을 조건부로 막으면(`if (!me) return null;`) 상단바·사이드바·
  // 본문이 통째로 사라져 **앱에서 나갈 수단이 아무 데도 없는데도** 그물은 전부 그린이다
  // (리뷰어 실측). 사이드바에 로그아웃이 더는 없으니 이건 곧 갇히는 것이다.
  // → 그 빠져나갈 구멍을 여기서 막는다.
  it("children 을 조건 없이 그대로 내보낸다 — 여기서 막으면 로그아웃이 도달 불가가 된다", () => {
    const body = ctx.slice(ctx.indexOf("export function MeProvider"), ctx.indexOf("export function useMe"));
    expect(body, "MeProvider 를 못 찾았다 — 이름이 바뀌었으면 이 검사부터 고쳐라").toContain("Ctx.Provider");
    // 모양 그대로여야 한다 — 삼항(`return me ? (…) : null`)이나 조건부 감싸기가 끼면 여기서 걸린다.
    expect(body).toMatch(/return <Ctx\.Provider value=\{value\}>\{children\}<\/Ctx\.Provider>;/);
    // 본문 맨 윗층(들여쓰기 2칸)의 흐름 제어는 저 return 하나뿐이다 —
    // `if (!me) return null;` 같은 이른 반환이 앞에 서면 개수가 늘어 빨개진다.
    // (load 안쪽은 4칸 이상이라 걸리지 않는다.)
    const top = body.match(/^ {2}(if|return|switch|for|while)\b.*$/gm) ?? [];
    expect(top).toHaveLength(1);
    expect(top[0].trim()).toMatch(/^return </);
  });

  // ★ /login·/pending 에서 GET /api/me 는 401(승인 대기자는 403)이다.
  // 아직 들어오지도 않은 사람에게 헛된 요청을 쏘면 안 된다.
  it("bare 화면(로그인·승인 대기)에는 공유본을 두지 않는다", () => {
    const bare = shell.match(/if \(isBarePath\(pathname\)\) \{[\s\S]*?\n {2}\}/);
    expect(bare, "AppShell 의 bare 갈래를 못 찾았다 — 갈래 모양이 바뀌었으면 이 검사부터 고쳐라").not.toBeNull();
    expect(bare[0]).not.toMatch(/MeProvider/);
    // bare 가 아닌 갈래에만 있다.
    expect(shell).toMatch(/<MeProvider>/);
  });
});
