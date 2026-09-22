// **원클릭 프로(2.5)는 인물 사진의 얼굴에 격자를 씌워 보낸다** (2026-09-22).
//
// ★★★ 실측 근거 — 원클릭 프로젝트 336a7e28(09-21)이 인물 사진 둘을 싣고 2.5 r2v 로 나갔다가
//   초상 422 로 죽었다(image_urls · "likenesses of real people"). 09-03 에 `facesInRefs:false`
//   를 걷으면서 원클릭의 ＋인물 도 함께 풀렸는데, 격자는 단계별의 **판**에만 씌우고 있었다
//   (lib/reel/pipeline.js). 광고 갈래는 사장님 사진을 **원본 그대로** 보냈다.
// ★ 같은 자료를 기본(H3)으로 만든 666991e0 은 원본 얼굴 그대로 영상이 나왔다 — 그래서
//   격자는 **그 모델이 얼굴을 막을 때만** 씌운다. 받아 주는 모델에서 얼굴을 가리면 인물
//   고정을 공짜로 잃는다.
// ★ 격자는 얼굴을 가린다 — 모델은 윤곽·머리·옷만 보고 얼굴을 새로 만든다. 그래서 화면이
//   "비슷한 인물로 만들어요"를 말한다(아래 마지막 묶음).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gridsFacesForEndpoint } from "../lib/clip-limits.js";
import { adEndpoint } from "../lib/ad/models.js";
import { readRefs } from "../lib/ad/pipeline.js";
import { buildFalInput } from "../lib/ad/generate.js";
import { GRID_SUPPRESS_LINE } from "../lib/reel/face-grid.js";
import { PERSON_PHOTO_NOTE } from "../lib/photos.js";

const PHOTOS = [
  { url: "/api/uploads/prod.png", role: "product" },
  { url: "/api/uploads/face.jpg", role: "person" },
  { url: "/api/uploads/logo.png", role: "logo" },
];
const project = (model, endpoint = "r2v") => ({
  settings: { model },
  scenario: { endpoint, text: "a film" },
  material: { photos: PHOTOS },
});
// 읽기·격자를 가짜로 — 무엇을 읽고 무엇에 격자를 씌웠는지 기록한다.
function fakes({ faces = 1, throws = false } = {}) {
  const gridded = [];
  return {
    gridded,
    deps: {
      readRefBytes: async ({ key }) => Buffer.from(`raw:${key}`),
      gridFacesOnPhoto: async ({ bytes }) => {
        if (throws) throw new Error("vlm down");
        gridded.push(String(bytes));
        return { bytes: Buffer.from(`grid:${bytes}`), faces };
      },
    },
  };
}

describe("판정 — 어느 모델에 격자를 씌우나", () => {
  it("★★★ 프로(2.5)는 씌운다", () => {
    expect(gridsFacesForEndpoint(adEndpoint("seedance-2.5", "r2v"))).toBe(true);
  });
  it("★★ 기본(H3)·2.0 은 안 씌운다 — 원본 얼굴을 받아 준다", () => {
    expect(gridsFacesForEndpoint(adEndpoint("minimax-h3", "r2v"))).toBe(false);
    expect(gridsFacesForEndpoint(adEndpoint("seedance-2.0", "r2v"))).toBe(false);
  });
  it("★ 모르는 엔드포인트는 안 씌운다", () => {
    expect(gridsFacesForEndpoint("nope/unknown")).toBe(false);
  });
});

describe("광고 참조 적재 — 인물 사진에만 격자", () => {
  it("★★★ 프로 r2v 면 인물 사진만 격자를 씌운 사본이 나간다", async () => {
    const f = fakes();
    const refs = await readRefs(project("seedance-2.5"), f.deps);
    expect(f.gridded).toEqual(["raw:face.jpg"]);
    expect(refs.map((r) => String(r.bytes))).toEqual(["raw:prod.png", "grid:raw:face.jpg", "raw:logo.png"]);
    expect(refs[1].gridded).toBe(true);
    // 격자 사본은 JPEG 다 — 확장자가 data URI 의 형식을 정한다(lib/refs-io.js 의 toDataUri)
    expect(refs[1].key).toMatch(/\.jpg$/);
  });

  it("★★ 기본(H3)이면 아무것도 안 건드린다", async () => {
    const f = fakes();
    const refs = await readRefs(project("minimax-h3"), f.deps);
    expect(f.gridded).toEqual([]);
    expect(refs.every((r) => !r.gridded)).toBe(true);
  });

  it("★★ r2v 가 아니면 안 씌운다 — i2v 의 사진은 첫 프레임이라 격자가 화면에 그대로 남는다", async () => {
    const f = fakes();
    await readRefs(project("seedance-2.5", "i2v"), f.deps);
    expect(f.gridded).toEqual([]);
  });

  it("★ 얼굴을 못 찾으면 원본 그대로 — 아무 데나 씌우면 그림만 버린다", async () => {
    const f = fakes({ faces: 0 });
    const refs = await readRefs(project("seedance-2.5"), f.deps);
    expect(String(refs[1].bytes)).toBe("raw:face.jpg");
    expect(refs[1].gridded).toBeFalsy();
  });

  it("★ 격자가 터져도 던지지 않는다 — 거절은 0원이고, 던지면 굽기 자체를 잃는다", async () => {
    const f = fakes({ throws: true });
    const refs = await readRefs(project("seedance-2.5"), f.deps);
    expect(refs).toHaveLength(3);
  });

  it("★★ 적재는 한 벌이다 — 로컬 경로(runAdRenderPipeline)도 같은 함수를 쓴다", () => {
    const src = readFileSync("lib/ad/pipeline.js", "utf8");
    expect(src.match(/\{ source: "upload", key \}/g) || []).toHaveLength(1);
    expect(src.match(/await readRefs\(project, deps\)/g) || []).toHaveLength(2);
  });
});

describe("지문 — 격자를 씌웠으면 지우라고 말한다", () => {
  const base = { settings: { model: "seedance-2.5", aspect_ratio: "9:16" }, scenario: { text: "a film" }, kind: "r2v", seconds: 15 };

  it("★★★ 격자 사본이 끼면 꼬리에 억제 문장이 붙는다", () => {
    const input = buildFalInput({ ...base, refs: [{ key: "a.jpg", bytes: Buffer.from("x"), gridded: true }] });
    expect(input.prompt.endsWith(GRID_SUPPRESS_LINE)).toBe(true);
  });

  it("★★ 없으면 지문이 예전 그대로다", () => {
    const input = buildFalInput({ ...base, refs: [{ key: "a.jpg", bytes: Buffer.from("x") }] });
    expect(input.prompt).not.toContain(GRID_SUPPRESS_LINE);
  });
});

describe("화면 — ＋인물 아래에 '비슷한 인물' 고지", () => {
  it("★ 문구", () => {
    expect(PERSON_PHOTO_NOTE).toMatch(/비슷한 인물/);
    expect(PERSON_PHOTO_NOTE).toMatch(/똑같은 인물은 아닐 수 있어요/);
  });

  for (const file of ["app/ads/new/page.js", "app/reel/new/page.js"]) {
    it(`★★ ${file} 가 ＋인물 이 보일 때 고지를 그린다`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/PERSON_PHOTO_NOTE/);
      expect(src).toMatch(/photoRoles\.some\(\(r\) => r\.id === "person"\)/);
    });
  }
});
