// 보관함 상세가 **문 넷을 순차로** 두드리던 자리 (2026-09-10).
//
// 종류마다 읽는 문이 다르고(광고·film·reel·종류 없는 옛 단계별) 주소만으로는 종류를 알 수
// 없어서, 200 이 나올 때까지 차례로 두드렸다. 그런데 네 문 전부 문서를 **통째로 읽고 나서**
// kind 로 404 를 낸다 — 버려질 응답에도 바이트가 다 나간다.
// 09-07 덤프 46편 실측: 광고 1회 7KB · film 2회 19KB · reel 3회 101KB(17/46편) ·
// 옛 단계별 4회 49KB. 왕복이 직렬이라 지연이 곱해진다.
//
// 고친 방향: **목록이 이미 kind 를 안다**(GET /api/projects 가 실어 준다). 그 값을 힌트로
// 물려 주면 맞는 문을 처음부터 두드린다.
//
// ★ 힌트는 **순서만** 바꾼다. 권한이 아니다 — 이 판이 못 박는 것이 그것이다:
//   ① 힌트가 없어도(북마크·직접 입력·옛 링크) 네 문을 차례로 두드리는 길이 살아 있다
//   ② 틀린 힌트를 줘도 **결과가 같다**(어느 문이 열리는지는 그대로 서버가 판정한다)
//
// ★★ 그래서 소스 문자열만 훑지 않는다. ②는 글자가 아니라 값의 성질이라, 문 표와 순서
//   함수를 소스에서 떼어 **실제로 돌려** 잰다(lib/archive/video.js 를 값으로 재는 것과 같은 결).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 소스 판 규율(OUTSTANDING §7-10): 줄 주석을 먼저 걷고 블록 주석을 걷는다.
// 안 걷으면 설명 주석 안의 코드 조각을 판이 코드로 착각한다.
const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const DETAIL = "app/archive/[id]/page.js";
const LIST = "app/archive/page.js";
const detail = strip(readFileSync(DETAIL, "utf8"));
const list = strip(readFileSync(LIST, "utf8"));

// 소스에서 한 덩어리를 떼어 낸다 — 못 찾으면 그 자리에서 죽는다(조용히 빈 문자열을
// 돌려주면 아래 단정이 전부 "통과"해 버린다).
function cut(src, head, tail) {
  const a = src.indexOf(head);
  if (a < 0) throw new Error(`${DETAIL} 에서 ${head} 를 못 찾았다`);
  const b = src.indexOf(tail, a);
  if (b < 0) throw new Error(`${DETAIL} 에서 ${head} 의 끝(${tail})을 못 찾았다`);
  return src.slice(a, b + tail.length);
}

// 문 표와 순서 함수만 떼어 돌린다. 둘 다 순수해야 이것이 성립한다 — 여기서 `ReferenceError`
// 가 나면 순서 판정이 화면 상태를 물었다는 뜻이고, 그러면 값으로 잴 수 없게 된다.
const { ARCHIVE_DOORS, doorsFor } = new Function(
  `${cut(detail, "const ARCHIVE_DOORS = [", "\n];")}\n` +
    `${cut(detail, "function doorsFor(", "\n}")}\n` +
    "return { ARCHIVE_DOORS, doorsFor };",
)();

const urls = (hint) => doorsFor(hint).map(([, door]) => door("X"));
const ALL = ["/api/ads/X", "/api/film/X", "/api/reel/X", "/api/projects/X"];

describe("보관함 상세 — 문 표", () => {
  it("문이 넷이다 — 종류마다 읽는 문이 다르고, 서로를 404 로 거절한다", () => {
    expect(urls(null)).toEqual(ALL);
  });

  it("★ 종류 이름이 목록이 주는 kind 와 같은 말이다 — 갈리면 힌트가 영영 안 맞는다", () => {
    // ad·film·reel 은 문서의 doc.kind 그대로다. 종류가 없는 옛 문서는 kind 가 null 이라
    // 부를 이름이 없어서 "step"(단계별)으로 적는다.
    expect(ARCHIVE_DOORS.map(([kind]) => kind)).toEqual(["ad", "film", "reel", "step"]);
  });
});

describe("보관함 상세 — 힌트는 순서만 바꾼다", () => {
  it("★ 힌트가 없으면 예전 그대로다 — 북마크·직접 입력·옛 링크가 안 죽는다", () => {
    expect(urls(null)).toEqual(ALL);
    expect(urls(undefined)).toEqual(ALL);
    expect(urls("")).toEqual(ALL);
  });

  it("★ 힌트를 주면 그 문이 맨 앞이다 — 첫 왕복에 끝난다", () => {
    expect(urls("ad")[0]).toBe("/api/ads/X");
    expect(urls("film")[0]).toBe("/api/film/X");
    expect(urls("reel")[0]).toBe("/api/reel/X");
    expect(urls("step")[0]).toBe("/api/projects/X");
  });

  it("★★ 어떤 힌트를 줘도 문이 하나도 안 사라진다 — 틀린 힌트가 결과를 바꾸면 안 된다", () => {
    // 이 값은 주소에서 온다(사용자가 바꿀 수 있다). 문을 **지우는** 방식으로 고쳤다면
    // 틀린 kind 하나로 열려야 할 영상이 "찾을 수 없어요"가 된다.
    for (const hint of ["ad", "film", "reel", "step", "REEL", "admin", "../projects", null, 7, {}]) {
      expect([...urls(hint)].sort(), `힌트 ${JSON.stringify(hint)} 에서 문이 달라졌다`)
        .toEqual([...ALL].sort());
    }
  });

  it("★ 모르는 힌트는 없는 것과 같다 — 순서까지 예전 그대로다", () => {
    expect(urls("몰라요")).toEqual(ALL);
    expect(urls("projects")).toEqual(ALL);
  });

  it("★ 맞는 문을 뺀 나머지는 순서가 그대로다 — 폴백이 늘 같은 길을 간다", () => {
    expect(urls("reel")).toEqual(["/api/reel/X", "/api/ads/X", "/api/film/X", "/api/projects/X"]);
  });
});

describe("보관함 상세 — 힌트를 어디서 받나", () => {
  it("★ 주소에서 읽는다 — 카드 링크가 실어 보내는 길", () => {
    expect(detail, "상세가 주소의 kind 를 안 읽는다").toMatch(/get\("kind"\)/);
  });

  it("★ 목록이 남긴 자국도 읽는다 — 카드 링크를 만드는 자리가 이 파일 밖이라서다", () => {
    expect(detail).toMatch(/sessionStorage/);
  });

  it("★★ 두 파일이 같은 열쇠를 쓴다 — 갈리면 힌트가 조용히 안 닿는다", () => {
    const keyOf = (src) => /const KIND_HINT_KEY = "([^"]+)"/.exec(src)?.[1];
    expect(keyOf(detail), `${DETAIL} 에 KIND_HINT_KEY 가 없다`).toBeTruthy();
    expect(keyOf(list), `${LIST} 에 KIND_HINT_KEY 가 없다`).toBe(keyOf(detail));
  });

  it("★ 저장소를 못 써도 화면이 산다 — 읽기·쓰기가 try 안이다", () => {
    // 사파리 비공개 모드 등에서 sessionStorage 접근 자체가 던진다. 힌트일 뿐이므로
    // 못 읽으면 예전처럼 네 문을 두드리면 된다 — 화면이 죽으면 안 된다.
    for (const [name, src] of [[DETAIL, detail], [LIST, list]]) {
      const at = src.indexOf("sessionStorage");
      expect(at, `${name} 이 sessionStorage 를 안 쓴다`).toBeGreaterThan(-1);
      expect(src.slice(0, at), `${name} 의 sessionStorage 가 try 밖이다`).toMatch(/try\s*\{[^}]*$/);
    }
  });

  it("★ 목록은 종류 없는 옛 문서도 자국을 남긴다 — 그 편이 왕복 4회로 가장 비싸다", () => {
    expect(list, "옛 문서 힌트가 없다 — 문 넷을 다 두드리는 편이 그대로 남는다")
      .toMatch(/"step"/);
  });
});

describe("보관함 상세 — 문을 실제로 그 순서로 두드린다", () => {
  it("★ 가져오는 자리가 doorsFor 를 지난다 — 표를 그냥 돌면 힌트가 아무 일도 안 한다", () => {
    const fx = detail.slice(detail.indexOf("useEffect("));
    expect(fx).toMatch(/doorsFor\(/);
    expect(fx, "여전히 문 표를 통째로 돈다").not.toMatch(/of ARCHIVE_DOORS\b/);
  });

  it("★ 못 찾으면 예전 문구 그대로다 — 힌트가 틀렸다고 다른 말을 하지 않는다", () => {
    expect(detail).toMatch(/찾을 수 없어요/);
  });
});
