// 상단바 잔액 → 마이페이지 [크레딧] 탭(2026-09-14 사장님 지시).
//
// ★ 함정: 이미 /me 에 있을 때 같은 경로로 이동하면 Next 가 화면을 **다시 그리지 않는다** — 마이페이지는
//   처음 그릴 때만 ?tab=credits 를 읽으므로 탭이 안 바뀐다. 그래서 누를 때 신호(ME_TAB_EVENT)를 함께 보내고
//   마이페이지가 그 신호를 듣는다. 주소와 신호 이름은 lib/me-tab.js 한 벌이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CREDITS_TAB_HREF, ME_TAB_EVENT } from "../lib/me-tab.js";

const menu = readFileSync("components/UserMenu.jsx", "utf8");
const me = readFileSync("app/me/page.js", "utf8");

describe("상단바 잔액이 크레딧 탭으로 간다", () => {
  it("주소와 신호 이름은 한 벌 — 화면이 import 하므로 import 문이 없다", () => {
    expect(CREDITS_TAB_HREF).toBe("/me?tab=credits");
    expect(ME_TAB_EVENT).toMatch(/\S/);
    expect(readFileSync("lib/me-tab.js", "utf8")).not.toMatch(/^\s*import\s/m);
  });

  // 2026-09-14 사장님: "상단 크레딧을 940 크레딧으로" — 숫자가 앞, 단위가 뒤.
  it("잔액은 'N 크레딧' 순서다", () => {
    expect(menu).toMatch(/<b>\{formatCredits\(me\.balance\)\}<\/b> 크레딧/);
    expect(menu).not.toMatch(/크레딧 <b>\{formatCredits/);
  });

  it("잔액이 그 주소로 가는 링크다", () => {
    expect(menu).toMatch(/<Link\s+href=\{CREDITS_TAB_HREF\}[^>]*className="um-credit"/);
  });

  it("누를 때 신호를 보낸다 — 이미 /me 에 있어도 탭이 바뀐다", () => {
    expect(menu).toMatch(/dispatchEvent\(new Event\(ME_TAB_EVENT\)\)/);
  });

  it("마이페이지가 그 신호를 듣고, 떠날 때 치운다", () => {
    expect(me).toMatch(/addEventListener\(ME_TAB_EVENT/);
    expect(me).toMatch(/removeEventListener\(ME_TAB_EVENT/);
  });
});
