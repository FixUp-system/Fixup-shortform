// 보고 있던 탭으로 돌아온다 (2026-08-19 지적).
//
// [전체]에서 영상을 열고 [보관함으로]를 누르면 [내 영상]으로 떨어졌다 — 방금 보던 목록이
// 사라지니 다시 [전체]를 누르고 스크롤을 되짚어야 한다.
//
// ★ 주소에 담는다. 화면 안 상태로 기억하면 뒤로가기·새로고침·링크 공유에서 갈린다.
//   읽는 방법은 이 저장소의 관례를 따른다(app/ads/[id]/page.js 의 useSearchParams).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const list = strip(readFileSync("app/archive/page.js", "utf8"));
const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));
const detail = strip(readFileSync("app/archive/[id]/page.js", "utf8"));

describe("보관함 — 보던 탭을 잃지 않는다", () => {
  it("★ 카드가 지금 탭을 링크에 싣는다", () => {
    expect(cards, "카드가 scope 를 모른다 — 상세는 어디서 왔는지 알 수 없다")
      .toMatch(/scope/);
  });

  it("★ 목록이 카드에 지금 탭을 넘긴다", () => {
    expect(list, "ProjectCards 에 scope 를 안 넘긴다").toMatch(/scope=\{/);
  });

  it("★ 목록이 주소에서 첫 탭을 읽는다 — 돌아왔을 때 그 탭이어야 한다", () => {
    expect(list, "주소를 안 읽으면 돌아와도 늘 '내 영상'이다")
      .toMatch(/useSearchParams/);
  });

  it("★ 상세의 [보관함으로]가 **둘 다** 그 탭으로 돌아간다", () => {
    const backs = detail.match(/보관함으로/g) || [];
    expect(backs.length, "돌아가는 버튼이 하나가 아니다 — 하나만 고치면 다른 쪽이 어긋난다")
      .toBeGreaterThanOrEqual(2);
    // 두 링크 모두 고정 문자열 "/archive" 가 아니어야 한다
    const fixed = detail.match(/href="\/archive"/g) || [];
    expect(fixed.length, "아직 고정 주소로 돌아가는 버튼이 남아 있다").toBe(0);
  });

  it("★ 상세가 주소에서 그 탭을 읽는다", () => {
    expect(detail, "상세가 어디서 왔는지 모른다").toMatch(/useSearchParams/);
  });
});
