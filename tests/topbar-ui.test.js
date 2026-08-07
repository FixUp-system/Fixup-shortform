import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const menu = strip(readFileSync("components/UserMenu.jsx", "utf8"));
const shell = strip(readFileSync("components/AppShell.jsx", "utf8"));
const css = readFileSync("app/globals.css", "utf8");
// "규칙이 없다"를 판정할 때는 주석을 걷어낸다 — 지운 이유를 주석으로 남기면
// 그 문장에 매치돼 테스트가 거짓으로 빨개진다(실제로 한 번 밟았다).
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, "");

// 이름 붙은 함수의 본문(바깥 중괄호 안쪽)을 통째로 떼어낸다.
function body(src, fnName) {
  const open = src.indexOf("{", src.indexOf(`function ${fnName}(`));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

// 함수 **최상위**(중첩 깊이 1)의 return 문만 골라 첫 줄을 돌려준다.
// useEffect 콜백 안의 return(정리 함수·이른 탈출)은 더 깊이 있어 안 걸린다 —
// 그래서 "컴포넌트가 화면에 무엇을 돌려주는가"만 남는다.
//
// 한계(소스 검사라 어쩔 수 없다, 알고 쓴다):
//  · 중괄호를 세는 방식이라 문자열·정규식 안의 중괄호가 있으면 깊이가 흔들린다.
//    지금 이 파일에는 없고, 생기면 이 테스트가 먼저 깨져 알려 준다.
//  · 블록으로 감싼 조기 반환(`if (!me) { return … }`)은 깊이 2라 안 걸린다.
//    그래서 호출부에서 `return null` 을 따로 한 번 더 문다.
//    그 둘을 합쳐도 `if (!me) { return <span /> }` 는 못 잡는다 — 진짜로 막으려면
//    렌더 테스트가 필요한데, 이 저장소에는 React 렌더 테스트가 없다.
function topLevelReturns(src, fnName) {
  const inner = body(src, fnName);
  const out = [];
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "{") depth++;
    else if (inner[i] === "}") depth--;
    else if (depth === 0 && inner.startsWith("return", i) && !/[\w$]/.test(inner[i - 1] || " ")) {
      const end = inner.indexOf("\n", i);
      out.push(inner.slice(i, end === -1 ? undefined : end).trim().replace(/;$/, ""));
    }
  }
  return out;
}

describe("상단 계정 바", () => {
  it("내 정보를 서버에서 한 번에 읽는다 — 이름과 크레딧을 따로 부르지 않는다", () => {
    expect(menu).toMatch(/\/api\/me/);
    expect(menu).not.toMatch(/\/api\/credits/);
  });

  // /api/me 문자열에도 "/me" 가 들어 있어, 그냥 /\/me/ 로 물면 <Link> 를 통째로 지워도
  // 초록이었다. 실제 링크를 문다.
  it("마이페이지와 로그아웃을 담는다", () => {
    expect(menu).toMatch(/href="\/me"/);
    expect(menu).toMatch(/로그아웃/);
    expect(menu).toMatch(/signOut/);
  });

  it("잔액을 크레딧으로 보여준다", () => {
    expect(menu).toMatch(/balance/);
    expect(menu).toMatch(/크레딧/);
  });

  // ★ 사이드바에서 로그아웃을 지운 뒤로, 화면에서 세션을 끊을 자리는 여기 하나뿐이다.
  // 내 정보를 못 읽었다고 계정 묶음을 통째로 숨기면 로그아웃할 방법이 사라진다
  // (라이브 GET /api/me 가 실제로 500 이었다 — profiles.display_name 컬럼이 없어서).
  // 데이터가 있어야 하는 것(크레딧)만 가리고, 이름은 기본 라벨로 채워 빈 버튼을 안 만든다.
  //
  // 지키려는 것은 "로그아웃이 어떤 상태에서도 도달 가능하다"이지 특정 문장이 아니다.
  // 처음에는 `if (!me) return null;` 이라는 **문자열 한 줄**을 물었는데, 뜻이 같은
  // `if (me === null) return null;` 로 바꾸면 전부 그린인 채 로그아웃이 다시 사라졌다.
  // 그래서 문장이 아니라 **모양**을 문다: 컴포넌트가 돌려주는 것은 조건 없는 JSX 하나뿐이고,
  // 그 앞에 어떤 조기 반환도 없다.
  it("내 정보를 못 읽어도 로그아웃은 그린다 — 조기 반환이 없다", () => {
    const returns = topLevelReturns(menu, "UserMenu");
    // 표현이 무엇이든(null·JSX·삼항) 조기 반환이 하나라도 생기면 여기서 걸린다.
    expect(returns).toHaveLength(1);
    // 유일한 반환이 곧 계정 묶음이다 — `return me ? (…) : null` 같은 감싸기도 못 지나간다.
    expect(returns[0]).toBe("return (");
    // 블록으로 감싼 조기 반환(`if (!me) { return null }`)은 중첩이라 위 스캔을 빠져나간다.
    // 표현으로 한 번 더 문다.
    expect(body(menu, "UserMenu")).not.toMatch(/return\s+null/);
    // 데이터가 있어야 하는 것만 가린다.
    expect(menu).toMatch(/me\s*&&\s*\(?\s*<span className="um-credit"/);
    expect(menu).toMatch(/me\?\.name\s*\|\|/);
  });

  it("드롭다운이 Esc 와 바깥 클릭으로 닫힌다", () => {
    expect(menu).toMatch(/Escape/);
    expect(menu).toMatch(/aria-expanded/);
  });

  it("AppShell 이 상단 띠에 붙인다", () => {
    expect(shell).toMatch(/UserMenu/);
  });

  // BETA 문구는 화면 가운데를 지켜야 한다 — 우측 묶음을 그냥 더하면 왼쪽으로 밀린다.
  it("띠가 좌·중·우 3영역이다", () => {
    expect(css).toMatch(/\.belt-side/);
    expect(css).toMatch(/\.belt-mid/);
  });

  // .belt b 가 BETA 배지를 만드느라 자간을 벌려 둔다 — 크레딧 숫자는 배지가 아니다.
  it("크레딧 숫자가 BETA 배지의 자간을 물려받지 않는다", () => {
    expect(css).toMatch(/\.um-credit b\s*\{[^}]*letter-spacing:\s*normal/);
  });
});

// 두 곳에 남으면 한쪽이 조용히 낡는다 — 옮겼으면 옛 자리는 비어 있어야 한다.
describe("사이드바 — 계정에 관한 것이 더는 없다", () => {
  const side = strip(readFileSync("components/Sidebar.jsx", "utf8"));
  it("로그아웃이 없다", () => {
    expect(side).not.toMatch(/로그아웃/);
    expect(side).not.toMatch(/signOut/);
  });
  it("크레딧을 읽지도 보여주지도 않는다", () => {
    expect(side).not.toMatch(/\/api\/credits/);
    expect(side).not.toMatch(/credit-box/);
  });
  it("죽은 .credit-box CSS 도 남기지 않는다", () => {
    expect(cssRules).not.toMatch(/\.credit-box/);
  });
});
