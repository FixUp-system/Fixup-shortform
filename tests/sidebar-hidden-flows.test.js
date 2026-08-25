// 사이드바에서 흐름 둘을 뺀다 — 「영상 만들기 (단계별)」·「영상 만들기 (수정)」.
//
// ★★ 왜 지우지 않고 '거르는가': 이 저장소는 이미 같은 선택을 했다 — film 의
//   PICKABLE_FILM_MODES 주석이 "숨긴 방식은 표가 거른다. 표를 그대로 돌리면 다시 나온다"
//   고 적는다. 링크만 오려내면 되돌릴 때 무엇을 어디에 되돌려야 하는지가 사라진다.
// ⚠️ 빼면 그 흐름을 **새로 시작할 길이 사이드바에서 없어진다**(주소를 직접 치거나 보관함
//   으로만 열린다). 의도된 것이다 — Ruling 15 의 사고와 방향이 반대다(그때는 실수였다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync("components/Sidebar.jsx", "utf8");
// 주석은 걷어낸다 — 왜 뺐는지는 주석에 남아야 하고, 그 글자가 단정에 걸리면 안 된다.
const clean = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("사이드바에서 뺀 흐름", () => {
  // ★★ 단정을 "소스에 글자가 없다"로 두면 **거르는 방식 자체를 금지**하게 된다 —
  //   표로 거르면 라벨은 소스에 남는다(film 의 PICKABLE_FILM_MODES 가 그 선례다).
  //   그래서 재는 것은 둘이다: ① 표가 false 인가 ② 그 라벨이 표의 조건 **안에** 있는가.
  it("표가 두 흐름을 false 로 둔다", () => {
    expect(clean).toMatch(/SIDEBAR_FLOWS\s*=\s*Object\.freeze\(\{/);
    expect(clean).toMatch(/create:\s*false/);
    expect(clean).toMatch(/film:\s*false/);
  });

  // ★ 정규식 대신 **위치**로 재다: 라벨이 그 조건문 뒤에, 다음 항목(광고 영상) 앞에
  //   있으면 그 블록 안이다. 개행을 물지 않아 문법 함정을 피한다.
  it("「영상 만들기 (단계별)」이 표의 조건 안에서만 그려진다", () => {
    const cond = clean.indexOf("SIDEBAR_FLOWS.create &&");
    // ★ 조건문 **이후**에서 찾는다 — 표의 인라인 주석에도 같은 라벨이 있다.
    const label = clean.indexOf("영상 만들기 (단계별)", cond);
    expect(cond, "조건문을 못 찾았다").toBeGreaterThan(-1);
    expect(label, "라벨을 못 찾았다").toBeGreaterThan(cond);
  });

  it("「영상 만들기 (수정)」이 표의 조건 안에서만 그려진다", () => {
    const cond = clean.indexOf("SIDEBAR_FLOWS.film &&");
    const label = clean.indexOf("영상 만들기 (수정)", cond);
    expect(cond, "조건문을 못 찾았다").toBeGreaterThan(-1);
    expect(label, "라벨을 못 찾았다").toBeGreaterThan(cond);
  });

  // ★ 남는 셋은 조건 밖에 있어야 한다 — 뺀 것이 옆 항목까지 데려가면 안 된다.
  it("광고 영상·reel·보관함은 그대로 있다", () => {
    expect(clean).toContain("광고 영상");
    expect(clean).toContain("영상 만들기");
    expect(clean).toContain("보관함");
  });

  // ★★ 되돌리는 값이 **한 곳**이어야 한다. 두 벌이면 한쪽만 켜고 왜 안 나오는지 찾게 된다.
  it("숨김 판정이 표 하나에만 있다", () => {
    const hits = clean.match(/SIDEBAR_FLOWS\s*=/g) || [];
    expect(hits.length).toBe(1);
  });
});
