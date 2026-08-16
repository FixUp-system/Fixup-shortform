import { describe, it, expect } from "vitest";
import { ASPECTS, DEFAULT_ASPECT_ID, isAspect, aspectFor, sizeFor } from "../lib/aspects.js";
import { readFileSync } from "node:fs";

describe("ASPECTS — 영상 사이즈 표", () => {
  it("id 가 중복되지 않고 라벨·치수를 갖는다", () => {
    const ids = ASPECTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ASPECTS) {
      expect(a.label, `${a.id} 에 라벨이 없다`).toBeTruthy();
      expect(a.width).toBeGreaterThan(0);
      expect(a.height).toBeGreaterThan(0);
    }
  });

  it("기본은 세로다 — 이 제품이 만드는 것이 숏폼이다", () => {
    expect(DEFAULT_ASPECT_ID).toBe("9:16");
  });

  // 합성이 쓰던 값과 같아야 한다. 달라지면 자막 크기·여백이 함께 어긋난다
  // (lib/subtitles.js 가 이 치수에서 파생한다).
  it("치수가 합성이 쓰던 것과 같다", () => {
    expect(sizeFor("9:16")).toEqual([1080, 1920]);
    expect(sizeFor("1:1")).toEqual([1080, 1080]);
    expect(sizeFor("16:9")).toEqual([1920, 1080]);
  });

  it("모르는 값은 기본으로 떨어진다 — 여기서 멈추면 완성본만 못 만든다", () => {
    expect(sizeFor("4:3")).toEqual([1080, 1920]);
    expect(sizeFor(undefined)).toEqual([1080, 1920]);
    expect(aspectFor("없는값").id).toBe("9:16");
  });

  it("닫힌 목록을 판정한다", () => {
    expect(isAspect("16:9")).toBe(true);
    expect(isAspect("4:3")).toBe(false);
    expect(isAspect(undefined)).toBe(false);
  });
});

describe("lib/aspects.js 는 fs 를 끌고 오지 않는다", () => {
  // 화면(자료 넣는 화면·②대본)이 이것을 import 한다. compose.js 계열이 섞이면 번들이 깨진다.
  it("import 가 없다", () => {
    const src = readFileSync("lib/aspects.js", "utf8");
    expect([...src.matchAll(/^\s*import\s.+$/gm)].map((m) => m[0])).toEqual([]);
  });
});

describe("비율 목록이 한 곳에만 있다", () => {
  // 같은 목록이 다섯 곳에 흩어져 있었다. 하나를 늘리면 나머지를 찾아 고쳐야 했고,
  // 빠뜨리면 화면에는 있는데 서버가 거절하거나 그 반대가 된다.
  const FILES = [
    "app/api/projects/route.js",
    "app/api/projects/[id]/cuts/route.js",
    "app/create/page.js",
    "lib/compose.js",
  ];

  for (const path of FILES) {
    it(`${path} 가 목록을 다시 적지 않는다`, () => {
      const src = readFileSync(path, "utf8");
      expect(src, `${path} 에 닫힌 목록이 또 있다`).not.toMatch(/\["9:16",\s*"1:1",\s*"16:9"\]/);
      expect(src, `${path} 가 치수를 또 적는다`).not.toContain("[1080, 1920]");
    });
  }
});
