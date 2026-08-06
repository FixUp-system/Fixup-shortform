// 가격표 — 이 저장소에서 값이 바뀔 것을 전제로 만든 유일한 자리다.
// 숫자 자체보다 "표 밖에 숫자가 없다"와 "경계에서 어느 쪽으로 떨어지나"를 못 박는다.
import { describe, it, expect } from "vitest";
import { VIDEO_PRICE, REGEN_PRICE, FREE_REGEN_PER_CUT, DEFAULT_GRANT, videoPrice, regenPrice } from "../lib/pricing.js";
import { TARGET_CHOICES } from "../lib/script.js";

describe("가격표", () => {
  it("고를 수 있는 길이 전부에 값이 있다", () => {
    for (const s of TARGET_CHOICES) {
      expect(typeof VIDEO_PRICE[s]).toBe("number");
      expect(VIDEO_PRICE[s]).toBeGreaterThan(0);
    }
  });

  it("길이에 비례한다 — 원가가 컷 수에 비례하기 때문이다", () => {
    expect(VIDEO_PRICE[30]).toBeGreaterThan(VIDEO_PRICE[15]);
    expect(VIDEO_PRICE[60]).toBeGreaterThan(VIDEO_PRICE[45]);
  });

  it("videoPrice 는 목록 밖 값을 기본 길이(30초) 값으로 받는다", () => {
    expect(videoPrice(30)).toBe(VIDEO_PRICE[30]);
    expect(videoPrice(null)).toBe(VIDEO_PRICE[30]);
    expect(videoPrice(7)).toBe(VIDEO_PRICE[30]);
  });

  it("컷당 첫 재생성은 공짜, 그 뒤는 정가", () => {
    expect(FREE_REGEN_PER_CUT).toBe(1);
    expect(regenPrice("image", 0)).toBe(0);
    expect(regenPrice("image", 1)).toBe(REGEN_PRICE.image);
    expect(regenPrice("clip", 2)).toBe(REGEN_PRICE.clip);
    expect(regenPrice("voice", 1)).toBe(REGEN_PRICE.voice);
  });

  it("모르는 재생성 종류는 0 이 아니라 던진다 — 조용히 공짜가 되면 안 된다", () => {
    expect(() => regenPrice("사진", 1)).toThrow();
  });

  it("클립 재생성이 이미지보다 비싸다 — 실측 원가가 그렇다($0.42 대 $0.08)", () => {
    expect(REGEN_PRICE.clip).toBeGreaterThan(REGEN_PRICE.image);
  });

  it("기본 지급값이 30초 몇 편치는 된다", () => {
    expect(DEFAULT_GRANT).toBeGreaterThanOrEqual(VIDEO_PRICE[30] * 2);
  });
});
