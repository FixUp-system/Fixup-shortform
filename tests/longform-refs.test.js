// 구간 참조 — 판 → 사진 → 닻 → 직전. 자리가 모자라면 직전부터, 그다음 사진을 뒤에서 버린다
// (스펙 「축 1」 자리 계산). 버린 것은 **이유와 함께** 돌려준다 — 조용히 버리지 않는다.
import { describe, it, expect } from "vitest";
import { segmentRefs, H3_FREE_REFS, H3_EXTRA_REF_USD } from "../lib/longform/refs.js";

const photo = (id, extra = {}) => ({ id, role: "product", vision: { person: false, any_face: false }, url: `u/${id}`, ...extra });

describe("구간 참조", () => {
  it("순서가 판 → 사진 → 닻 → 직전이다", () => {
    const { refs } = segmentRefs({ sheet: { url: "s" }, photos: [photo("p1")], anchor: { key: "a" }, last: { key: "l" } });
    expect(refs.map((r) => r.kind)).toEqual(["sheet", "photo", "anchor", "last"]);
  });

  it("사진에는 역할 문구가 붙는다", () => {
    const { refs } = segmentRefs({ sheet: {}, photos: [photo("p1")] });
    expect(refs[1].roleEn).toMatch(/^is the subject/);
  });

  it("★★★ 얼굴 든 사진은 빠지고, 빠진 이유를 말한다", () => {
    const face = photo("p2", { role: "person", vision: { person: true, any_face: true } });
    const { refs, dropped } = segmentRefs({ sheet: {}, photos: [photo("p1"), face] });
    expect(refs.map((r) => r.id)).not.toContain("p2");
    expect(dropped).toEqual([{ kind: "photo", id: "p2", reason: "face" }]);
  });

  it("★★ 9장을 넘으면 직전 프레임부터 버린다 — 이음새에는 0원 대안(장면 경계)이 있다", () => {
    const photos = Array.from({ length: 7 }, (_, i) => photo(`p${i}`));
    const { refs, dropped } = segmentRefs({ sheet: {}, photos, anchor: { key: "a" }, last: { key: "l" } });
    expect(refs).toHaveLength(9);
    expect(refs.map((r) => r.kind)).not.toContain("last");
    expect(refs.map((r) => r.kind)).toContain("anchor");
    expect(dropped).toEqual([{ kind: "last", reason: "room" }]);
  });

  it("그래도 넘치면 사진을 뒤에서부터 버린다 — 닻은 지킨다", () => {
    // 판 1 + 사진 8 + 닻 1 = 10 → 사진 하나(p7)를 뺀다
    const photos = Array.from({ length: 8 }, (_, i) => photo(`p${i}`));
    const { refs, dropped } = segmentRefs({ sheet: {}, photos, anchor: { key: "a" } });
    expect(refs).toHaveLength(9);
    expect(refs.at(-1).kind).toBe("anchor");
    expect(dropped).toEqual([{ kind: "photo", id: "p7", reason: "room" }]);
  });

  it("★ 5장까지는 추가 값이 0 이다", () => {
    const { extraUsd } = segmentRefs({ sheet: {}, photos: [photo("p1"), photo("p2")], anchor: { key: "a" }, last: { key: "l" } });
    expect(extraUsd).toBe(0);
  });

  it("5장을 넘는 만큼 장당 $0.08 이다", () => {
    const photos = Array.from({ length: 4 }, (_, i) => photo(`p${i}`));
    const { refs, extraUsd } = segmentRefs({ sheet: {}, photos, anchor: { key: "a" }, last: { key: "l" } });
    expect(refs).toHaveLength(7);
    expect(extraUsd).toBeCloseTo((7 - H3_FREE_REFS) * H3_EXTRA_REF_USD, 6);
  });
});
