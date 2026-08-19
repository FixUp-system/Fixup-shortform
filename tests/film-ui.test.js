// 한 번에 굽는 영상 — 화면 둘(한 파일)과 사이드바. 소스를 읽어 판정한다
// (이 저장소에는 렌더링 하네스가 없다. tests/ad-sidebar-ui.test.js 와 같은 방식).
//
// ★ 주석을 반드시 걷어낸다. 이 저장소는 "주석 속 낱말이 계약을 대신 통과시킨" 사고를
//   반복해서 겪었다 — 특히 화면 파일은 왜 그렇게 했는지를 한국어로 길게 적는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FILM_MODES } from "../lib/film/mode.js";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const side = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const page = strip(readFileSync("app/film/[mode]/page.js", "utf8"));
const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));

describe("사이드바", () => {
  it("★ 두 방식이 나란히 선다 — 표를 돌려 그리므로 방식이 빠질 수 없다", () => {
    // 브리프의 원안은 "/film/order"·"/film/refs" 를 글자 그대로 찾았는데, 같은 브리프가
    // 제시한 구현(FILM_MODES.map + `/film/${m.id}`)에는 그 글자가 없다 — 둘은 동시에
    // 만족될 수 없다. 라벨을 표에서 읽는 쪽이 이 태스크의 명시된 계약이므로 그쪽을
    // 지키고, "두 주소가 실제로 선다"는 것은 **표를 함께 검사해** 같은 세기로 잰다.
    expect(side).toMatch(/FILM_MODES\.map/);
    expect(side).toContain("/film/${");
    expect(FILM_MODES.map((m) => m.id)).toEqual(["order", "refs"]);
  });

  it("★ 라벨은 표에서 읽는다 — 화면에 복사하면 표와 갈린다", () => {
    expect(side).toMatch(/FILM_MODES/);
    // 라벨을 손으로 적어 두지 않았는지도 본다(표와 갈리는 순간이 그 자리다)
    for (const m of FILM_MODES) expect(side).not.toContain(`>${m.label}<`);
  });
});

describe("한 화면이 두 방식을 받는다", () => {
  it("★ 주소에서 방식을 읽는다", () => {
    expect(page).toMatch(/useParams|params/);
  });

  it("★ 모르는 방식이면 화면이 그것을 말한다 — 조용히 한쪽으로 떨어지지 않는다", () => {
    expect(page).toMatch(/isFilmMode/);
  });

  it("★ [다른 방식으로 굽기]가 있다 — 같은 시나리오로 재야 비교가 성립한다", () => {
    expect(page).toContain("다른 방식으로");
    // 같은 프로젝트를 이어서 봐야 시나리오가 공유된다 — 새 프로젝트로 튀면 비교가 아니다
    expect(page).toMatch(/\/film\/\$\{[^}]*\}\?id=/);
  });

  it("★ 라벨·귀띔은 표에서 읽는다", () => {
    expect(page).toMatch(/filmMode|FILM_MODES/);
  });
});

describe("돈이 두 번 나가지 않게", () => {
  it("★ 굽는 중(status==='rendering')이면 버튼이 잠긴다", () => {
    expect(page).toMatch(/status\s*===\s*"rendering"/);
    // 잠금이 실제로 disabled 에 닿는가 — 상태만 읽고 안 쓰면 아무 것도 막지 못한다
    expect(page).toMatch(/disabled=\{[^}]*(locked|rendering)/);
  });

  it("★ 무엇을 만드는 중이면 유료 버튼이 잠긴다 — 두 번 누르면 값이 두 번 나간다", () => {
    expect(page).toMatch(/setBusy/);
    expect(page).toMatch(/disabled=\{[^}]*(busy|locked)/);
  });

  it("★ 그림 만들기와 굽기 버튼이 둘 다 잠금을 본다", () => {
    // disabled 없는 <button 이 하나라도 남으면 그 자리가 이중 청구의 문이 된다.
    const buttons = page.match(/<button[\s\S]*?>/g) || [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b, `잠금 없는 버튼: ${b}`).toMatch(/disabled=/);
  });
});

describe("실패가 화면까지 닿는다", () => {
  it("★ films[mode].error 를 읽어 보여준다 — 안 읽으면 영원히 '만드는 중'이다", () => {
    expect(page).toMatch(/filmOf/);
    expect(page).toMatch(/\.error/);
  });
});

describe("폴링은 이번 범위 밖", () => {
  it("★ setInterval 을 직접 돌리지 않는다 — 상태 라우트가 아직 없다", () => {
    expect(page).not.toMatch(/setInterval/);
  });
});

describe("보관함 카드", () => {
  it("★ film 종류를 갈라 그린다", () => {
    expect(cards).toMatch(/kind === "film"|kind==="film"/);
  });
});
