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
// ★ 못 찾으면 **던진다.** 예전에는 조용히 넘어갔는데, indexOf 가 -1 을 주면
// indexOf("{", -1) 이 파일 처음부터 훑어 `import { … }` 의 중괄호를 함수 본문으로 잡았다.
// 그러면 컴포넌트를 화살표 함수로 바꾸는 것 같은 뜻 같은 리팩터에서 "returns=[]" 로
// 빨개지는데 원인을 못 가리킨다 — 코드가 아니라 테스트를 고치게 만드는 거짓 실패다.
function body(src, fnName) {
  const at = src.indexOf(`function ${fnName}(`);
  if (at === -1) {
    throw new Error(
      `함수 선언 \`function ${fnName}(\` 를 못 찾았다. ` +
      "선언 방식이 바뀌었다면(예: 화살표 함수) 이 헬퍼부터 고쳐야 한다 — " +
      "그러지 않으면 아래 단정들이 엉뚱한 곳을 읽고 거짓으로 빨개진다."
    );
  }
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

// 함수 **최상위**(중첩 깊이 0)의 return 문만 골라 `{ head, firstToken }` 로 돌려준다.
//  · head — 그 줄(예: `return (`)
//  · firstToken — 돌려주는 식의 첫 글자. 앞의 여백과 여는 괄호를 걷어낸 뒤 한 글자다.
//    `<` 면 조건 없는 JSX 고, `!`·`m` 이면 괄호 **안쪽**에 조건이 끼어든 것이다.
//    (head 만 보던 시절에는 `return (\n  !me ? null :\n  <div…>` 가 그냥 지나갔다.)
// useEffect 콜백 안의 return(정리 함수·이른 탈출)은 더 깊이 있어 안 걸린다 —
// 그래서 "컴포넌트가 화면에 무엇을 돌려주는가"만 남는다.
//
// 한계 — ★ **개수로 적지 마라. 부류로 적어라.**
// 이 그물은 소스를 **읽어서** 판정하므로 **임의 깊이의 조건은 원리적으로 못 본다.**
// "남은 사각지대는 이것 하나"라고 적었다가 두 번 틀렸다(그때마다 다음 리뷰어가
// 새 우회로를 찾아냈다). 그러니 세지 말고 무엇을 막고 무엇을 못 막는지만 적는다.
//
//  막는 것:
//   · 최상위 조기 반환 — 표현이 무엇이든(`return null`·JSX·`if (me === null)`)
//   · 반환식을 감싼 조건 — `return me ? (…) : null`, `return ( !me ? null : <div…> )`
//   · 블록으로 감싼 `return null` (호출부에서 표현으로 따로 문다)
//   · JSX **안쪽**에 새로 끼는 `me` 조건 (호출부에서 `me` 쓰임 수를 세어 문다)
//  못 막는 것:
//   · 블록으로 감싼 **null 아닌** 조기 반환(`if (!me) { return <span /> }`) — 깊이 1이라
//     이 스캔에 안 걸리고 `return null` 검사에도 안 걸린다
//   · `me` 를 안 거치는 조건으로 로그아웃을 가리는 것(예: 다른 상태 변수를 새로 들여옴)
//   · 그 밖에, 소스 문자열로는 구별할 수 없는 모든 형태
//  진짜로 막으려면 렌더 테스트가 필요한데, 이 저장소에는 React 렌더 테스트가 없다.
//  (게다가 로그아웃이 `{open && …}` 드롭다운 안이라 SSR 렌더만으로는 열지도 못한다.)
//
//  · 중괄호를 세는 방식이라 문자열·정규식 안의 중괄호가 있으면 깊이가 흔들린다.
//    지금 이 파일에는 없고, 생기면 이 테스트가 먼저 깨져 알려 준다.
function topLevelReturns(src, fnName) {
  const inner = body(src, fnName);
  const out = [];
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "{") depth++;
    else if (inner[i] === "}") depth--;
    else if (depth === 0 && inner.startsWith("return", i) && !/[\w$.]/.test(inner[i - 1] || " ")) {
      const end = inner.indexOf("\n", i);
      const head = inner.slice(i, end === -1 ? undefined : end).trim().replace(/;$/, "");
      const expr = inner.slice(i + "return".length).replace(/^[\s(]+/, "");
      out.push({ head, firstToken: expr[0] || "" });
    }
  }
  return out;
}

// 그물을 지탱하는 것이 이 헬퍼 둘이다. 여기가 조용히 틀리면 아래 단정이 전부 의미를 잃는데
// 아무도 안 알려 준다 — 그래서 헬퍼 자체를 알려진 입력으로 문다.
describe("회귀 그물을 지탱하는 헬퍼", () => {
  it("함수 본문만 떼어낸다", () => {
    expect(body("const x = { a: 1 };\nfunction f(a) { return 1; }\n", "f")).toBe(" return 1; ");
  });
  it("선언을 못 찾으면 조용히 넘어가지 않고 던진다", () => {
    expect(() => body("const F = () => { return 1; };", "F")).toThrow(/못 찾았다/);
  });
  it("최상위 return 만 센다 — 콜백 안의 return 은 안 센다", () => {
    const src = "function f() {\n  useEffect(() => {\n    if (!x) return;\n    return () => stop();\n  }, []);\n  return (\n    <div />\n  );\n}\n";
    expect(topLevelReturns(src, "f").map((r) => r.head)).toEqual(["return ("]);
  });
  it("돌려주는 식의 첫 토큰을 집는다 — 괄호 안쪽까지 본다", () => {
    const jsx = "function f() {\n  return (\n    <div />\n  );\n}\n";
    const cond = "function f() {\n  return (\n    !x ? null :\n    <div />\n  );\n}\n";
    expect(topLevelReturns(jsx, "f")[0].firstToken).toBe("<");
    expect(topLevelReturns(cond, "f")[0].firstToken).toBe("!");
  });
  // ★ 이 it 은 **사각지대가 사각지대인 채로 있음**을 못 박는다. 나중에 헬퍼를 고쳐
  // 블록 조기 반환까지 잡게 되면 이 it 이 빨개지는데, 그것은 **의도된 알림**이다 —
  // 개선을 되돌리지 말고 이 it 을 "이제 잡는다"로 고쳐 써라.
  it("블록으로 감싼 조기 반환은 못 본다 — 알려진 사각지대(그래서 return null 을 따로 문다)", () => {
    const src = "function f() {\n  if (!x) { return null; }\n  return (\n    <div />\n  );\n}\n";
    expect(topLevelReturns(src, "f")).toHaveLength(1);
    expect(body(src, "f")).toMatch(/return\s+null/);
  });
});

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
  it("내 정보를 못 읽어도 로그아웃은 그린다 — 조기 반환도 조건부 반환도 없다", () => {
    const returns = topLevelReturns(menu, "UserMenu");
    // 표현이 무엇이든(null·JSX·삼항) 조기 반환이 하나라도 생기면 여기서 걸린다.
    expect(returns).toHaveLength(1);
    // 유일한 반환이 곧 계정 묶음이다 — `return me ? (…) : null` 같은 감싸기도 못 지나간다.
    expect(returns[0].head).toBe("return (");
    // ★ 괄호 **안쪽**까지 본다. 여는 괄호 다음 첫 토큰이 `<`(=조건 없는 JSX)여야 한다.
    // 이게 없으면 `return (\n  !me ? null :\n  <div className="um">` 가 그냥 지나간다 —
    // 최상위 return 은 하나고 첫 줄도 `return (` 라서 위 두 줄에 안 걸린다.
    expect(returns[0].firstToken).toBe("<");
    // ★ 여기까지는 반환식의 **맨 앞**만 본다. 최상위를 조건 없는 `<div>` 로 두고
    // **안쪽에서** 가리는 우회로가 그대로 남았다 — 특히 `{open && (` 를
    // `{me && open && (` 로 바꾸면 return 문을 한 글자도 안 건드리고 로그아웃만 사라진다.
    //
    // 그래서 JSX 안에서 `me` 가 **값으로 쓰이는 자리의 수**를 센다. 지금 셋뿐이다:
    //   ① 크레딧을 가리는 조건 `me &&`  ② 잔액 `me.balance`  ③ 이름 `me?.name`
    // 하나라도 늘면 JSX 안쪽 어딘가에 **새 조건이 끼어든 것**이다(드롭다운을 가리는 것 포함).
    // 늘려야 할 정당한 이유가 생겼다면, 늘린 자리가 로그아웃을 가리지 않는지 눈으로 보고
    // 이 숫자를 함께 고쳐라 — 세는 것이 목적이 아니라 "조용히 늘지 않게" 하는 것이 목적이다.
    // (`(?<![\w\/$.])` 는 `href="/me"`·`theme`·`.me` 같은 남의 `me` 를 걸러낸다.)
    const jsx = menu.slice(menu.indexOf("  return ("));
    expect(jsx.match(/(?<![\w\/$.])me\s*(&&|\?|\.)/g)).toHaveLength(3);
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
