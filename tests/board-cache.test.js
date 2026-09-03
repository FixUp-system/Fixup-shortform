// 보드 캐시 (2026-09-03 사장님 지적: "매번 불러오는 데 시간이 걸린다").
//
// 보드는 저장하지 않고 요청마다 그린다 — 컷을 고치면 다음에 열 때 최신이라는 성질을 얻는
// 대신, 화면을 다시 열 때마다 다시 그렸다(캐시가 60초뿐이었다).
// 주소에 **내용 지문**을 실으면 컷이 그대로인 동안 같은 주소라 캐시가 맞고, 컷을 고치면
// 주소가 달라져 자동으로 새로 그린다 — **무효화를 손으로 하지 않는다.**
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { boardKey } from "../lib/reel/board-key.js";

const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const cut = (over = {}) => ({ idx: 0, shows: "a", action: "b", camera: "c", sentence: "d", seconds: 3, image: { url: "/api/uploads/x.jpg" }, ...over });

describe("boardKey — 내용이 그대로면 같은 값", () => {
  it("★★★ 같은 컷이면 같다", () => {
    expect(boardKey([cut()])).toBe(boardKey([cut()]));
  });

  it("★★★ 보드에 그려지는 것이 바뀌면 달라진다 — 안 바뀌면 낡은 그림이 굳는다", () => {
    const base = boardKey([cut()]);
    for (const over of [
      { shows: "다른 장면" }, { action: "다른 움직임" }, { camera: "다른 카메라" },
      { sentence: "다른 대사" }, { seconds: 5 }, { image: { url: "/api/uploads/y.jpg" } },
    ]) {
      expect(boardKey([cut(over)]), `${Object.keys(over)[0]} 가 바뀌어도 같다`).not.toBe(base);
    }
  });

  it("★★ 컷 수가 달라지면 달라진다", () => {
    expect(boardKey([cut(), cut({ idx: 1 })])).not.toBe(boardKey([cut()]));
  });

  it("★ 빈 값·이상한 값에도 안 던진다 — 화면이 그리는 도중에도 불린다", () => {
    expect(typeof boardKey([])).toBe("string");
    expect(typeof boardKey(null)).toBe("string");
    expect(typeof boardKey([null, undefined])).toBe("string");
  });
});

describe("배선 — 화면과 라우트가 맞물린다", () => {
  it("★★★ 화면이 주소에 지문을 싣는다", () => {
    const src = strip(readFileSync("app/reel/[id]/images/page.js", "utf8"));
    expect(src).toMatch(/board\?v=\$\{boardKey\(/);
  });

  it("★★★ 라우트는 지문이 있을 때만 오래 쥔다 — 옛 주소는 짧게", () => {
    const route = strip(readFileSync("app/api/reel/[id]/board/route.js", "utf8"));
    expect(route, "immutable 캐시가 없다").toMatch(/immutable/);
    expect(route, "지문 유무를 안 가린다").toMatch(/searchParams\.has\("v"\)/);
    expect(route, "지문 없는 주소까지 오래 쥔다").toMatch(/max-age=60/);
  });

  it("★★ 보드가 오는 동안 로딩을 보여 준다 — 빈 자리는 멈춘 화면으로 읽힌다", () => {
    const src = strip(readFileSync("app/reel/[id]/images/page.js", "utf8"));
    expect(src).toMatch(/onLoad=\{\(\) => setBoardReady\(true\)\}/);
    expect(src, "실패해도 덮개를 걷어야 영영 도는 표시가 안 남는다").toMatch(/onError=\{\(\) => setBoardReady\(true\)\}/);
    expect(src, "덮개가 boardReady 를 안 본다").toMatch(/drawingNow \|\| !boardReady/);
    expect(src, "주소가 바뀌어도 로딩으로 안 되돌린다").toMatch(/setBoardReady\(false\)/);
  });
});
