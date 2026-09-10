// 보관함의 [+ 새 영상 만들기]는 **원클릭**으로 간다 (2026-09-10 사장님 지시).
//
// ★★★ 무엇이 어긋나 있었나. 랜딩의 [만들러 가기]는 `/ads/new`(원클릭)로 가는데
//   (`app/home/page.js`), 보관함의 만들기 버튼만 `/create`(단계별 6단계 흐름)로 갔다.
//   그래서 사장님이 겪은 길이 이랬다:
//       랜딩 [더 보러가기] → /archive → [+ 새 영상 만들기] → **단계별 흐름**
//   같은 말("새 영상 만들기")을 하는 버튼이 자리에 따라 다른 제품으로 데려갔다.
//
// ★ 판이 **문자열이 아니라 링크**를 잰다 — 문구는 바뀔 수 있지만 가는 곳은 계약이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ONE_CLICK = "/ads/new";

// ★★ 주석을 먼저 걷는다. 안 걷으면 **주석에 적힌 버튼 이름**을 코드로 착각한다 —
//   2026-09-10 에 실제로 그랬다: 링크를 옮기며 그 위에 남긴 설명 안의 "새로 만들기"를
//   판이 먼저 찾아, 엉뚱하게 그 앞의 다른 `<Link>` 를 재고 빨간불이 났다(코드는 멀쩡했다).
const strip = (s) =>
  s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

// 그 문구가 든 `<Link …>` 한 조각만 잘라 본다.
function linkAround(src, label) {
  const s = strip(src);
  const i = s.indexOf(label);
  expect(i, `"${label}" 문구를 못 찾았다 — 문구가 바뀌었으면 이 판도 함께 고쳐라`).toBeGreaterThan(0);
  return s.slice(s.lastIndexOf("<Link", i), i);
}

describe("보관함 — 만들기 버튼이 가는 곳", () => {
  const src = readFileSync("app/archive/page.js", "utf8");

  it("★★★ [+ 새 영상 만들기]가 **원클릭**으로 간다", () => {
    const link = linkAround(src, "새 영상 만들기");

    expect(link, `보관함 만들기 버튼이 ${ONE_CLICK} 이 아니다`).toContain(`href="${ONE_CLICK}"`);
  });

  it("★★ 랜딩의 만들기 버튼과 **같은 곳**으로 간다 — 자리마다 다른 제품이면 안 된다", () => {
    const home = readFileSync("app/home/page.js", "utf8");
    expect(home, "랜딩 만들기 버튼이 원클릭이 아니다").toContain(ONE_CLICK);
  });
});

describe("사이드바 — 만들기 버튼이 가는 곳", () => {
  // ★ 2026-09-10 — 보관함을 옮기고 나서 사이드바만 `/create`(단계별)로 남아 있었다.
  //   같은 말("새로 만들기")을 하는 버튼이 앱 안에서 두 제품으로 갈리면 안 된다.
  const src = readFileSync("components/Sidebar.jsx", "utf8");

  it("★★★ [+ 새로 만들기]가 **원클릭**으로 간다", () => {
    const link = linkAround(src, "새로 만들기");

    expect(link, `사이드바 만들기 버튼이 ${ONE_CLICK} 이 아니다`).toContain(`href="${ONE_CLICK}"`);
  });
});
