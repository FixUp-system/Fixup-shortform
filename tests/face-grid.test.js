// **얼굴에 격자를 씌워 초상 거절을 넘긴다** (2026-09-03 사장님 지시로 코드에 들어옴).
//
// ★★★ 이 방식이 실측으로 갈린 자리다 — 설정 하나만 어긋나도 안 통한다:
//     ✗ 반투명(2026-09-01, 2.5 에 27×27 시안 반투명 → 8회 전부 거절)
//     ✗ 판 전체(09-03, 가로로 긴 판에 6×6 → 거절)
//     ✓ **얼굴에만 · 흰색 · 불투명 · 촘촘히** → 2.0·2.5 둘 다 통과
//   그래서 이 판은 **설정값 자체**를 못 박는다. 누가 "좀 옅게" 바꾸면 조용히 안 통한다.
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  FACE_GRID, GRID_SUPPRESS_LINE, boxToRect, gridSvg, gridFacesOnSheet, gridFacesOnPhoto,
} from "../lib/reel/face-grid.js";

const solid = (w, h, v = 120) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: v, g: v, b: v } } }).jpeg().toBuffer();

describe("설정 — 실측으로 정해진 값이다", () => {
  it("★★★ 불투명이다 — 반투명은 탐지기가 무시한다(2026-09-01 실측)", () => {
    expect(FACE_GRID.opacity).toBe(1);
  });

  it("★★★ 흰색이다", () => {
    expect(FACE_GRID.color).toBe("#FFFFFF");
  });

  it("★★ 촘촘하고 굵다 — 얇으면 얼굴이 그대로 읽힌다", () => {
    expect(FACE_GRID.cells).toBeGreaterThanOrEqual(8);
    expect(FACE_GRID.stroke).toBeGreaterThanOrEqual(6);
  });

  it("★★ 억제 꼬리가 격자·오버레이·메쉬를 모두 부른다 — 하나만 적으면 다른 이름으로 남는다", () => {
    for (const w of ["grid", "overlay", "mesh"]) {
      expect(GRID_SUPPRESS_LINE.toLowerCase()).toContain(w);
    }
  });
});

describe("boxToRect — 얼굴 상자를 픽셀로", () => {
  it("★★ 여유를 준다 — 좌표가 조금 빗나가도 덮인다", () => {
    const r = boxToRect({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 1000, 1000, 0.15);
    expect(r.width).toBeGreaterThan(200);
    expect(r.left).toBeLessThan(400);
  });

  it("★★★ 이미지 밖으로 안 나간다 — 나가면 sharp 가 던져 굽기가 통째로 죽는다", () => {
    const r = boxToRect({ x: 0.9, y: 0.9, w: 0.3, h: 0.3 }, 100, 100, 0.5);
    expect(r.left + r.width).toBeLessThanOrEqual(100);
    expect(r.top + r.height).toBeLessThanOrEqual(100);
  });

  it("★ 크기가 0 이 안 된다", () => {
    const r = boxToRect({ x: 0, y: 0, w: 0.001, h: 0.001 }, 100, 100, 0);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });
});

describe("gridSvg — 그리는 것", () => {
  it("★★ 사각형마다 선이 그려지고 불투명이다", () => {
    const svg = gridSvg(1000, 1000, [{ left: 10, top: 10, width: 500, height: 500 }]).toString();
    expect(svg).toContain('stroke="#FFFFFF"');
    expect(svg).toContain('stroke-opacity="1"');
    expect((svg.match(/<line/g) || []).length).toBe((FACE_GRID.cells + 1) * 2);
  });

  // ★★★ 2026-09-03 오후 — 여러 얼굴을 덮게 하자 **작은 얼굴이 흰 덩어리**가 됐다.
  //   48px 짜리 배경 얼굴에 10칸·굵기 8 이면 선 사이 간격이 음수다 — 격자가 아니라 페인트다.
  //   판을 덮는 것이 목적인데 그림을 지워 버리면 모델이 그 칸을 못 읽는다.
  //   ★ 굵기는 **실측값을 지키고**(얇으면 탐지기가 얼굴을 그대로 읽는다) 칸 수를 줄인다.
  it("★★★ 작은 얼굴에서도 격자로 남는다 — 선이 붙으면 흰 덩어리가 되어 그림을 버린다", () => {
    const svg = gridSvg(400, 400, [{ left: 0, top: 0, width: 48, height: 48 }]).toString();
    const xs = [...svg.matchAll(/x1="(\d+)"/g)].map((m) => Number(m[1]));
    const verticals = [...new Set(xs)].sort((a, b) => a - b);
    const gaps = verticals.slice(1).map((v, i) => v - verticals[i]);
    expect(Math.min(...gaps), "선 간격이 굵기보다 좁다 = 덩어리").toBeGreaterThanOrEqual(FACE_GRID.stroke);
  });

  it("★★ 큰 얼굴에서는 실측 칸 수를 그대로 쓴다", () => {
    const svg = gridSvg(1000, 1000, [{ left: 0, top: 0, width: 600, height: 600 }]).toString();
    expect((svg.match(/<line/g) || []).length).toBe((FACE_GRID.cells + 1) * 2);
  });

  it("★ 사각형이 여럿이면 그룹도 여럿이다", () => {
    const svg = gridSvg(100, 100, [
      { left: 0, top: 0, width: 40, height: 40 },
      { left: 50, top: 50, width: 40, height: 40 },
    ]).toString();
    expect((svg.match(/<g /g) || []).length).toBe(2);
  });
});

describe("판에 씌우기 — 얼굴을 못 찾으면 손대지 않는다", () => {
  it("★★★ 얼굴이 없으면 **원본 그대로** 돌려준다 — 아무 데나 씌우면 그림만 버린다", async () => {
    const bytes = await solid(600, 400);
    const out = await gridFacesOnSheet({
      bytes, cells: 2, grid: { rows: 1, cols: 2 },
      deps: { findFaceBoxes: async () => [] },
    });
    expect(out.faces).toBe(0);
    expect(out.bytes).toBe(bytes);
  });

  it("★★★ 얼굴을 찾으면 씌우고 **몇 곳인지** 알려 준다 — 부르는 쪽이 꼬리를 붙일지 정한다", async () => {
    const bytes = await solid(600, 400);
    const out = await gridFacesOnSheet({
      bytes, cells: 2, grid: { rows: 1, cols: 2 },
      deps: { findFaceBoxes: async () => [{ x: 0.3, y: 0.3, w: 0.4, h: 0.4 }] },
    });
    expect(out.faces).toBe(2);
    expect(out.bytes).not.toBe(bytes);
    const m = await sharp(out.bytes).metadata();
    expect([m.width, m.height], "판 크기가 달라졌다").toEqual([600, 400]);
  });

  it("★★ 사진 한 장 갈래도 같은 규율이다", async () => {
    const bytes = await solid(300, 500);
    const none = await gridFacesOnPhoto({ bytes, deps: { findFaceBoxes: async () => [] } });
    expect(none.bytes).toBe(bytes);
    const some = await gridFacesOnPhoto({
      bytes, deps: { findFaceBoxes: async () => [{ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }] },
    });
    expect(some.faces).toBe(1);
    expect(some.bytes).not.toBe(bytes);
  });
});

describe("배선 — 굽기가 실제로 이 길을 지난다", () => {
  it("★★★ 통짜 굽기가 판에 격자를 씌우고, 씌웠을 때만 꼬리를 붙인다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/reel/pipeline.js", "utf8")
      .replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src, "격자를 안 씌운다").toMatch(/gridFacesOnSheet\(/);
    expect(src, "격자 판을 안 보낸다").toMatch(/refs: \[sheetRef\]/);
    expect(src, "꼬리를 조건 없이 붙이거나 아예 안 붙인다")
      .toMatch(/gridded \? `\$\{prompt\}[\s\S]{0,20}\$\{GRID_SUPPRESS_LINE\}` : prompt/);
  });
});

// ★★★ 2026-09-03 오후 — **실측으로 드러난 구멍.** 프로덕션 편 `00b1885a` 가 격자를 씌우고도
//   422(초상)로 거절됐다. 그 판을 그대로 내려받아 재현해 보니 원인이 둘이었다:
//     ① 칸 하나에 얼굴이 여럿인데 **한 개만** 돌려받았다(실측: 칸 0=3 · 칸 1=2 · 칸 5=2)
//     ② 같은 칸·같은 지문인데 **회차마다 답이 달랐다**(칸 3: 0개 → 1개)
//   덮다 만 판은 안 덮은 판과 같다 — 얼굴 하나가 남으면 거절은 그대로 난다.
describe("얼굴이 여럿인 칸 — 하나라도 남기면 거절은 그대로 난다", () => {
  it("★★★ 한 칸에 얼굴이 둘이면 **둘 다** 덮는다", async () => {
    const bytes = await solid(600, 400);
    const out = await gridFacesOnSheet({
      bytes, cells: 1, grid: { rows: 1, cols: 1 },
      deps: { findFaceBoxes: async () => [
        { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { x: 0.6, y: 0.6, w: 0.2, h: 0.2 },
      ] },
    });
    expect(out.faces, "칸 하나에서 얼굴 둘을 다 세지 않는다").toBe(2);
  });

  it("★★★ 사진 갈래도 얼굴을 여럿 덮는다", async () => {
    const bytes = await solid(400, 400);
    const out = await gridFacesOnPhoto({
      bytes, deps: { findFaceBoxes: async () => [
        { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
      ] },
    });
    expect(out.faces).toBe(2);
    expect(out.bytes).not.toBe(bytes);
  });

  it("★★ 얼굴 상자마다 격자 그룹이 하나씩 그려진다", async () => {
    const svg = gridSvg(200, 200, [
      { left: 0, top: 0, width: 40, height: 40 },
      { left: 60, top: 60, width: 40, height: 40 },
      { left: 120, top: 120, width: 40, height: 40 },
    ]).toString();
    expect((svg.match(/<g /g) || []).length).toBe(3);
  });

  it("★★★ 찾는 지문이 **배경·광고판·작은 얼굴**까지 부른다 — 이 판의 주제가 광고판 속 인물이다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/reel/face-grid.js", "utf8");
    const ask = src.slice(src.indexOf("findFaceBoxes"));
    for (const w of ["EVERY", "background", "billboard", "small"]) {
      expect(ask, `지문이 ${w} 를 안 부른다`).toContain(w);
    }
    expect(ask, "얼굴 하나만 받는 옛 모양이 남아 있다").not.toMatch(/"face":true\|false/);
  });
});
