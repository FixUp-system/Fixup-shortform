import { describe, it, expect } from "vitest";
import { validateScript, validateCuts } from "../lib/validate.js";

describe("validateScript", () => {
  it("정상 스키마를 통과시킨다", () => {
    const ok = validateScript({
      paragraphs: [{ tag: "훅", text: "요즘 이거 모르면 손해" }],
      coverage: ["생딸기 직접 갈기"],
    });
    expect(ok.paragraphs).toHaveLength(1);
  });
  it("paragraphs가 없으면 null", () => {
    expect(validateScript({ coverage: [] })).toBeNull();
    expect(validateScript({ paragraphs: [{ tag: "훅" }] })).toBeNull(); // text 누락
  });
});

describe("validateCuts", () => {
  const photoIds = ["p1", "p2"];
  it("정상 컷 배열을 통과시키고 idx를 재부여한다", () => {
    const cuts = validateCuts(
      { cuts: [
        { sentence: "문장1", seconds: 6, source: "ai", ref_photo_id: "p1" },
        { sentence: "문장2", seconds: 8, source: "photo", photo_id: "p2" },
      ]},
      photoIds
    );
    expect(cuts).toHaveLength(2);
    expect(cuts[0].idx).toBe(0);
    expect(cuts[1].photo_id).toBe("p2");
  });
  it("photo 소스인데 photo_id가 목록에 없으면 null", () => {
    expect(validateCuts({ cuts: [{ sentence: "s", seconds: 5, source: "photo", photo_id: "없음" }] }, photoIds)).toBeNull();
  });
  it("존재하지 않는 ref_photo_id는 제거하고 통과시킨다", () => {
    const cuts = validateCuts({ cuts: [{ sentence: "s", seconds: 5, source: "ai", ref_photo_id: "없음" }] }, photoIds);
    expect(cuts[0].ref_photo_id).toBeUndefined();
  });
});
