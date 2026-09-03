// 보관함 두 가지 (2026-09-03 사장님 지시).
//
//   ① **보던 탭이 새로고침에도 남는다** — [전체]를 보다가 새로고침하면 [내 영상]으로
//      떨어졌다. 뿌리: scope 의 첫 값만 주소에서 읽고(useState 초기화) 탭을 바꿀 때는
//      주소를 안 고쳤다. 주석은 "첫 탭은 주소가 정한다"고 말하는데 **반쪽만 배선돼
//      있었다** — 주소에 scope 가 없으니 다시 열 때 기본값으로 돌아간 것이다.
//   ② **카드가 어느 모드로 만든 것인지 말한다** — 그전에는 원클릭·한 번에만 배지가
//      붙고 단계별은 아무 표시가 없어, 배지 없는 카드가 "단계별"인지 "종류를 모르는
//      옛 문서"인지 구별되지 않았다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 소스 판 규율(OUTSTANDING §7-10): 줄 주석을 먼저 걷고 블록 주석을 걷는다.
const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

describe("보관함 — 보던 탭이 주소에 남는다", () => {
  const src = strip(readFileSync("app/archive/page.js", "utf8"));

  it("★★★ 탭을 바꾸면 주소도 옮긴다 — 안 옮기면 새로고침에 기본값으로 떨어진다", () => {
    // changeScope 안에서 주소를 고쳐야 한다(함수 끝까지 잘라서 본다).
    const fn = src.slice(src.indexOf("function changeScope"));
    const body = fn.slice(0, fn.indexOf("\n  }") + 4);
    expect(body, "changeScope 가 주소를 안 고친다").toMatch(/router\.(replace|push)\(/);
    expect(body, "전체 탭이 주소에 안 실린다").toMatch(/scope=all/);
  });

  it("★★ push 가 아니라 replace 다 — 탭 전환이 뒤로가기에 쌓이면 보관함을 못 빠져나간다", () => {
    const fn = src.slice(src.indexOf("function changeScope"));
    const body = fn.slice(0, fn.indexOf("\n  }") + 4);
    expect(body).toMatch(/router\.replace\(/);
    expect(body).not.toMatch(/router\.push\(/);
  });

  it("★ 첫 값은 여전히 주소에서 읽는다 — 둘이 짝이라야 왕복이 성립한다", () => {
    expect(src).toMatch(/params\.get\("scope"\)/);
  });

  it("★ router 를 실제로 들고 있다 — 선언 없이 부르면 런타임에만 죽는다", () => {
    expect(src).toMatch(/useRouter\s*\}?\s*from "next\/navigation"|useRouter,/);
    expect(src).toMatch(/const router = useRouter\(\)/);
  });
});

describe("보관함 카드 — 어느 모드로 만들었는지 말한다", () => {
  const src = strip(readFileSync("components/ProjectCards.jsx", "utf8"));

  it("★★★ 세 모드가 모두 자기 이름을 단다", () => {
    expect(src).toMatch(/원클릭/);
    expect(src).toMatch(/한 번에/);
    expect(src, "단계별 배지가 없다 — 배지 없는 카드가 무엇인지 알 수 없다").toMatch(/단계별/);
  });

  it("★★ 단계별은 **ad·film 이 아닐 때** 붙는다 — 상세 화면과 같은 갈래다", () => {
    expect(src).toMatch(/!isAd && !isFilm && <span className="badge ai">단계별<\/span>/);
  });

  it("★ 상세 화면도 같은 이름을 쓴다 — 자리마다 다르게 부르면 같은 것이 달라 보인다", () => {
    const detail = strip(readFileSync("app/archive/[id]/page.js", "utf8"));
    expect(detail).toMatch(/원클릭 영상/);
    expect(detail).toMatch(/단계별 영상/);
  });
});
