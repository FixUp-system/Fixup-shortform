// 참조 사진 상한 — **모델 표 하나**가 정하고 화면·서버가 그것을 본다.
//
// ★★★ 왜 생겼나(2026-08-28 사장님 지적): "영상 생성 모델의 참조 이미지가 4장이 아닌 걸로
//   안다"는 말에 fal 스키마를 직접 받아 보니 맞았다. 실제 상한은
//     Seedance 2.0 : 9  ("Up to 9 images. Total files across all modalities … 12")
//     Seedance 2.5 : 30 ("Up to 30 images. Total files across all modalities … 50")
//     MiniMax H3   : 9  (스키마 maxItems)
//   그런데 우리는 **4장**으로 막고 있었고, 그 4가 네 군데에 손으로 적혀 있었다
//   (화면·생성 라우트·수정 라우트·lib/photos.js). 근거 없이 좁힌 값이 네 벌이었다.
//
// ★ 2.5 를 9 로 적어 둔 것도 틀렸다. "스키마에 maxItems 가 없으니 좁은 쪽으로" 라고
//   판단했는데, 상한은 모르는 것이 아니라 **설명 원문에 적혀 있었다**(Up to 30 images).
//   모르는 값은 좁게 보는 것이 맞지만, 먼저 읽었어야 했다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AD_MODELS, adRefMax, adRefField, adRefLabel } from "../lib/ad/models.js";

// fal 스키마에서 직접 받은 값(2026-08-28). 표가 이것과 갈리면 fal 이 422 를 내거나,
// 반대로 우리가 쓸 수 있는 장수를 스스로 막는다.
const FROM_FAL = {
  "seedance-2.0": { max: 9, field: "image_urls", label1: "@Image1" },
  "seedance-2.5": { max: 30, field: "image_urls", label1: "@Image1" },
  "minimax-h3": { max: 9, field: "reference_image_urls", label1: "Image 1" },
};

describe("모델 표가 fal 스키마와 같은 값을 든다", () => {
  for (const [id, want] of Object.entries(FROM_FAL)) {
    it(`${id} — ${want.max}장 · ${want.field}`, () => {
      expect(adRefMax(id), `${id} 의 상한이 fal 과 다르다`).toBe(want.max);
      expect(adRefField(id)).toBe(want.field);
      expect(adRefLabel(id, 1)).toBe(want.label1);
    });
  }

  // ★ 새 모델을 더할 때 refs 를 빠뜨리면 상한이 undefined 가 되고, 화면이 그것으로
  //   `photos.length >= undefined` 를 재면 **버튼이 영원히 열린 채**가 된다.
  it("모든 모델이 상한을 든다 — 빠뜨리면 화면 잠금이 풀린다", () => {
    for (const m of AD_MODELS) {
      expect(adRefMax(m.id), `${m.id} 에 refs.max 가 없다`).toBeGreaterThan(0);
    }
  });
});

describe("4장 제한이 어디에도 안 남았다", () => {
  const files = [
    "app/ads/new/page.js",
    "app/api/ads/route.js",
    "app/api/ads/[id]/route.js",
  ];
  for (const f of files) {
    it(`${f} 가 상한을 손으로 안 적는다`, () => {
      // 주석은 걷는다 — 왜 걷어냈는지를 설명하는 주석이 그 이름을 쓴다.
      const code = readFileSync(f, "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
      expect(code, "MAX_PHOTOS 가 아직 있다").not.toMatch(/MAX_PHOTOS/);
      expect(code, "adRefMax 를 안 쓴다").toContain("adRefMax");
    });
  }
});

// ★ film("한 번에 굽는 영상")은 우리가 만든 그림을 참조로 넘기는 흐름이라 사정이 다르다.
//   그쪽의 lib/photos.js MAX_PHOTOS 는 그대로 둔다 — 광고와 같은 값일 이유가 없다.
describe("film 쪽 상한은 안 건드렸다", () => {
  it("lib/photos.js 는 그대로다", () => {
    expect(readFileSync("lib/photos.js", "utf8")).toMatch(/MAX_PHOTOS\s*=\s*4/);
  });
});
