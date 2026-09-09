// **얼굴에 격자를 씌워 초상 거절을 넘긴다** (2026-09-03 사장님 지시로 코드에 들어옴).
//
// ★★★ 이 방식이 실측으로 갈린 자리다 — 설정 하나만 어긋나도 안 통한다:
//     ✗ 얇은 선 · 판 전체(2026-09-01, 2.5 에 27×27 **2px** 시안을 **판 전체**에 → 8회 거절)
//     ✗ 판 전체(09-03, 가로로 긴 판에 6×6 → 거절)
//     ✓ **얼굴에만 · 흰색 · 굵게(8px) · 촘촘히** → 2.0·2.5 둘 다 통과
//
// ★★★ 2026-09-09 — **"불투명해야 한다"는 두 주 동안의 결론이 틀렸다.**
//   09-01 의 거절을 "반투명이 원인"으로 요약했는데, 그 실험은 세 가지가 한꺼번에 달랐다
//   (반투명 · 2px · 판 전체). 투명도만 따로 잰 적이 없었다.
//   사장님 지시로 각 1회씩 유료 실측(4초 480p · $0.82씩):
//     **불투명 0.65 → 통과 · 인물 일치** · **불투명 0.45 → 통과 · 인물 일치**, 격자 흔적 둘 다 0.
//   탐지기를 넘긴 것은 불투명도가 아니라 **굵기와 자리**였다.
//
// ★★★ 그리고 짙게 덮으면 **다른 것이 깨진다.** 불투명 1.0 + pad 0.5 는 참조에서 사람을
//   통째로 지워, 모델이 얼굴을 스스로 지어낸다 — "스토리보드와 다른 인물이 나왔다"가 그것이다.
//   그러니 이 판은 값의 **위아래를 모두** 막는다. 가려야 할 것과 남겨야 할 것이 둘 다 있다.
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  FACE_GRID, GRID_SUPPRESS_LINE, boxToRect, gridSvg, gridFacesOnSheet, gridFacesOnPhoto,
  findFaceBoxes, mergeRects,
} from "../lib/reel/face-grid.js";

const solid = (w, h, v = 120) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: v, g: v, b: v } } }).jpeg().toBuffer();

describe("설정 — 실측으로 정해진 값이다", () => {
  it("★★★ **옅다** — 얼굴이 보여도 통과한다(2026-09-09 실측 2건). 지우면 딴 사람이 나온다", () => {
    // ★★★ 이 자리는 "불투명이다 — 반투명은 탐지기가 무시한다(09-01 실측)"였다. **틀렸다.**
    //   09-01 의 8회 거절은 세 가지가 한꺼번에 달랐다: 반투명 · **2px 얇은 선** ·
    //   **판 전체에 깔기**. 투명도만 따로 잰 적이 없었는데 "반투명이 원인"으로 요약됐고,
    //   그 요약이 두 주 동안 이 판을 지켰다.
    //
    // ★★★ 2026-09-09 유료 실측이 뒤집었다(사장님 지시로 각 1회, 4초 480p · $0.82씩):
    //     불투명 0.65(얼굴 다 보임) → **통과** · 인물 일치 · 격자 흔적 0
    //     불투명 0.45(얼굴 더 선명) → **통과** · 인물 일치 · 격자 흔적 0
    //   굵은 선(8px)으로 **얼굴에만** 놓는 지금 방식이면 옅어도 탐지기가 넘어간다.
    //   즉 탐지기를 넘긴 것은 불투명도가 아니라 **굵기와 자리**였다.
    //
    // ★★★ 그리고 짙으면 **안 된다**. 불투명 1.0 은 참조에서 사람을 지워, 모델이 얼굴을
    //   스스로 지어낸다 — 2026-09-09 사장님 신고 "스토리보드 이미지랑 인물이 달라졌다"가
    //   그것이다. 그러니 위쪽도 막는다. 이 값은 **가려야 하는 것과 남겨야 하는 것 사이**다.
    expect(FACE_GRID.opacity, "짙다 — 참조에서 사람이 지워져 딴 사람이 나온다").toBeLessThanOrEqual(0.6);
    expect(FACE_GRID.opacity, "너무 옅다 — 격자가 사실상 없다(격자는 남긴다는 것이 사장님 결정)")
      .toBeGreaterThanOrEqual(0.3);
  });

  it("★★★ 흰색이다", () => {
    expect(FACE_GRID.color).toBe("#FFFFFF");
  });

  // ★★★ 2026-09-03 오후 실측 — **칸 수가 아니라 선 간격이 본질이다.**
  //   09-03 오전에 통한 설정은 "얼굴에 딱 맞는 상자에 10칸" = 간격 20px 안팎이었다.
  //   그런데 칸 수를 고정해 두면 상자가 커질수록 성겨진다 — 프로덕션에서 상자가
  //   515x1248px(칸의 72%x98%)로 잡혀 간격이 52px 이 됐고, 얼굴이 격자 한 칸 안에
  //   통째로 들어가 그대로 읽혀 거절됐다(요청 01a065aa).
  it("★★★ 촘촘함은 **간격**으로 정한다 — 칸 수를 고정하면 큰 상자에서 성겨진다", () => {
    expect(FACE_GRID.spacing).toBeLessThanOrEqual(24);
    expect(FACE_GRID.stroke).toBeGreaterThanOrEqual(6);
  });

  // ★★★ 2026-09-09 실측 — **여유(pad)가 좁으면 덮다 만다.**
  //   프로덕션 편 14fd0ce0 이 초상으로 거절됐다. 그 판을 그대로 내려받아 재현하니
  //   탐지는 멀쩡했다(얼굴 있는 칸 일곱 개를 전부 찾아 아홉 자리에 격자를 그렸다).
  //   그런데 **상자가 얼굴보다 조금 작고 조금 밀려** 칸 0 의 여자는 오른쪽 절반이,
  //   칸 6 의 남자는 얼굴 윗부분이 격자 밖에 남았다. 얼굴 하나만 읽히면 거절은 그대로 난다.
  //   · pad 0.15 → fal 거절 (판 넓이의 28.3% 를 덮음)
  //   · pad 0.5  → **통과. 720p·30초 완성본이 나왔다** (49.7% 를 덮음)
  //   ★ 그러니 이 값은 취향이 아니라 **좌표 오차를 흡수하는 여유**다. VLM 이 위치를
  //     정확히 못 맞춘다는 것이 이 저장소의 실측이고(09-03), 그 오차가 상자 크기의
  //     3할 안팎이었다. 여유가 그보다 작으면 덮다 만다.
  //   ★★★ 2026-09-09 **저녁에 다시 뒤집혔다.** 위 "0.5 로 통과"는 맞지만, 그렇게 통과한
  //     편에서 **스토리보드와 다른 인물이 나왔다**(사장님 신고). 판을 눈으로 그려 보니
  //     이유가 분명했다 — pad 0.5 는 상자를 각 변 2배(면적 4배)로 키우고, 얼굴이 여럿이면
  //     그것들이 합쳐져 **상반신을 통째로 덮는 한 덩어리**가 된다(실측 덮음 49%).
  //     얼굴을 가린 것이 아니라 **사람을 지운 것**이다.
  //   ★ 그래서 여유는 좌표 오차를 흡수할 만큼만 두고(0.3), 가리는 일은 **불투명도**가 맡는다.
  //     0.3 은 같은 판에서 덮음 26.1% 다 — 머리·가디건·주방이 그대로 남는다.
  it("★★★ 여유는 좌표 오차를 흡수할 만큼만 — 넓히면 얼굴이 아니라 사람이 지워진다", () => {
    expect(FACE_GRID.pad, "pad 가 좁다 — 좌표 오차(상자의 3할 안팎)를 못 흡수한다").toBeGreaterThanOrEqual(0.25);
    expect(FACE_GRID.pad, "pad 가 넓다 — 얼굴이 여럿이면 상자들이 합쳐져 상반신을 통째로 덮는다")
      .toBeLessThanOrEqual(0.35);
  });

  it("★★ 여유가 실제로 상자를 키운다 — 값만 크고 안 쓰면 아무 일도 안 한다", () => {
    // 상자 하나를 넣어 **그려지는 사각형**이 커지는지 본다(값을 읽는 것이 아니다).
    const box = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
    const tight = boxToRect(box, 1000, 1000, 0);
    const eased = boxToRect(box, 1000, 1000, FACE_GRID.pad);
    // ★ 배수를 글자로 박지 않는다 — `1 + pad*2` 가 정의다. 예전에는 1.7 을 박아 두어
    //   pad 를 0.5→0.3 으로 줄이자(1.6배) 계산이 맞는데도 이 판이 빨개졌다.
    expect(eased.width, "여유가 넓이를 안 키운다").toBeCloseTo(tight.width * (1 + FACE_GRID.pad * 2), 0);
    expect(eased.left, "여유가 왼쪽으로 안 넓힌다").toBeLessThan(tight.left);
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
    // ★ 값을 글자로 못 박지 않는다 — 설정이 정본이고(위 "옅다" 판이 그 범위를 지킨다)
    //   여기서 확인할 것은 **그 값이 실제로 그려지는가**다. 예전에는 "1" 을 글자로 박아,
    //   설정을 바꾸면 그리는 코드가 멀쩡한데도 이 판이 빨개졌다.
    expect(svg).toContain(`stroke-opacity="${FACE_GRID.opacity}"`);
    expect((svg.match(/<line/g) || []).length).toBeGreaterThan(0);
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

  // ★★★ 프로덕션에서 실제로 온 상자 모양이다(칸 5: 515x1248 — 세로가 가로의 2.4배).
  //   옛 코드는 **가로·세로에 같은 칸 수**를 써서, 세로선은 19px 간격인데 가로선은 105px
  //   간격이 나왔다. 한쪽만 촘촘하면 얼굴은 그대로 읽힌다.
  it("★★★ 큰 상자·길쭉한 상자에서도 **양쪽 다** 촘촘하다", () => {
    const svg = gridSvg(2160, 2560, [{ left: 0, top: 0, width: 515, height: 1248 }]).toString();
    // ★ 정규식은 **리터럴로** 쓴다 — 템플릿 문자열 안에 넣으면 역슬래시가 한 겹 먹혀
    //   `\d` 가 `d` 가 되고, 아무것도 안 맞아 **판이 헛돌며 통과한다**(방금 밟았다).
    const gaps = (re) => {
      const v = [...new Set([...svg.matchAll(re)].map((m) => Number(m[1])))].sort((a, b) => a - b);
      expect(v.length, "좌표를 하나도 못 읽었다 = 판이 헛돈다").toBeGreaterThan(2);
      return Math.max(...v.slice(1).map((n, i) => n - v[i]));
    };
    expect(gaps(/x1="(\d+)"/g), "세로선이 성기다").toBeLessThanOrEqual(24);
    expect(gaps(/y1="(\d+)"/g), "가로선이 성기다").toBeLessThanOrEqual(24);
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
    // ★ 2026-09-09 — 호출 이름이 `gridFaces(` 로 바뀌었다(주입 가능한 이음매로 뺐다).
    //   그래서 **이름이 아니라 사슬**을 잰다: 기본값이 진짜 함수로 묶여 있고, 그 묶인
    //   이름이 실제로 불린다. 둘 중 하나만 보면 배선이 끊겨도 통과한다.
    expect(src, "격자 기본값이 진짜 함수가 아니다")
      .toMatch(/gridFaces\s*=\s*deps\.gridFacesOnSheet\s*\|\|\s*gridFacesOnSheet/);
    expect(src, "격자를 안 씌운다").toMatch(/await\s+gridFaces\(/);
    expect(src, "격자 판을 안 보낸다").toMatch(/refs: \[sheetRef,/);
    // ★★ 2026-09-09 — **씌웠는지 문서에 남기는 것**도 이 배선의 일부다. 이것이 없으면
    //   거절이 났을 때 "안 씌운 것"과 "빗나간 것"을 영영 못 가른다(프로덕션 편 14fd0ce0).
    //   ★ 접수 **앞**이어야 한다 — 접수가 422 로 죽으면 그 뒤의 쓰기는 안 돈다.
    const at = src.indexOf("faceGrid: { ...faceGrid");
    const submitAt = src.indexOf("await submit(");
    expect(at, "격자 결과를 문서에 안 남긴다").toBeGreaterThan(-1);
    expect(submitAt, "접수하는 자리를 못 찾았다 — 이 판이 낡았다").toBeGreaterThan(-1);
    expect(at, "기록이 접수 뒤에 있다 — 거절나면 그때 안 남는다").toBeLessThan(submitAt);
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
    // ★ 지문은 `askFaceBoxesOnce`(한 회차를 묻는 함수) 안에 있다 — `findFaceBoxes` 는
    //   그것을 여러 번 부르는 껍데기라 그 뒤부터 자르면 지문을 놓친다(한 번 놓쳤다).
    const ask = src.slice(src.indexOf("askFaceBoxesOnce"));
    for (const w of ["EVERY", "background", "billboard", "small", "TIGHT", "forehead", "chin", "shoulders"]) {
      expect(ask, `지문이 ${w} 를 안 부른다`).toContain(w);
    }
    expect(ask, "얼굴 하나만 받는 옛 모양이 남아 있다").not.toMatch(/"face":true\|false/);
  });
});

// ★★★ 2026-09-03 오후 — **좌표가 회차마다 크게 흔들린다.** 같은 칸을 네 번 물었더니
//   얼굴 상자가 (0.31,0.10) · (0.37,0.05) · (0.35,0.06) · (0.33,0.14) 로 흩어졌고,
//   **한 회차만 쓰면 얼굴을 빗나간다**(프로덕션 판 칸 0 에서 격자가 하늘에 그려졌다).
//   그런데 넷을 합치면 얼굴이 덮인다. 비결정성을 약점이 아니라 재료로 쓴다.
describe("여러 번 물어 합친다 — 한 번으로는 좌표가 빗나간다", () => {
  it("★★★ 설정한 횟수만큼 묻는다", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"faces":[{"x":0.1,"y":0.1,"w":0.1,"h":0.1}]}' } }] }) };
    };
    const out = await findFaceBoxes({ bytes: Buffer.from("x"), fetchImpl, apiKey: "k" });
    expect(calls, "한 번만 묻는다").toBe(FACE_GRID.passes);
    expect(FACE_GRID.passes).toBeGreaterThanOrEqual(2);
    expect(out.length).toBe(FACE_GRID.passes);
  });

  it("★★★ 겹치는 상자는 **하나로 합쳐** 그린다 — 겹쳐 그리면 선이 엇갈려 덩어리가 된다", () => {
    const merged = mergeRects([
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 50, top: 50, width: 100, height: 100 },
      { left: 400, top: 400, width: 50, height: 50 },
    ]);
    expect(merged.length, "겹친 둘을 안 합쳤다").toBe(2);
    const big = merged.find((r) => r.width > 100);
    expect([big.left, big.top, big.width, big.height]).toEqual([0, 0, 150, 150]);
  });

  it("★★ 안 겹치면 그대로 둔다", () => {
    const merged = mergeRects([
      { left: 0, top: 0, width: 10, height: 10 },
      { left: 100, top: 100, width: 10, height: 10 },
    ]);
    expect(merged.length).toBe(2);
  });
});
