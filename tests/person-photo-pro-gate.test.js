// ⚠️ **이 파일의 전제는 2026-09-03 에 뒤집혔다** — 프로(2.5)도 인물 사진을 받는다.
//   얼굴을 가리는 일은 "안 받기"가 아니라 **격자**가 한다(lib/reel/face-grid.js):
//   얼굴에만 · 흰색 · 불투명 10×10 이면 2.0 과 2.5 둘 다 통과한다(09-03 실측).
//   아래 옛 설명은 **그때의 판단 기록**으로 남긴다 — 근거가 왜 틀렸는지는
//   tests/faces-blocked-model.test.js 머리말에 있다.
//
// (옛 머리말) **프로(2.5)에서는 인물 사진을 안 받는다** (2026-09-01 사장님 결정).
//
// ★★★ 왜 막나 — 되는지 안 되는지 모르는 것이 아니라 **결과를 안다.** 2.5 는 사진 같은
//   얼굴이 든 참조를 실측 9건 전부 거절했다(크게·작게·단독 카드·배경에 2%·그리드 덮기·
//   AI 화풍). 그런데 지금 코드는 판 지문에 "얼굴은 프레임 밖으로"라고 써 놓고
//   **인물 사진은 그대로 참조로 실었다** — 글과 사진이 서로 싸우고, 사진이 이기면
//   판에 얼굴이 그려져 영상 단계에서 막힌다. 판값 $0.401 을 두 번 태우고 실패 한 번.
//
// ★★ **묘사로 메우는 길은 안 간다**(사장님 판단). 글로는 "그 사람"이 아니라 "그런 사람"
//   까지다. 사진을 받아 놓고 얼굴이 안 나오면 기대만 만들고 못 지킨다.
//   ★ 사람이 사라지는 것은 아니다 — 생김새는 reelCastLine 이 이미 글로 나른다.
//
// ★★ **화면에서만 거르면 가림막이지 잠금이 아니다**(lib/photos.js 머리말, 이 저장소가
//   2.5 에서 이미 겪은 자리). 그래서 참조 적재에서도 뺀다.
//
// ★ **나중에 푼다.** 종량제로 옮겨 가면(사용자가 값을 직접 부담하면) 실패의 값이 우리
//   것이 아니게 되므로 이 제한을 완화한다 — 그때 이 파일부터 읽으면 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isPersonPhoto, visiblePhotoRoles, PHOTO_ROLES } from "../lib/photos.js";
import { describeCutRefs } from "../lib/cut-refs.js";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const project = (model, extra = {}) => ({
  settings: { i2v_model: model, aspect_ratio: "9:16" },
  cast: [{ id: "c1", who: "Korean woman in her 20s", cuts: [0], ref: { from: "photo", id: "p9" } }],
  material: { photos: [
    { id: "p1", role: "product", url: "/api/uploads/p1.png" },
    { id: "p9", role: "person", url: "/api/uploads/p9.png", vision: { person: true } },
  ] },
  ...extra,
});
const CUT = { idx: 0, ref_ids: ["p1", "c1"] };
const kinds = (model) => describeCutRefs(CUT, project(model)).map((r) => r.kind);

describe("사진 한 장이 인물인가 — 판정 하나", () => {
  it("★★★ 사장님이 누른 라벨로 안다", () => {
    expect(isPersonPhoto({ role: "person" })).toBe(true);
    expect(isPersonPhoto({ role: "product" })).toBe(false);
  });

  it("★★ 라벨이 어긋나도 **사진 판정**이 잡는다 — 제품 버튼으로 올린 얼굴이 새면 안 된다", () => {
    expect(isPersonPhoto({ role: "product", vision: { person: true } })).toBe(true);
  });

  it("★ 둘 다 없으면 아니다 — 모르는 것을 얼굴로 치지 않는다", () => {
    expect(isPersonPhoto({})).toBe(false);
    expect(isPersonPhoto(null)).toBe(false);
  });
});

describe("올리는 자리 — 프로면 ＋인물 이 사라진다", () => {
  it("★★★ 프로에서는 인물이 목록에서 빠진다", () => {
    expect(visiblePhotoRoles(true).map((r) => r.id)).toEqual(["logo", "product"]);
  });

  it("★★ 기본에서는 셋 그대로다 — 되는 모델에서 뺏으면 안 된다", () => {
    expect(visiblePhotoRoles(false)).toEqual(PHOTO_ROLES);
  });

  it("★ 화면이 그 함수를 쓴다 — 표를 직접 돌리면 잠금이 안 걸린다", () => {
    const src = strip(readFileSync("app/reel/new/page.js", "utf8"));
    expect(src).toMatch(/visiblePhotoRoles\(/);
    expect(src, "PHOTO_ROLES 를 그대로 돌리면 프로에서도 ＋인물 이 그려진다")
      .not.toMatch(/PHOTO_ROLES\.map\(/);
  });

  // ★★ 조용히 버리면 "반영이 안 된다"로 읽힌다 — 이 저장소가 사진 누락으로 이미 겪은
  //   종류의 오해다. 지우지는 않는다: 기본으로 되돌리면 그 사진이 그대로 살아나야 한다.
  it("★★ 이미 올린 인물 사진이 있으면 **말해 준다**", () => {
    const src = strip(readFileSync("app/reel/new/page.js", "utf8"));
    expect(src, "안 실리는데 아무 말이 없다").toMatch(/strandedPeople/);
    expect(src).toMatch(/기본으로 바꿔 주세요/);
    expect(src, "사진을 지워 버리면 되돌릴 수 없다").not.toMatch(/setPhotos\(\(ps\) => ps\.filter\(isPersonPhoto/);
  });
});

// ★ 원클릭(ad)은 이 **적재 잠금** 밖이다 — 참조를 자기 길로 모은다(lib/ad/pipeline.js 의
//   readRefBytes). ⚠️ 2026-09-02 부터 **화면 숨김은 원클릭에도 걸렸다**("일단 숨김처리" —
//   tests/ad-person-photo-hide.test.js 가 잰다). 서버 적재는 여전히 제 갈래 그대로다.
describe("원클릭 적재는 안 건드린다", () => {
  it("★★ 광고 갈래는 describeCutRefs 를 안 쓴다", () => {
    const src = readFileSync("lib/ad/pipeline.js", "utf8");
    expect(src).not.toMatch(/describeCutRefs|loadCutRefs|loadStoryboardRefs/);
  });
});

describe("참조 적재 — 화면을 지나쳐도 안 실린다", () => {
  // ★★★ 2026-09-03 뒤집힘 — 이제 **싣는다**. 얼굴은 굽기 직전에 격자가 가린다
  //   (lib/reel/face-grid.js). 그전 실측(전부 거절)은 격자가 반투명·전면이었던 탓이다.
  it("★★★ 프로도 이제 인물 참조를 싣는다", () => {
    expect(kinds("seedance-2.5").sort()).toEqual(["person", "thing"]);
  });

  it("★★ 사물은 그대로 실린다 — 제품·로고까지 잃으면 안 된다", () => {
    expect(kinds("seedance-2.5")).toContain("thing");
  });

  it("★★ 기본은 예전 그대로다 — 2.0 은 얼굴 든 판으로 영상을 냈다", () => {
    expect(kinds("seedance-2.0").sort()).toEqual(["person", "thing"]);
  });

  it("★ 모르는 모델도 안 막는다 — 모르면 안 막는 것이 이 저장소의 규율이다", () => {
    expect(kinds("something-new").sort()).toEqual(["person", "thing"]);
  });

  // ★★ 그전에는 이 자리가 **빈 배열**이었다(라벨로 새는 길을 닫는 그물이었다).
  //   이제는 실린다 — 얼굴은 격자가 가리므로 막을 이유가 없다.
  //   ★ 종류가 `thing` 인 것은 그대로다: 사진을 **직접** 꽂으면 사물 자리이고,
  //     `person` 은 캐스팅(cast)을 거친 참조에만 붙는다. 그 축은 이 변경과 무관하다.
  it("★★ 인물 사진을 사물 자리로 꽂아도 이제 **실린다** — 빠지지 않는다", () => {
    const p = project("seedance-2.5");
    const out = describeCutRefs({ idx: 0, ref_ids: ["p9"] }, p);
    expect(out, "아직도 인물 사진이 통째로 빠진다").toHaveLength(1);
    expect(out[0].photo_id).toBe("p9");
  });
});
