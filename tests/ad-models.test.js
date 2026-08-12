// 모델 표 — 엔드포인트 문자열이 사는 유일한 자리.
// 값보다 "표 밖에 문자열이 없다"와 "모르는 값이 어디로 떨어지나"를 못 박는다.
import { describe, it, expect } from "vitest";
import {
  AD_MODELS, DEFAULT_AD_MODEL, AD_SECONDS,
  adModel, adEndpoint, isAdSeconds,
} from "../lib/ad/models.js";

describe("광고 모델 표", () => {
  it("기본 모델이 표에 있다", () => {
    expect(AD_MODELS.some((m) => m.id === DEFAULT_AD_MODEL)).toBe(true);
  });

  it("모델마다 엔드포인트 셋을 다 든다", () => {
    for (const m of AD_MODELS) {
      expect(typeof m.endpoints.t2v).toBe("string");
      expect(typeof m.endpoints.i2v).toBe("string");
      expect(typeof m.endpoints.r2v).toBe("string");
    }
  });

  it("adModel 은 모르는 id 를 기본 모델로 받는다", () => {
    expect(adModel("없는모델").id).toBe(DEFAULT_AD_MODEL);
    expect(adModel(undefined).id).toBe(DEFAULT_AD_MODEL);
  });

  it("adEndpoint 가 세 갈래를 돌려준다", () => {
    expect(adEndpoint(DEFAULT_AD_MODEL, "t2v")).toBe("bytedance/seedance-2.0/fast/text-to-video");
    expect(adEndpoint(DEFAULT_AD_MODEL, "i2v")).toBe("bytedance/seedance-2.0/fast/image-to-video");
    expect(adEndpoint(DEFAULT_AD_MODEL, "r2v")).toBe("bytedance/seedance-2.0/fast/reference-to-video");
  });

  it("모르는 갈래는 0 이나 폴백이 아니라 던진다 — 조용히 틀린 모델로 가면 안 된다", () => {
    expect(() => adEndpoint(DEFAULT_AD_MODEL, "x2v")).toThrow();
  });

  it("v1 이 받는 길이는 15초 하나다", () => {
    expect(AD_SECONDS).toEqual([15]);
    expect(isAdSeconds(15)).toBe(true);
    expect(isAdSeconds(30)).toBe(false);
    expect(isAdSeconds("15")).toBe(false);
  });

  it("모델 길이 범위 안에 15초가 들어간다", () => {
    const m = adModel(DEFAULT_AD_MODEL);
    expect(m.minSeconds).toBeLessThanOrEqual(15);
    expect(m.maxSeconds).toBeGreaterThanOrEqual(15);
  });

  it("import 문이 없다 — 화면이 읽어도 fs 가 안 딸려온다", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile(new URL("../lib/ad/models.js", import.meta.url), "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
  });
});
