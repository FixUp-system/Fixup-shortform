// **통짜 굽기에 사장님 사진을 판과 함께 보낸다** (2026-09-04 사장님 지시).
//
// ★★★ 왜. 사장님 신고: *"단계별 기본에서 첨부한 로고 이미지가 조금 깨진다."*
//   원인은 모델이 아니라 **경로**다. 통짜는 굽기에 `refs: [sheetRef]` 하나만 보낸다 —
//   **사장님이 올린 로고 원본은 영상 모델에 아예 안 간다.** 판에 AI 가 다시 그린 로고만 간다.
//   그 사이 로고는 두 번 다시 그려지고(그림 모델 → 영상 모델) 판 안에서 작아진다.
//   이 저장소의 실측 기록이 그 성질을 이미 적어 두었다 — *"작은 글자는 '글자처럼 생긴
//   무늬'로 재생성된다. 크기가 결정적"*(VT PDRN → VT PORN).
//   원클릭은 원본 사진을 그대로 보내서(lib/ad/pipeline.js 의 readRefs) 이 문제가 덜하다.
//
// ★ **인물은 안 보낸다**(사장님 판단). 초상 정책 위험을 피하는 가장 싼 길이고, 지금 문제는
//   로고(사물)라 인물과 무관하다. 인물에 격자를 씌우는 안은 **목적을 깨뜨린다** —
//   인물 사진을 넣는 이유가 "그 사람처럼 나오게"인데 얼굴을 덮으면 모델이 그 얼굴을 못 본다.
//
// ★★ **비율을 재되, 벗어나면 버리지 않고 여백을 넣어 맞춘다.** 넓적한 로고 한 장이 모델의
//   참조 비율 한계를 넘기면 굽기가 통째로 거절될 수 있고(2026-08-31 실측: 비율 2.83 이
//   **초상 문구**로 거절돼 원인을 잘못 가리켰다), 그렇다고 **버리면 사장님 로고가 조용히
//   안 실려 이 작업이 없애려던 증상이 그대로 남는다.** 넓적한 로고가 정확히 그 경우다.
//   → 정사각형 흰 바탕에 담아 보낸다. 어느 모델의 한계에도 들어간다.
// ★ 공식 문서 실측(2026-09-04): 2.0 r2v 는 참조를 **최대 9장** 받는다(장당 30MB).
//   우리는 판 + 최대 3장이라 여유가 있다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { oneShotRefPhotos, ONESHOT_MAX_PHOTO_REFS, buildOneShotPrompt } from "../lib/reel/oneshot.js";
import { attachedRoleLine } from "../lib/photos.js";

const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const src = (p) => strip(readFileSync(p, "utf8"));

const P = (over) => ({ id: "p1", url: "/api/uploads/a.png", role: "logo", ...over });
const proj = (photos) => ({ material: { photos } });

describe("무엇을 함께 보내나 — oneShotRefPhotos", () => {
  it("★★★ 사물 사진은 보낸다", () => {
    expect(oneShotRefPhotos(proj([P({ role: "logo" })])).map((p) => p.id)).toEqual(["p1"]);
  });

  it("★★★ 인물은 **안 보낸다** — 라벨로도, 사진 판정으로도 거른다", () => {
    expect(oneShotRefPhotos(proj([P({ role: "person" })]))).toEqual([]);
    expect(oneShotRefPhotos(proj([P({ role: "product", vision: { person: true } })]))).toEqual([]);
  });

  it("★ 주소 없는 사진은 못 보낸다", () => {
    expect(oneShotRefPhotos(proj([P({ url: "" })]))).toEqual([]);
  });

  it("★★ 상한이 있다 — 참조가 많을수록 판의 무게가 묽어진다", () => {
    const many = Array.from({ length: ONESHOT_MAX_PHOTO_REFS + 3 }, (_, i) => P({ id: `p${i}` }));
    expect(oneShotRefPhotos(proj(many))).toHaveLength(ONESHOT_MAX_PHOTO_REFS);
    expect(ONESHOT_MAX_PHOTO_REFS).toBeGreaterThan(0);
  });

  it("★ 사진이 없으면 빈 목록이다 — 옛 문서는 예전 그대로 판 하나만 간다", () => {
    expect(oneShotRefPhotos({})).toEqual([]);
  });
});

describe("무엇이라고 말해 주나 — attachedRoleLine", () => {
  it("★★★ 종류를 말해 준다 — 안 말하면 모델이 '분위기 참고'로 읽는다", () => {
    expect(attachedRoleLine([P({ role: "logo" })])).toMatch(/One of the attached images/);
    expect(attachedRoleLine([P({ role: "logo" })])).toMatch(/never redraw/);
  });

  it("★★ 같은 종류가 여럿이면 **한 번만** 말한다 — 같은 문장을 두 번 실으면 무게가 흐려진다", () => {
    const line = attachedRoleLine([P({ id: "a" }), P({ id: "b" })]);
    expect(line.match(/One of the attached images/g)).toHaveLength(1);
  });

  it("★ 종류가 없으면 빈 문자열이다", () => {
    expect(attachedRoleLine([P({ role: undefined })])).toBe("");
    expect(attachedRoleLine([])).toBe("");
  });

  it("★★★ 컷별 갈래가 **같은 함수**를 쓴다 — 문구가 두 벌이면 갈래마다 다른 말이 나간다", () => {
    expect(src("lib/cuts.js")).toMatch(/attachedRoleLine\(/);
  });
});

describe("지시문 — 사진이 붙으면 그 줄이 실린다", () => {
  const grid = { rows: 1, cols: 3 };

  it("★★★ 사진이 있으면 종류를 말한다", () => {
    const p = buildOneShotPrompt(grid, 3, "body", { photos: [P({ role: "logo" })] });
    expect(p).toMatch(/One of the attached images/);
  });

  it("★★ 사진이 없으면 그 줄이 **통째로 없다** — 옛 문서는 글자 그대로 예전이다", () => {
    expect(buildOneShotPrompt(grid, 3, "body", {})).not.toMatch(/One of the attached images/);
  });
});

describe("굽기 — 판 뒤에 사진을 붙인다", () => {
  const pipeline = src("lib/reel/pipeline.js");

  it("★★★ refs 가 판 하나가 아니다", () => {
    expect(pipeline, "아직 판만 보낸다").not.toMatch(/refs:\s*\[sheetRef\]/);
    expect(pipeline).toMatch(/sheetRef,\s*\.\.\./);
  });

  it("★★★ 비율을 재고, 벗어나면 **버리지 않고 여백을 넣어 맞춘다**", () => {
    expect(pipeline).toMatch(/refAspectFor/);
    // 버리면 사장님 로고가 조용히 안 실려 증상이 그대로 남는다 — 넓적한 로고가 그 경우다.
    expect(pipeline, "벗어난 사진을 그냥 버린다").toMatch(/fit:\s*"contain"/);
  });

  it("★★ 못 읽은 사진은 **건너뛴다** — 사진 하나 때문에 이미 값을 치른 굽기를 잃을 수 없다", () => {
    expect(pipeline).toMatch(/oneShotRefPhotos/);
  });
});
