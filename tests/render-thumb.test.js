// 완성본 **표지 한 장** — 2026-09-18 사장님 지시("썸네일 없는 영상이 많다 → 1번으로 진행").
//
// 🔍 실측(최근 200편): 카드 썸네일은 `doc.cuts[0].image.url` 한 곳에서만 온다. 그림 단계가 없는
//   원클릭은 35편 전부가 빈 카드였고 그중 33편은 **영상이 멀쩡히 있었다**. film 7편도 같다.
// ★ 지키는 것 넷:
//   ① 굽고 나서 첫 화면 한 장을 `<id>-thumb.jpg` 로 남긴다(굽는 자리 둘 다)
//   ② 실패해도 **완성본은 그대로 간다**
//   ③ 표지도 같은 문(`/api/renders/<이름>`)으로 열린다
//   ④ 카드는 그림이 없을 때 그 주소를 지어 보고, 파일이 없으면 지금처럼 글자를 보여 준다
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { thumbName, renderThumbUrl, thumbArgs } from "../lib/render-thumb.js";
import { makeRenderThumb } from "../lib/compose.js";

const ID = "11111111-2222-4333-8444-555555555555";

describe("표지 이름·인자", () => {
  it("★★ 이름과 주소가 한 규칙에서 나온다", () => {
    expect(thumbName(ID)).toBe(`${ID}-thumb.jpg`);
    expect(renderThumbUrl(ID)).toBe(`/api/renders/${ID}-thumb.jpg`);
  });

  it("★★ 한 장만 뽑고, 카드 크기로 줄이고, 첫 프레임의 검은 화면을 피한다", () => {
    const a = thumbArgs({ src: "in.mp4", out: "out.jpg" });
    const at = (k) => a[a.indexOf(k) + 1];
    expect(at("-frames:v"), "여러 장을 뽑는다").toBe("1");
    expect(at("-vf")).toBe("scale=480:-2");
    expect(at("-ss"), "첫 프레임이 검은 편이 있다 — 조금 뒤를 집는다").toBe("0.5");
    expect(a.at(-1)).toBe("out.jpg");
  });
});

describe("굽고 나서 표지를 남긴다", () => {
  it("★★★ jpg 로 저장한다 — 이름·버킷·타입", async () => {
    const put = [];
    const key = await makeRenderThumb(ID, "final.mp4", {
      runFfmpeg: async () => {},
      mkdtempImpl: async () => "tmp",
      readFileImpl: async () => Buffer.from([1, 2, 3]),
      rmImpl: async () => {},
      putObjectImpl: async (bucket, k, bytes, ct) => { put.push({ bucket, k, len: bytes.length, ct }); },
    });
    expect(key).toBe(thumbName(ID));
    expect(put).toEqual([{ bucket: "renders", k: thumbName(ID), len: 3, ct: "image/jpeg" }]);
  });

  it("★★★ ffmpeg 가 죽어도 **던지지 않는다** — 표지 한 장 때문에 완성본을 잃지 않는다", async () => {
    let removed = false;
    const key = await makeRenderThumb(ID, "final.mp4", {
      runFfmpeg: async () => { throw new Error("ffmpeg 실패"); },
      mkdtempImpl: async () => "tmp",
      readFileImpl: async () => Buffer.from([1]),
      rmImpl: async () => { removed = true; },
      putObjectImpl: async () => {},
    });
    expect(key).toBeNull();
    expect(removed, "임시 폴더를 안 지웠다").toBe(true);
  });

  it("★★ 굽는 자리 **둘 다** 표지를 만든다", () => {
    const src = readFileSync("lib/compose.js", "utf8");
    expect(src.match(/await makeRenderThumb\(projectId, out, \{ putObjectImpl \}\);/g) || []).toHaveLength(2);
  });
});

describe("표지도 같은 문으로 열린다", () => {
  it("★★★ 파일 이름 검사가 `-thumb.jpg` 를 받는다", () => {
    const src = readFileSync("app/api/renders/[name]/route.js", "utf8");
    expect(src).toMatch(/RENDER_THUMB\s*=\s*\/\^\(\[0-9a-f\]\{8\}/);
    expect(src, "표지 갈래를 실제로 안 쓴다").toMatch(/RENDER_MP4\.exec\(name\) \|\| RENDER_THUMB\.exec\(name\)/);
  });
});

describe("보관함 카드", () => {
  const src = readFileSync("components/ProjectCards.jsx", "utf8");

  it("★★★ 그림이 없고 영상이 있으면 표지 주소를 지어 본다", () => {
    expect(src).toContain("renderThumbUrl(id)");
    expect(src, "주소를 화면이 손으로 적는다 — 규칙이 두 벌이 된다").not.toMatch(/-thumb\.jpg/);
  });

  it("★★★ 표지가 없으면(옛 편) 예전처럼 글자로 떨어진다", () => {
    expect(src).toContain("setThumbBroken(true)");
    expect(src).toContain("영상이 있어요 — 눌러서 보기");
  });
});
