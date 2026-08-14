// ★ 크레딧을 끈 동안은 **화면에서도 안 보여야 한다**(2026-08-14 사용자 결정).
//
// 서버만 끄면 화면은 여전히 "· 40 크레딧"을 적고 잔액을 띄운다 — 안 쓰는 값을 계속
// 말하는 셈이라 내부 QA 에서 혼란만 준다.
//
// 판정은 **서버가 내려 준 gated 하나**를 본다(/api/me · /api/credits). 화면이 자기
// 나름으로 판정하면 두 벌이 되어 언젠가 어긋난다 — 이 저장소가 이미 겪었다(0원 관통인데
// 화면이 먼저 막아 서버의 202 를 못 봤다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 크레딧을 말하는 화면 전부. 새 화면이 크레딧을 적으면 여기 추가해야 한다.
const SCREENS = [
  "components/UserMenu.jsx",
  "components/QuickCreate.jsx",
  "app/create/page.js",
  "app/create/[id]/voice/page.js",
  "app/create/[id]/images/page.js",
  "app/create/[id]/video/page.js",
  "app/ads/new/page.js",
  "app/ads/[id]/page.js",
  "app/me/page.js",
];

const read = (p) => readFileSync(p, "utf8");

describe("크레딧을 끄면 화면에서도 사라진다", () => {
  for (const path of SCREENS) {
    it(`${path} 가 gated 를 본다`, () => {
      const src = read(path);
      expect(src, "크레딧을 적으면서 gated 를 안 본다").toMatch(/gated/);
    });
  }

  it("★ 상단바 잔액이 gated 뒤에 있다 — 가장 눈에 띄는 자리다", () => {
    const src = read("components/UserMenu.jsx");
    const at = src.indexOf("um-credit");
    expect(at).toBeGreaterThan(-1);
    // 그 줄(또는 바로 앞)에 gated 판정이 걸려 있어야 한다
    expect(src.slice(Math.max(0, at - 200), at), "잔액이 조건 없이 그려진다").toMatch(/gated/);
  });

  it("★ 운영자 화면(/admin)은 그대로 둔다 — QA 중 이상을 봐야 한다", () => {
    // 사용자 결정: 기록은 그대로, 사장님 화면만 숨긴다.
    expect(read("app/admin/page.js")).toContain("크레딧");
  });
});
