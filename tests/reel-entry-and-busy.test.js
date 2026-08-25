// ① 루트(/)가 어디로 보내는가 · ② 시나리오를 쓰는 동안 버튼을 보이지 않게.
//
// ★★ 사이드바에서 흐름을 빼는 것만으로는 부족했다(2026-08-25 사장님 지적).
//   `app/page.js` 가 여전히 `/create`(단계별)로 보내고 있어서, 주소창에 아무것도 안 치고
//   들어오면 **뺀 흐름이 첫 화면으로** 뜬다. 숨김 판정은 사이드바 하나가 아니라
//   **들어오는 문 전부**가 같은 곳을 봐야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const root = readFileSync("app/page.js", "utf8");
const scenario = readFileSync("app/reel/[id]/scenario/page.js", "utf8");
const clean = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("루트가 살아 있는 흐름으로 보낸다", () => {
  it("단계별(/create)로 보내지 않는다", () => {
    expect(clean(root)).not.toMatch(/redirect\("\/create"\)/);
  });

  it("reel 로 보낸다 — 사이드바에 남긴 그 흐름이다", () => {
    expect(clean(root)).toContain("/reel/new");
  });
});

describe("쓰는 동안에는 버튼이 없다", () => {
  // ★ 자동 생성 중에 [쓰는 중…] 버튼이 떠 있으면 누를 것이 있는 것처럼 보인다 —
  //   실제로는 disabled 라 아무 일도 안 난다. 문구로만 말하고 버튼은 감춘다.
  // ★ 다만 **지우지는 않는다** — 실패했을 때 다시 누를 유일한 길이라(사장님 결정)
  //   busy 가 풀리면 돌아와야 한다.
  // ★ 2026-08-25: 버튼이 한 군데에 그려지고 두 자리에서 쓰인다(rewriteBtn) —
  //   프롬프트 칸 안, 그리고 시나리오가 아직 없을 때의 실행줄. 그래서 감추는 판정은
  //   **선언 자리 한 곳**에 있다. 뜻은 그대로다: 쓰는 동안에는 버튼이 없다.
  // ★★ 2026-08-25 — **뒤집혔다.** 옛 단정은 "busy 면 버튼을 통째로 감춘다"였는데,
  //   자리가 비니 **눌렀는지조차 알 수 없었다** — 사장님이 그래서 "프로덕션에 반영이
  //   안 되는 것 같다"고 했다(실제로는 정상적으로 돌아 컷까지 바뀌어 있었다).
  //   이제 그 자리에 도는 표시와 "쓰는 중…" 을 남긴다. 뜻은 유지된다: **누를 것이
  //   있는 것처럼 보이지 않는다**(버튼이 아니라 글이다).
  it("busy 일 때 버튼 자리에 '쓰는 중' 이 남는다 — 비우지 않는다", () => {
    const c = clean(scenario);
    const at = c.indexOf("const rewriteBtn");
    expect(at, "버튼 선언을 못 찾았다").toBeGreaterThan(-1);
    const decl = c.slice(at, at + 400);
    expect(decl, "busy 로 가르는 조건이 없다").toMatch(/busy \?/);
    expect(decl, "자리를 비운다").not.toMatch(/busy \?\s*null/);
    expect(decl).toMatch(/쓰는 중/);
    expect(decl, "그 자리가 버튼이면 누를 것처럼 보인다").toMatch(/<p /);
  });

  it("버튼 문구에서 쓰는 중 표시가 빠진다", () => {
    const c = clean(scenario);
    const at = c.indexOf("makeScenario}");
    expect(c.slice(at, at + 200)).not.toContain("쓰는 중");
  });

  // ★ 진행 상황은 문구가 말한다 — 버튼이 사라져도 사장님은 무슨 일이 일어나는지 안다.
  it("쓰는 동안 문구가 말해 준다", () => {
    expect(scenario).toMatch(/쓰고 있어요/);
  });
});
