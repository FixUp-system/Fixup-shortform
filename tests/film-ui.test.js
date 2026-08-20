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
const page = strip(readFileSync("app/film/one/[mode]/page.js", "utf8"));
const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));

describe("사이드바", () => {
  it("★ 두 방식이 나란히 선다 — 표를 돌려 그리므로 방식이 빠질 수 없다", () => {
    // 브리프의 원안은 "/film/order"·"/film/refs" 를 글자 그대로 찾았는데, 같은 브리프가
    // 제시한 구현(FILM_MODES.map + `/film/${m.id}`)에는 그 글자가 없다 — 둘은 동시에
    // 만족될 수 없다. 라벨을 표에서 읽는 쪽이 이 태스크의 명시된 계약이므로 그쪽을
    // 지키고, "두 주소가 실제로 선다"는 것은 **표를 함께 검사해** 같은 세기로 잰다.
    expect(side).toMatch(/FILM_MODES\.map/);
    // ★ 2026-08-20 에 이 화면이 `/film/one/<방식>` 으로 비켰다 — `/film/` 바로 뒤는
    //   이제 프로젝트 id 의 자리다(단계별 흐름). 재는 뜻은 그대로다: 주소가 표에서 나오는가.
    expect(side).toContain("/film/one/${");
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
    // ★ 같은 자리에서 `/film/one/` 으로 비켰다(2026-08-20). 재는 뜻은 그대로다:
    //   **같은 프로젝트를 이어서** 보는가(?id= 를 달고 가는가).
    expect(page).toMatch(/\/film\/one\/\$\{[^}]*\}\?id=/);
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

  it("★★ 마지막 회차가 도는 중에는 굽기가 안 열린다 — 옛 그림으로 한 편 값이 나간다", () => {
    // 회차는 그리기를 **시작할 때** 오르므로, 6번째가 도는 동안 canDraw:false 와
    // triesLeft:0 이 동시에 참이다. 그 둘만 보면 "다 써서 못 그림"으로 읽혀 잠금이 풀린다.
    // 서버가 실어 보내는 drawing 이 그것을 가른다(app/api/film/[id]/status/route.js).
    const last = { status: "drawing", drawing: true, canDraw: false, triesLeft: 0 };
    const g = filmGates(last);
    expect(g.drawingNow).toBe(true);
    expect(g.locked).toBe(true);       // [이대로 굽기]가 잠긴다
    expect(g.drawLocked).toBe(true);
    // 폴링도 그 자리에서 멈추면 안 된다 — 멈추면 6번째 그림은 새로고침해야만 보인다
    expect(g.rendering || g.drawingNow).toBe(true);
  });

  it("★ 다 쓰고 **멈춘** 것과는 다르다 — 그때는 굽는 길이 열려야 한다", () => {
    const done = filmGates({ status: "images", drawing: false, canDraw: false, triesLeft: 0 });
    expect(done.drawingNow).toBe(false);
    expect(done.locked).toBe(false);
    expect(done.drawLocked).toBe(true);
  });

  it("★ 횟수 소진과 '그리는 중'은 다른 일이다 — 섞으면 굽는 길이 막힌다", () => {
    // 6회를 다 쓴 프로젝트도 **이미 만든 그림으로는 구울 수 있어야** 한다.
    const gone = filmGates({ status: "images", canDraw: false, triesLeft: 0 });
    expect(gone.drawLocked).toBe(true);
    expect(gone.locked).toBe(false);
    expect(gone.triesGone).toBe(true);
  });

  it("★ 폴백도 두 막다른 길 사이에 선다 — triesLeft 가 아니라 status 를 본다", () => {
    // drawing 없는 응답에 canDraw·triesLeft 만 실리는 날이 와도:
    //  · 마지막 회차가 **도는 중**이면 잠긴다(옛 그림으로 값이 나가지 않는다)
    expect(filmGates({ status: "drawing", canDraw: false, triesLeft: 0 }).locked).toBe(true);
    //  · 다 쓰고 **멈춘** 것은 안 잠긴다(이미 만든 그림으로 구울 수 있어야 한다)
    expect(filmGates({ status: "images", canDraw: false, triesLeft: 0 }).locked).toBe(false);
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

  it("★★ 방식·프로젝트가 바뀌면 옛 폴링을 뗀다 — 안 떼면 옆 방식 값이 이 화면에 실린다", () => {
    // onTick 은 **호출 시점의 mode 를 클로저에 가둔다.** 값만 비우면 다음 회차가 옛 방식
    // 값으로 다시 채우고(refs 칸에 order 의 영상이 뜬다 — A/B 판정이 오염된다), 복원
    // effect 는 손잡이가 차 있어 새 방식용 폴링을 시작하지도 못한다.
    // ⚠️ 이 한 줄만은 값이 아니라 소스로 잰다 — 판정이 아니라 **리액트 생명주기**라
    //    순수 함수로 뺄 수 없고, 이 저장소에는 렌더 하네스가 없다.
    const at = page.indexOf("[mode, id]");
    expect(at, "[mode, id] effect 가 없다").toBeGreaterThan(-1);
    const eff = page.slice(page.lastIndexOf("useEffect", at), at + 12);
    expect(eff).toMatch(/stopRef\.current\?\.\(\)/);
    expect(eff).toMatch(/stopRef\.current = null/);
    expect(eff).toMatch(/setLive\(null\)/);
    expect(eff).toMatch(/\[mode, id\]/);
  });

  it("★★ 다시 붙이는 쪽도 방식을 본다 — 뗐는데 안 붙으면 화면이 멎는다", () => {
    // 소스 앵커 테스트는 "떼기가 코드에 있는가"는 재도 **"뗀 뒤에 다시 붙는가"라는 순서**는
    // 못 잰다(렌더 하네스가 없다). 그 구멍을 deps 목록으로 좁힌다: 두 방식이 동시에 같은
    // 상태면(둘 다 굽는 중) 플래그가 true → true 라 deps 가 안 바뀌고, mode 가 없으면
    // 복원 effect 가 아예 안 돌아 새 방식 폴링이 시작되지 않는다.
    const at = page.indexOf("beginPolling();", page.indexOf("gatesNow"));
    const deps = page.slice(at, page.indexOf("]);", at) + 2);
    const list = deps.match(/\[[^\]]*\]/g)?.pop();
    expect(list, "복원 effect 의 deps 를 못 찾았다").toBeTruthy();
    expect(list).toMatch(/\bmode\b/);
    expect(list).toMatch(/\bid\b/);
  });

  it("★ 접수되지 않았으면 두드리지 않는다 — 수거까지 하는 GET 을 헛되이 부른다", () => {
    const fn = page.slice(page.indexOf("async function startRender"), page.indexOf("if (!isFilmMode"));
    expect(fn).toMatch(/if \(res\.ok\) beginPolling\(\)/);
  });
});

describe("보관함 카드", () => {
  it("★ film 종류를 갈라 그린다", () => {
    expect(cards).toMatch(/kind === "film"|kind==="film"/);
  });
});

// ★★ 시나리오 [다시 쓰기] 버튼은 지금까지 **누르면 항상 400 인 버튼**으로 열려 있었다.
//
// 화면의 locked 는 filmGates 가 준 값이라 **지금 보고 있는 방식**만 본다. 그런데 시나리오는
// 두 방식이 공유하는 하나라 판정도 프로젝트 전체를 봐야 한다 — 옆 방식이 굽는 중이거나
// 그림 상한을 다 썼으면 이 방식 화면에서도 못 고친다. 서버는 그것을 막는데(scenarioLock)
// 화면은 몰라서 버튼을 열어 뒀다.
//
// ★ 값 판정은 lib/film/doc.js 의 scenarioLock 자체 테스트가 한다(tests/film-doc.test.js).
//   여기서는 화면이 **그 함수를 쓰는가**만 잰다 — 손으로 다시 계산하면 판정이 두 벌이 된다.
describe("시나리오 다시 쓰기 — 서버와 같은 판정을 쓴다", () => {
  it("★ 화면이 scenarioLock 을 import 한다 — 판정을 손으로 다시 적지 않는다", () => {
    expect(page).toMatch(/import\s*\{[^}]*scenarioLock[^}]*\}\s*from/);
  });

  it("★ 시나리오 버튼이 그 값으로 잠긴다", () => {
    // 버튼의 disabled 가 locked 하나만 보고 있으면 안 된다
    expect(page).toMatch(/scenarioLock\(/);
    expect(page).toMatch(/disabled=\{[^}]*scenarioLocked[^}]*\}/);
  });
});

// ★★ film 화면이 조건을 안 보내서 전부 기본값으로 떨어지고 있었다(2026-08-19).
//
// 실측: 야구단 굿즈 광고인데 mood 가 `premium`("고급스러운")으로 박혀 모델이 베이지
// 코트에 정장 바지를 입고 나왔다 — 사장님이 고른 값이 아니라 화면이 안 보내서 생긴
// 기본값이다. lib/ad/options.js:79 에 그 위험이 적혀 있다: "조용히 기본값으로
// 떨어뜨리면 사장님이 고른 것과 만들어지는 것이 달라지고, 그 차이를 아무도 못 알아본다."
//
// ★ 길이·화질·모델은 **여전히 서버가 박는다** — 두 방식의 조건이 같아야 비교가 성립한다.
//   여는 것은 "무엇을 만드는가"(컨셉·분위기·화풍·언어)이지 "어떻게 굽는가"가 아니다.
describe("film 화면이 조건을 고른다", () => {
  for (const [label, symbol] of [["컨셉", "AD_FORMATS"], ["분위기", "AD_MOODS"], ["화풍", "AD_STYLES"], ["언어", "AD_LANGS"]]) {
    it(`★ ${label} 목록을 표에서 돌려 그린다 — 손으로 적으면 표가 늘 때 빠진다`, () => {
      // ★ import 줄에도 같은 이름이 나오므로 **map 호출**을 직접 찾는다.
      //   AD_LANGS 만 hidden 을 거른 뒤 map 한다.
      const call = symbol === "AD_LANGS"
        ? "{AD_LANGS.filter((l) => !l.hidden).map("
        : "{" + symbol + ".map(";
      expect(page).toContain(call);
    });
  }

  it("★ 고른 값을 서버에 보낸다 — 안 보내면 기본값으로 조용히 떨어진다", () => {
    const body = page.slice(page.indexOf("settings: {"), page.indexOf("settings: {") + 300);
    for (const k of ["format", "mood", "style", "narration_lang"]) expect(body).toContain(k);
  });

  it("★ 길이·화질·모델은 여전히 화면에 없다 — 두 방식의 조건이 같아야 비교가 성립한다", () => {
    expect(page).not.toMatch(/AD_MODELS/);
    expect(page).not.toMatch(/adSecondsFor|adResolutionsFor/);
  });
});
