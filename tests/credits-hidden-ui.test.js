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
// ★ components/UserMenu.jsx 는 2026-09-14 에 뺐다 — 상단바 잔액은 늘 보인다(아래 판).
const SCREENS = [
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

  // ★★ 2026-09-14 결정 뒤집힘(사장님: "상단바 잔액이 없는데?") — 상단바 잔액은 이제 **로그인한 사람에게 늘 보인다.**
  //   크레딧을 걷지 않는 동안에도 와디즈 서포터는 받은 크레딧이 들어왔는지 봐야 하고, 잔액을 누르면 마이페이지
  //   [크레딧] 탭으로 간다. 마이페이지 크레딧 절을 늘 그리기로 한 것과 같은 방향이다.
  //   "왜 안 줄어드는지"는 마이페이지 크레딧 탭이 말한다(freeNote).
  it("★ 상단바 잔액은 gated 로 숨지 않는다 — 로그인했으면 늘 보인다", () => {
    const src = read("components/UserMenu.jsx");
    const at = src.indexOf('className="um-credit"');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, at - 300), at), "잔액이 다시 gated 뒤로 들어갔다").not.toMatch(/gated\s*!==\s*false/);
  });

  it("★ 운영자 화면(/admin)은 그대로 둔다 — QA 중 이상을 봐야 한다", () => {
    // 사용자 결정: 기록은 그대로, 사장님 화면만 숨긴다.
    expect(read("app/admin/page.js")).toContain("크레딧");
  });
});
