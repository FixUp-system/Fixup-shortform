// 한 번에 굽는 영상 — 화면 둘(한 파일)과 사이드바. 소스를 읽어 판정한다
// (이 저장소에는 렌더링 하네스가 없다. tests/ad-sidebar-ui.test.js 와 같은 방식).
//
// ★ 주석을 반드시 걷어낸다. 이 저장소는 "주석 속 낱말이 계약을 대신 통과시킨" 사고를
//   반복해서 겪었다 — 특히 화면 파일은 왜 그렇게 했는지를 한국어로 길게 적는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FILM_MODES } from "../lib/film/mode.js";
// 문 판정은 순수 함수라 **값으로** 잰다 — 화면 소스 훑기로는 "막다른 길이 안 생기는가"를
// 재지 못한다(그 질문의 답은 글자가 아니라 동작이다).
import { filmGates } from "../lib/film/gates.js";

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

  it("★ 아이콘이 옆 항목과 겹치지 않는다 — 나란히 서면 눈으로 갈려야 한다", () => {
    // components/Icon.jsx 가 "나란히 있어 서로 달라야 한다"고 적어 둔 그 자리다.
    // 방식 항목이 sparkle(영상 만들기)·ad(광고 영상)를 그대로 쓰면 최상위 넷이 뭉갠다.
    const block = side.slice(side.indexOf("FILM_MODES.map"));
    const icon = block.match(/<Icon name=\{?([^}\/]*)/)?.[1] || "";
    expect(icon).not.toMatch(/"sparkle"|"ad"/);
    expect(icon).toMatch(/FILM_ICON/);
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
    // 판정은 lib/film/gates.js 한 벌이다 — 화면 소스가 아니라 값으로 잰다.
    expect(filmGates({ status: "rendering" }).locked).toBe(true);
    expect(filmGates({ status: "rendering" }).drawLocked).toBe(true);
    // 잠금이 실제로 disabled 에 닿는가 — 계산만 하고 안 쓰면 아무 것도 막지 못한다
    expect(page).toMatch(/disabled=\{[^}]*(locked|rendering)/);
  });

  it("★ 그리는 중이면 그림 버튼이 잠긴다 — 장당 ≈$0.08 이다", () => {
    // busy 는 이 탭에서 누른 것만 안다. 그리는 도중 새로고침하면 busy 가 비므로,
    // 문서의 상태를 안 보면 [그림 만들기]가 다시 열린다.
    expect(filmGates({ status: "drawing", canDraw: false, triesLeft: 5 }).drawLocked).toBe(true);
    // 화면이 그 판정을 실제로 쓰는가 — 계산만 하고 안 쓰면 아무 것도 막지 못한다
    expect(page).toMatch(/filmGates\(/);
    expect(page).toMatch(/disabled=\{drawLocked/);
  });

  it("★★ 만료된 잠금은 막다른 길이 아니다 — 무기한 잠기면 다시 그릴 길이 아예 없다", () => {
    // 인스턴스가 죽으면 "drawing" 이 문서에 눌러앉는다(아무도 되돌려 쓰지 않는다).
    // 서버는 10분 뒤 다시 열어 주고(canDraw:true) 화면도 함께 열려야 한다 —
    // status 만 보고 잠그면 새로고침으로도 안 풀리는 막다른 길이 된다.
    const expired = { status: "drawing", canDraw: true, triesLeft: 5 };
    expect(filmGates(expired).drawLocked).toBe(false);
    expect(filmGates(expired).drawingNow).toBe(false);
    // 폴링도 그때는 멈춰야 한다(눌러앉은 상태로 영원히 서버를 두드리지 않는다)
    expect(filmGates(expired).rendering).toBe(false);
  });

  it("★ 횟수 소진과 '그리는 중'은 다른 일이다 — 섞으면 굽는 길이 막힌다", () => {
    // 6회를 다 쓴 프로젝트도 **이미 만든 그림으로는 구울 수 있어야** 한다.
    const gone = filmGates({ status: "images", canDraw: false, triesLeft: 0 });
    expect(gone.drawLocked).toBe(true);
    expect(gone.locked).toBe(false);
    expect(gone.triesGone).toBe(true);
  });

  it("★ canDraw 가 없는 옛 응답에서도 죽지 않는다 — status 로 떨어진다", () => {
    // 문서만 읽은 첫 화면(GET /api/projects/[id])에는 canDraw·triesLeft 가 없다.
    expect(filmGates({ status: "drawing" }).drawLocked).toBe(true);
    expect(filmGates({ status: "images" }).drawLocked).toBe(false);
    expect(filmGates(null).locked).toBe(false);
    expect(filmGates(undefined).drawLocked).toBe(false);
  });

  it("★ 그리는 중이라는 것을 말로 알린다", () => {
    expect(page).toMatch(/drawingNow && \(/);
    expect(page).toMatch(/그리는 중이에요/);
  });

  it("★ 무엇을 만드는 중이면 유료 버튼이 잠긴다 — 두 번 누르면 값이 두 번 나간다", () => {
    expect(page).toMatch(/setBusy/);
    expect(page).toMatch(/disabled=\{[^}]*(busy|locked)/);
  });

  it("★ 화면의 모든 버튼이 잠금을 본다", () => {
    // disabled 없는 <button 이 하나라도 남으면 그 자리가 이중 청구의 문이 된다.
    //
    // ⚠️ 이 정규식은 **숨은 순서 제약**을 만든다: `<button` 부터 첫 `>` 까지만 잘라 보므로
    //    disabled 가 화살표(=>)를 품은 onClick 뒤에 오면 그 `>` 에서 잘려 못 찾는다.
    //    속성 순서를 바꿔 이 테스트가 빨개지면 코드가 아니라 **자르는 자리**가 원인이다.
    //    (JSX 를 정규식으로 자르는 이상 이 한계는 남는다 — 렌더 하네스가 없어서다.)
    // ⚠️ 존재만 본다 — `disabled={false}` 도 통과한다. 그 구멍은 아래 한 줄로 좁힌다.
    const buttons = page.match(/<button[\s\S]*?>/g) || [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b, `잠금 없는 버튼: ${b}`).toMatch(/disabled=/);
      expect(b, `늘 열린 버튼: ${b}`).not.toMatch(/disabled=\{false\}|disabled=\{\s*!?true/);
    }
  });
});

describe("실패가 화면까지 닿는다", () => {
  it("★ 문서를 다시 읽지 못하면 화면이 그렇게 말한다 — 삼키면 잠금이 풀린다", () => {
    // reload 가 조용히 실패하면 화면은 rendering 을 모른 채 [굽기]를 다시 연다 —
    // 그러면 화면 잠금이 사라지고 서버가 유일한 방어선이 된다.
    const fn = page.slice(page.indexOf("async function reload"), page.indexOf("async function onFiles"));
    expect(fn).toMatch(/setErr\(/);
    expect(fn).toMatch(/catch/);
  });

  it("★ films[mode].error 를 읽어 보여준다 — 안 읽으면 영원히 '만드는 중'이다", () => {
    expect(page).toMatch(/filmOf/);
    expect(page).toMatch(/\.error/);
  });
});

describe("화면이 스스로 갱신된다", () => {
  it("★ 폴링 루프를 새로 만들지 않는다 — lib/poll.js 한 벌을 쓴다", () => {
    // 화면마다 복붙한 루프가 조금씩 다르게 틀려 있었다(lib/poll.js 주석의 그 사고다).
    expect(page).toMatch(/startPolling/);
    expect(page).not.toMatch(/setInterval/);
    expect(page).toContain("/status");
  });

  it("★ 끝나면 멈춘다 — 안 멈추면 서버를 계속 두드린다", () => {
    // 멈춤 판정은 화면의 잠금과 **같은 함수**여야 한다(두 벌이면 한쪽이 먼저 낡는다).
    const tick = page.slice(page.indexOf("onTick"), page.indexOf("onStop"));
    expect(tick).toMatch(/filmGates/);
    expect(tick).toMatch(/rendering \|\| [a-zA-Z.]*drawingNow/);
    // done · error 는 둘 다 아니므로 멈춘다
    for (const st of ["done", "error", "images", "draft"]) {
      const g = filmGates({ status: st });
      expect(g.rendering || g.drawingNow, `${st} 에서 안 멈춘다`).toBe(false);
    }
    expect(filmGates({ status: "rendering" }).rendering).toBe(true);
  });

  it("★ 화면을 떠나면 뗀다", () => {
    expect(page).toMatch(/stopRef\.current\?\.\(\)/);
  });
});

describe("보관함 카드", () => {
  it("★ film 종류를 갈라 그린다", () => {
    expect(cards).toMatch(/kind === "film"|kind==="film"/);
  });
});
