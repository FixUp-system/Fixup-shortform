// ③그림을 **스토리보드 한 장**으로 — 격자로 그리고 칸을 잘라 컷에 꽂는다.
//
// 근거는 2026-08-24~25 실측이다(.superpowers/sdd/2026-08-21-reel-cut-r2v/progress.md 의
// 게이트 D·B): 격자는 읽기 순서를 지키고, 칸은 굽기 해상도보다 크고, 잘라낸 칸을 i2v 의
// 첫 프레임으로 그대로 쓸 수 있다. 값은 한 장 $0.401 대 컷별 아홉 장 $3.61 —
// **이 파일이 지키는 것은 그 "한 번"이다.**
//
// 여기서 재는 것 다섯:
//   1) 갈래 판정(planReelImages) — 격자 밖 칸 수(5·7·8)는 **컷별로 떨어진다**(던지지 않는다)
//   2) 크기 역산(storyboardImageSize) — 칸 하나가 굽기(720×1280)가 되도록, 긴 변 3840 상한
//   3) 자르기(cropStoryboardCells) — 칸 수·읽는 순서·9:16 가운데 자르기 (sharp 로 진짜 자른다)
//   4) 저장(saveStoryboardCells) — **우리 바이트**가 어디로 가고 어떤 URL 이 되는가
//   5) 굽기로 넘어가는 길(toFalImageUrl) — 비공개 URL 은 fal 이 못 읽는다 → data URI
import { describe, it, expect } from "vitest";
import { reelCutChoicesFor } from "../lib/reel/scenario-rules.js";
import sharp from "sharp";
import {
  planReelImages, storyboardGridFor, storyboardImageSize, buildStoryboardPrompt,
  cropStoryboardCells, saveStoryboardCells, STORYBOARD_CELL_LONG_SIDE,
} from "../lib/reel/storyboard.js";
import { toFalImageUrl } from "../lib/refs-io.js";
import { runReelClips } from "../lib/reel/pipeline.js";
import { getStore } from "../lib/store/index.js";
import { readFileSync } from "fs";

const cutsOf = (n, drawn = []) =>
  Array.from({ length: n }, (_, i) => ({
    idx: i,
    shows: `장면 ${i + 1}`,
    ...(drawn.includes(i) ? { image: { url: `https://f/${i}.png` } } : {}),
  }));

// ────────────────────────────────────────────────────────────────────────
// 1) 갈래 판정
// ────────────────────────────────────────────────────────────────────────
describe("planReelImages — 한 장인가 컷별인가", () => {
  it("격자에 떨어지는 칸 수 + 아무것도 안 그려졌으면 스토리보드 한 장이다", () => {
    const plan = planReelImages(cutsOf(9));
    expect(plan.mode).toBe("storyboard");
    // ★ 2026-08-25 — canvas 는 프리셋 이름이 아니라 **실제 치수 비**다(격자를 계산으로
    //   바꾸면서). rows·cols 가 계약이고, canvas 는 nano 갈래로 되돌아갈 때의 참고값이다.
    expect({ rows: plan.grid.rows, cols: plan.grid.cols }).toEqual({ rows: 3, cols: 3 });
    expect(plan.targets).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  // ★★ 2026-08-25 — 목록이 **화질마다 다르다**(reelCutChoicesFor). 기본(720p)에서는
  //   5·8·15 가 새로 열렸고 16 이 빠졌다 — 16 은 720p 칸(1280)을 어떻게 배치해도
  //   상한 3840 을 넘는다.
  it("그 화질이 여는 칸 수 전부가 한 장으로 간다", () => {
    for (const n of reelCutChoicesFor("720p")) {
      expect(planReelImages(cutsOf(n), null, { resolution: "720p" }).mode, `${n}컷`).toBe("storyboard");
    }
  });

  it("★ 화질이 넓으면 더 많이 열린다 — 480p 는 16컷도 한 장이다", () => {
    expect(planReelImages(cutsOf(16), null, { resolution: "480p" }).mode).toBe("storyboard");
    expect(planReelImages(cutsOf(16), null, { resolution: "720p" }).mode).toBe("percut");
  });

  // ★★ 완료 기준 2 — 던지지 않는다. 격자가 없으면 예전 방식(컷별)이 그대로 산다.
  // ★ 빈 칸이 생기는 수(7·11·13·14)는 **아직 안 연다**(사장님 결정: "빈칸이 없는 것만").
  //   그때는 예전처럼 컷별로 떨어진다 — 던지지 않는다.
  it("★ 아직 안 여는 칸 수는 컷별로 떨어진다 — 던지지 않는다", () => {
    for (const n of [7, 11, 13, 14]) {
      const plan = planReelImages(cutsOf(n), null, { resolution: "720p" });
      expect(plan.mode).toBe("percut");
      expect(plan.grid).toBe(null);
      expect(plan.targets).toHaveLength(n);
    }
  });

  // ★★ 완료 기준 3 — 한 칸 때문에 스토리보드를 다시 살 수는 없다.
  it("only(컷 하나 다시 그리기)는 격자에 떨어져도 컷별이다", () => {
    const plan = planReelImages(cutsOf(9), [4]);
    expect(plan.mode).toBe("percut");
    expect(plan.targets).toEqual([4]);
  });

  it("여러 칸이어도 전부가 아니면 컷별이다", () => {
    expect(planReelImages(cutsOf(9), [1, 2, 3]).mode).toBe("percut");
  });

  // ★★ 화면의 [전부 다시 만들기]는 only 에 **모든 idx** 를 실어 보낸다
  //   (app/reel/[id]/images/page.js) — 그것을 컷별로 읽으면 아홉 장 $3.61 이 다시 나간다.
  it("★ only 가 컷 전부면 스토리보드다 — [전부 다시 만들기]가 컷별로 새면 안 된다", () => {
    const plan = planReelImages(cutsOf(9, [0, 1, 2, 3, 4, 5, 6, 7, 8]), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(plan.mode).toBe("storyboard");
    expect(plan.targets).toHaveLength(9);
  });

  it("일부만 비어 있으면 컷별로 그 컷만 — 이미 그린 그림을 다시 사지 않는다", () => {
    const plan = planReelImages(cutsOf(9, [0, 1, 2, 3, 4, 5, 6, 7]));
    expect(plan.mode).toBe("percut");
    expect(plan.targets).toEqual([8]);
  });

  it("컷이 없으면 컷별·대상 0 이다", () => {
    expect(planReelImages([])).toEqual({ mode: "percut", grid: null, targets: [] });
  });

  it("storyboardGridFor 는 계산 하나만 본다 — 판정을 새로 만들지 않는다", () => {
    const g = storyboardGridFor(6, { resolution: "720p" });
    expect(g.rows * g.cols).toBe(6);
    // 빈 칸이 생기는 수는 아직 안 연다.
    expect(storyboardGridFor(7, { resolution: "720p" })).toBe(null);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 2) 크기 역산
// ────────────────────────────────────────────────────────────────────────
describe("storyboardImageSize — 칸 하나가 굽기 해상도가 되도록", () => {
  it("3×3 → 2160×3840 (칸 정확히 720×1280, 2026-08-24 실측)", () => {
    expect(storyboardImageSize(storyboardGridFor(9))).toEqual({ width: 2160, height: 3840 });
  });

  it("2×3(6칸) → 2160×2560 — 상한에 안 닿으면 그대로 곱한다", () => {
    expect(storyboardImageSize(storyboardGridFor(6))).toEqual({ width: 2160, height: 2560 });
  });

  it("긴 변 3840 을 넘지 않는다 — 넘으면 비율을 지킨 채 줄인다", () => {
    // ★ 2026-08-25 — 목록을 손으로 적지 않는다. 화질이 여는 칸 수를 그대로 돈다
    //   (720p 는 16 을 아예 안 열므로 옛 목록을 그대로 두면 없는 격자를 재게 된다).
    for (const n of reelCutChoicesFor("720p")) {
      const { width, height } = storyboardImageSize(storyboardGridFor(n, { resolution: "720p" }), "9:16", "720p");
      expect(Math.max(width, height)).toBeLessThanOrEqual(3840);
      expect(width % 8).toBe(0);
      expect(height % 8).toBe(0);
    }
  });

  it("칸의 긴 변 기준값은 굽기 해상도다(720×1280)", () => {
    expect(STORYBOARD_CELL_LONG_SIDE).toBe(1280);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 3) 자르기 — 진짜로 자른다
// ────────────────────────────────────────────────────────────────────────
// 격자 그림을 하나 만든다: 칸마다 다른 밝기의 회색. 읽는 순서를 픽셀로 확인하려는 것이다.
async function fakeSheet(rows, cols, cellW = 90, cellH = 160) {
  const w = cols * cellW, h = rows * cellH;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = 10 + (r * cols + c) * 20; // 칸 번호 → 밝기
      cells.push({
        input: await sharp({ create: { width: cellW, height: cellH, channels: 3, background: { r: v, g: v, b: v } } }).png().toBuffer(),
        left: c * cellW, top: r * cellH,
      });
    }
  }
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite(cells).png().toBuffer();
}

const grayOf = async (buf) => (await sharp(buf).resize(1, 1, { fit: "fill" }).raw().toBuffer())[0];

describe("cropStoryboardCells — 칸을 잘라낸다", () => {
  it("칸 수만큼 나오고 좌→우 위→아래 순서다", async () => {
    const grid = storyboardGridFor(6); // 2행 3열
    const cells = await cropStoryboardCells(await fakeSheet(grid.rows, grid.cols), grid);
    expect(cells).toHaveLength(6);
    const grays = [];
    for (const c of cells) grays.push(await grayOf(c));
    // 칸 1 이 가장 어둡고 칸 6 이 가장 밝다 = 왼쪽 위에서 오른쪽 아래로 읽었다
    for (let i = 1; i < grays.length; i++) expect(grays[i]).toBeGreaterThan(grays[i - 1]);
  });

  it("칸이 9:16 에서 어긋나면 가운데로 잘라 9:16 을 만든다", async () => {
    const grid = storyboardGridFor(3); // 1행 3열 · 칸이 9:16 에서 5% 어긋난다
    const sheet = await fakeSheet(1, 3, 100, 160); // 칸 100×160 = 0.625 (9:16 = 0.5625)
    const cells = await cropStoryboardCells(sheet, grid);
    for (const c of cells) {
      const m = await sharp(c).metadata();
      expect(Math.abs(m.width / m.height - 9 / 16)).toBeLessThan(0.01);
    }
  });

  // ★★ 2026-09-02 사장님 지시 — "개별 이미지 다운로드할 때 격자가 포함되는데 격자 없이".
  //   판 지문의 "Thin clean even gaps" 가 칸 사이에 흰 띠를 그리고, 격자 수학 그대로
  //   자르면 그 띠 절반씩이 칸 가장자리에 남았다(실측 720px 칸에 ~14px).
  it("★★★ 칸 사이 흰 골이 잘린 칸에 안 남는다 — 걷은 뒤 크기는 그대로다", async () => {
    const grid = storyboardGridFor(4); // 2행 2열
    const cellW = 180, cellH = 320, gap = 8; // 칸은 9:16 정확 · 골 8px = 폭의 4.4%(실측 ~2%와 같은 자리, 상한 5% 안)
    const panels = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      panels.push({
        input: await sharp({ create: { width: cellW - gap * 2, height: cellH - gap * 2, channels: 3, background: { r: 120, g: 120, b: 120 } } }).png().toBuffer(),
        left: c * cellW + gap, top: r * cellH + gap,
      });
    }
    // 바탕이 흰 판 = 칸 둘레의 골이 전부 흰 띠다
    const sheet = await sharp({ create: { width: cellW * 2, height: cellH * 2, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite(panels).png().toBuffer();
    const cells = await cropStoryboardCells(sheet, grid);
    for (const cell of cells) {
      const { data, info } = await sharp(cell).greyscale().raw().toBuffer({ resolveWithObject: true });
      const W = info.width, H = info.height;
      expect([W, H], "골을 걷어도 칸 크기는 격자 수학 그대로여야 한다").toEqual([cellW, cellH]);
      const colAvg = (x) => { let s = 0; for (let y = 0; y < H; y++) s += data[y * W + x]; return s / H; };
      const rowAvg = (y) => { let s = 0; for (let x = 0; x < W; x++) s += data[y * W + x]; return s / W; };
      for (const v of [colAvg(0), colAvg(W - 1), rowAvg(0), rowAvg(H - 1)]) {
        expect(v, "가장자리에 흰 골이 남아 있다").toBeLessThan(235);
      }
    }
  });

  it("★ 진짜 내용은 안 걷는다 — 균일하지 않은 밝은 가장자리(하늘·흰 벽)는 남는다", async () => {
    const grid = storyboardGridFor(4);
    const cellW = 180, cellH = 320;
    // 골 없는 판: 칸 전체가 노이즈 있는 밝은 회색(평균 ~240, 분산 큼)
    const px = Buffer.alloc(cellW * 2 * cellH * 2 * 3);
    for (let i = 0; i < px.length; i += 3) {
      const v = 210 + ((i / 3) % 60); // 210~269 를 오르내린다 → 분산이 크다
      px[i] = px[i + 1] = px[i + 2] = Math.min(255, v);
    }
    const sheet = await sharp(px, { raw: { width: cellW * 2, height: cellH * 2, channels: 3 } }).png().toBuffer();
    const cells = await cropStoryboardCells(sheet, grid);
    const m = await sharp(cells[0]).metadata();
    expect([m.width, m.height]).toEqual([cellW, cellH]);
  });

  it("3×3 격자를 실제 크기로 자르면 칸이 굽기 해상도(720×1280)다", async () => {
    const grid = storyboardGridFor(9);
    const { width, height } = storyboardImageSize(grid);
    const sheet = await sharp({ create: { width, height, channels: 3, background: { r: 20, g: 20, b: 20 } } }).png().toBuffer();
    const cells = await cropStoryboardCells(sheet, grid);
    const m = await sharp(cells[0]).metadata();
    expect([m.width, m.height]).toEqual([720, 1280]);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 4) 저장 — 우리 바이트가 어디로 가는가
// ────────────────────────────────────────────────────────────────────────
describe("saveStoryboardCells — 우리 바이트를 어디에 두는가", () => {
  it("비공개 uploads 버킷에 올리고 /api/uploads/<이름> 을 돌려준다", async () => {
    const cells = [Buffer.from("a"), Buffer.from("b")];
    const urls = await saveStoryboardCells(cells, "u-1");
    expect(urls).toHaveLength(2);
    for (const u of urls) expect(u).toMatch(/^\/api\/uploads\/[0-9a-f-]+\.jpg$/);
    // 바이트가 실제로 버킷에 있다
    const key = urls[0].split("/").pop();
    expect(await getStore().getObject("uploads", key)).toEqual(cells[0]);
    // 주인 기록이 없으면 /api/uploads/[name] 이 404 다 — 화면에서 안 보인다
    expect(await getStore().findUploadOwner(key)).toBe("u-1");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 5) 굽기로 넘어가는 길
// ────────────────────────────────────────────────────────────────────────
describe("toFalImageUrl — 비공개 URL 은 fal 이 못 읽는다", () => {
  it("우리 업로드 주소는 바이트를 읽어 data URI 로 바꾼다", async () => {
    await getStore().putObject("uploads", "cell.jpg", Buffer.from([1, 2, 3]), "image/jpeg");
    expect(await toFalImageUrl("/api/uploads/cell.jpg")).toBe(
      `data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString("base64")}`
    );
  });

  it("바깥 주소(fal CDN)는 그대로 둔다 — 내려받았다 다시 올릴 이유가 없다", async () => {
    expect(await toFalImageUrl("https://f/out.png")).toBe("https://f/out.png");
  });

  it("못 읽으면 던진다 — 조용히 못 읽는 주소를 fal 로 보내면 값만 나간다", async () => {
    await expect(toFalImageUrl("/api/uploads/없다.jpg")).rejects.toThrow();
  });
});

describe("굽기가 잘라 둔 칸을 쓴다", () => {
  it("runReelClips 가 우리 주소를 data URI 로 바꿔 넘긴다", async () => {
    await getStore().putObject("uploads", "c0.jpg", Buffer.from([9]), "image/jpeg");
    const project = {
      id: "p1",
      cuts: [{ idx: 0, shows: "s", seconds: 4, clip_prompt: "본문", image: { url: "/api/uploads/c0.jpg" } }],
      settings: { aspect_ratio: "9:16" },
    };
    const seen = {};
    await runReelClips("p1", "u-1", {
      getProject: async () => project,
      updateProject: async () => {},
      loadRefs: async () => ({ refs: [] }),
      makeClip: async (args) => { seen.imageUrl = args.imageUrl; return { url: "https://f/v.mp4", seconds: 4 }; },
    });
    expect(seen.imageUrl).toBe(`data:image/jpeg;base64,${Buffer.from([9]).toString("base64")}`);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 프롬프트 — 실측(게이트 D)에서 통한 그 문장들
// ────────────────────────────────────────────────────────────────────────
describe("buildStoryboardPrompt", () => {
  const project = {
    settings: { mood: "warm", style: "photo", aspect_ratio: "9:16" },
    scenario: { look: "kraft pouch", wardrobe: "oatmeal cardigan", environment: "a bright kitchen", tone: "warm film grain" },
  };
  const cuts = [
    { idx: 0, shows: "hands opening the box", camera: "close-up" },
    { idx: 1, shows: "pouring into the pan", camera: "medium" },
    { idx: 2, shows: "a bowl on the table", camera: "top-down" },
  ];

  it("판형(행×열)과 읽는 순서를 말로 못 박는다 — 행이 둘 이상일 때 이것이 먹혔다", () => {
    const p = buildStoryboardPrompt(project, cuts, storyboardGridFor(3));
    expect(p).toContain("3-panel storyboard");
    expect(p).toContain("1 rows by 3 columns");
    expect(p).toContain("left to right");
    expect(p).toContain("Panel 1 is the top-left corner");
    expect(p).toContain("panel 3 is the bottom-right corner");
  });

  it("컷마다 한 줄씩 싣고 번호가 컷 순서와 같다", () => {
    const p = buildStoryboardPrompt(project, cuts, storyboardGridFor(3));
    expect(p).toContain("Panel 1: hands opening the box, close-up.");
    expect(p).toContain("Panel 3: a bowl on the table, top-down.");
  });

  it("전 컷이 같아야 하는 것(생김새·옷·무대·색)을 한 번만 말한다", () => {
    const p = buildStoryboardPrompt(project, cuts, storyboardGridFor(3));
    expect(p).toContain("kraft pouch");
    expect(p).toContain("oatmeal cardigan");
    expect(p).toContain("a bright kitchen");
    expect(p).toContain("warm film grain");
  });

  it("글자를 금지한다 — 격자 번호까지", () => {
    const p = buildStoryboardPrompt(project, cuts, storyboardGridFor(3));
    expect(p).toContain("No text");
    expect(p).toContain("no panel numbers");
  });

  it("시나리오가 비어도 던지지 않는다 — 없는 값은 그냥 안 적는다", () => {
    const p = buildStoryboardPrompt({ settings: { mood: "warm", style: "photo" } }, cuts, storyboardGridFor(3));
    expect(p).toContain("Panel 1:");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 라우트 계약 — 그림 라우트가 이 갈래를 실제로 쓰는가
// ────────────────────────────────────────────────────────────────────────
describe("③그림 라우트", () => {
  const src = readFileSync("app/api/reel/[id]/images/route.js", "utf8");

  it("갈래 판정을 손으로 다시 적지 않는다 — planReelImages 하나를 본다", () => {
    expect(src).toContain("planReelImages(");
    expect(src).not.toContain("REEL_GRIDS");
  });

  // ★ 2026-08-31 — 스토리보드 갈래의 **몸통이 lib/reel/storyboard.js 의 drawStoryboardSheet
  //   로 옮겨 갔다.** 초상 거절 자동 재시도(lib/reel/pipeline.js)가 같은 길로 판을 다시
  //   그려야 해서다 — 라우트에 두면 라우트가 라우트를 import 하게 된다.
  //   재는 것은 그대로다. 다만 **두 자리로 나눠** 잰다: 라우트는 "한 번 부른다",
  //   라이브러리는 "그 안에서도 생성 호출이 한 번이다".
  const lib = readFileSync("lib/reel/storyboard.js", "utf8");

  it("스토리보드 갈래는 생성 호출이 **한 번**이다 — 컷 수만큼 부르지 않는다", () => {
    const storyboard = src.slice(src.indexOf('=== "storyboard"'), src.indexOf("// ── 컷별"));
    expect(storyboard).toContain("drawStoryboardSheet(");
    expect(storyboard.match(/drawStoryboardSheet\(/g)).toHaveLength(1);
    expect(storyboard).not.toMatch(/for \(const cut of/);

    const body = lib.slice(lib.indexOf("export async function drawStoryboardSheet"));
    expect(body.match(/await gen\(/g), "판 한 장에 생성 호출이 하나가 아니다").toHaveLength(1);
  });

  it("잘라서 저장하고 그 주소를 컷에 꽂는다", () => {
    expect(lib).toContain("cropStoryboardCells(");
    expect(lib).toContain("saveStoryboardCells(");
  });
});
