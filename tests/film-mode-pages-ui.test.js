// 방식별 단계 화면 셋(3 그림 · 4 영상 · 5 완성)을 잰다.
//
// 이 저장소에는 렌더 하네스가 없어서 **소스 문자열**로 잰다. 그래서 주석을 먼저 걷는다 —
// 안 걷으면 "왜 그렇게 했는지"를 적어 둔 주석이 단정을 통과시켜 **거짓 초록**이 난다
// (2026-08-20 에 이 저장소에서 세 번 밟았다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = (p) => strip(readFileSync(p, "utf8"));

describe("3 그림", () => {
  const s = () => src("app/film/[id]/[mode]/images/page.js");

  it("★ 문 판정은 lib/film/gates 하나다 — 버튼마다 조건을 따로 적으면 한 곳이 빠진다", () => {
    expect(s()).toMatch(/filmGates/);
  });

  it("★ 방식 칩이 둘 다 있고, 같은 id 를 들고 건너간다 — 한 시나리오로 두 방식을 굽는다", () => {
    expect(s()).toMatch(/FILM_MODES/);
    expect(s()).toMatch(/filmStepHref/);
  });

  // 계획서는 `/only:/` 로 재라고 적었지만 그것은 **표기 하나**만 잡는다(축약 표기
  // `{ mode, only }` 로 쓰면 코드가 옳은데도 빨갛다). 재야 하는 것은 "카드가 자기 키
  // 하나만 보내는가"이므로 그것을 그대로 잰다.
  it("★ 그림 카드마다 다시 만들기가 있다 — only 로 그 축만 보낸다", () => {
    expect(s()).toMatch(/\bonly\b/);
    expect(s()).toMatch(/redraw\(\[im\.key\]\)/);
  });

  it("★ 시나리오 판이 다르면 카드별 다시 만들기를 잠근다 — 서버가 던지기 전에 막는다", () => {
    expect(s()).toMatch(/scenarioTries/);
  });

  it("★ 프로젝트는 레이아웃이 읽은 것을 나눠 쓴다 — 자기 fetch 를 새로 만들지 않는다", () => {
    expect(s()).toMatch(/useFilmProject/);
  });
});

describe("4 영상", () => {
  const s = () => src("app/film/[id]/[mode]/video/page.js");

  it("★ 폴링은 lib/poll 을 쓴다", () => {
    expect(s()).toMatch(/startPolling/);
    expect(s()).not.toMatch(/setInterval\(/);
  });

  it("★ 굽기는 접수(202)된 때만 폴링을 시작한다 — 402·409 에도 두드리면 헛돈다", () => {
    expect(s()).toMatch(/if \(res\.ok\) beginPolling\(\)/);
  });

  // ★★ 방식을 건너가면 이 화면은 마운트된 채로 남는다. 돌던 폴링의 onTick 은 **옛 mode 를
  //   클로저에 가두고** 있어서, 떼지 않으면 다음 회차가 옆 방식의 값으로 화면을 채운다 —
  //   두 방식을 나란히 재는 이 기능의 판정이 그 자리에서 오염된다.
  it("★★ 방식이 바뀌면 폴링을 떼고 live 를 비운다 — [mode, id] effect", () => {
    const b = s();
    expect(b).toMatch(/stopRef\.current\s*=\s*null/);
    expect(b).toMatch(/\}, \[mode, id\]\)/);
  });
});

describe("5 완성", () => {
  it("★ 다른 방식으로 굽기와 보관함으로 나가는 길이 있다", () => {
    const s = src("app/film/[id]/[mode]/done/page.js");
    expect(s).toMatch(/archive/);
    expect(s).toMatch(/FILM_MODES/);
  });
});
