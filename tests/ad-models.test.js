// 모델 표 — 엔드포인트 문자열이 사는 유일한 자리.
// 값보다 "표 밖에 문자열이 없다"와 "모르는 값이 어디로 떨어지나"를 못 박는다.
import { describe, it, expect } from "vitest";
import {
  AD_MODELS, DEFAULT_AD_MODEL, DEFAULT_AD_RESOLUTION,
  adModel, adEndpoint, isAdModel, adSecondsFor, isAdSeconds,
  adResolutionsFor, isAdResolution,
} from "../lib/ad/models.js";

describe("광고 모델 표", () => {
  it("기본 모델이 표에 있다", () => {
    expect(AD_MODELS.some((m) => m.id === DEFAULT_AD_MODEL)).toBe(true);
  });

  // ★ Task 24 — 기본이 fast 에서 standard 로 바뀐다. standard 라야 1080p 가 열린다.
  it("★ 기본 모델이 standard 다 — 엔드포인트에 /fast/ 가 없다", () => {
    expect(DEFAULT_AD_MODEL).toBe("seedance-2.0");
    expect(adEndpoint(DEFAULT_AD_MODEL, "t2v")).not.toMatch(/\/fast\//);
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

  it("adEndpoint 가 세 갈래를 돌려준다 — 기본 모델(2.0 standard)", () => {
    expect(adEndpoint(DEFAULT_AD_MODEL, "t2v")).toBe("bytedance/seedance-2.0/text-to-video");
    expect(adEndpoint(DEFAULT_AD_MODEL, "i2v")).toBe("bytedance/seedance-2.0/image-to-video");
    expect(adEndpoint(DEFAULT_AD_MODEL, "r2v")).toBe("bytedance/seedance-2.0/reference-to-video");
  });


  // ★ Task 21 — 2.5 추가. 엔드포인트 문자열은 미검증(문서 기준)이라 값 자체보다
  // "표에 있고 t2v/i2v/r2v 가 갈린다"만 못 박는다.
  it("adEndpoint 가 세 갈래를 돌려준다 — 2.5", () => {
    expect(adEndpoint("seedance-2.5", "t2v")).toBe("bytedance/seedance-2.5/text-to-video");
    expect(adEndpoint("seedance-2.5", "i2v")).toBe("bytedance/seedance-2.5/image-to-video");
    expect(adEndpoint("seedance-2.5", "r2v")).toBe("bytedance/seedance-2.5/reference-to-video");
  });

  it("모르는 갈래는 0 이나 폴백이 아니라 던진다 — 조용히 틀린 모델로 가면 안 된다", () => {
    expect(() => adEndpoint(DEFAULT_AD_MODEL, "x2v")).toThrow();
  });

  // ── 닫힌 목록(isAdModel) ──────────────────────────────────────────────
  it("isAdModel — 표에 있는 id 만 참이다(adModel 과 달리 관대하게 안 떨어진다)", () => {
    expect(isAdModel("seedance-2.0")).toBe(true);
    expect(isAdModel("seedance-2.5")).toBe(true);
    // fast 티어는 2026-08-13 에 사라졌다 — 이제 모르는 id 다
    expect(isAdModel("seedance-2.0-fast")).toBe(false);
    expect(isAdModel("seedance-2.5")).toBe(true);
    expect(isAdModel("없는모델")).toBe(false);
    expect(isAdModel(undefined)).toBe(false);
  });

  // ── 길이가 모델마다 다르다(Task 21) ───────────────────────────────────
  it("모델마다 고를 수 있는 길이가 다르다 — 2.0 계열은 15초 하나, 2.5 는 15·30초", () => {
    expect(adSecondsFor("seedance-2.0")).toEqual([15]);
    expect(adSecondsFor("seedance-2.0")).toEqual([15]);
    expect(adSecondsFor("seedance-2.5")).toEqual([15, 30]);
  });

  it("isAdSeconds 가 모델을 받는다 — 2.5 에서는 30 초도 되고 2.0 에서는 안 된다", () => {
    expect(isAdSeconds(30, "seedance-2.5")).toBe(true);
    expect(isAdSeconds(15, "seedance-2.5")).toBe(true);
    expect(isAdSeconds(30, "seedance-2.0")).toBe(false);
    expect(isAdSeconds(15, "seedance-2.0")).toBe(true);
  });

  // 옛 호출부 호환 — 모델을 안 주면 기본 모델(2.0 standard) 기준이다.
  it("isAdSeconds 는 모델을 생략하면 기본 모델(2.0 standard) 기준으로 본다", () => {
    expect(isAdSeconds(15)).toBe(true);
    expect(isAdSeconds(30)).toBe(false);
    expect(isAdSeconds("15")).toBe(false);
  });

  it("모르는 모델의 길이를 물어도 기본 모델 기준으로 관대하게 떨어진다(돈이 안 걸린 축이라 안전)", () => {
    expect(adSecondsFor("없는모델")).toEqual([15]);
    expect(isAdSeconds(15, "없는모델")).toBe(true);
  });

  it("모델 길이 범위 안에 그 모델의 고를 수 있는 길이가 전부 들어간다", () => {
    for (const m of AD_MODELS) {
      for (const s of m.seconds) {
        expect(s).toBeGreaterThanOrEqual(m.minSeconds);
        expect(s).toBeLessThanOrEqual(m.maxSeconds);
      }
    }
  });

  it("2.5 의 최대 길이가 2.0 보다 길다 — 네이티브 단일 패스로 30초까지 만든다", () => {
    expect(adModel("seedance-2.5").maxSeconds).toBeGreaterThan(adModel("seedance-2.0").maxSeconds);
  });

  // ── 해상도가 셋째 축이다(Task 24) ───────────────────────────────────
  it("모델마다 고를 수 있는 해상도가 다르다 — 2.0 만 1080p 가 열린다", () => {
    expect(adResolutionsFor("seedance-2.0")).toEqual(["480p", "720p", "1080p"]);
    expect(adResolutionsFor("seedance-2.5")).toEqual(["480p", "720p"]);
    expect(adResolutionsFor("seedance-2.5")).toEqual(["480p", "720p"]);
  });

  it("★ isAdResolution — 2.0 은 1080p 를 받고 2.5 는 안 받는다", () => {
    expect(isAdResolution("1080p", "seedance-2.0")).toBe(true);
    // fast 티어는 사라졌다 — 모르는 id 는 기본 모델(2.0) 기준이라 1080p 가 열린다
    expect(isAdResolution("1080p", "seedance-2.5")).toBe(false);
  });

  it("720p 는 모든 모델이 받는다 — 기본 해상도와 같은 값이다", () => {
    expect(DEFAULT_AD_RESOLUTION).toBe("720p");
    for (const m of AD_MODELS) {
      expect(isAdResolution(DEFAULT_AD_RESOLUTION, m.id)).toBe(true);
    }
  });

  it("모르는 해상도는 어떤 모델도 안 받는다", () => {
    expect(isAdResolution("4k", "seedance-2.0")).toBe(false);
  });

  it("모르는 모델의 해상도를 물어도 기본 모델 기준으로 관대하게 떨어진다(돈이 안 걸린 검사)", () => {
    expect(adResolutionsFor("없는모델")).toEqual(adResolutionsFor(DEFAULT_AD_MODEL));
  });

  it("import 문이 없다 — 화면이 읽어도 fs 가 안 딸려온다", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile(new URL("../lib/ad/models.js", import.meta.url), "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
  });
});

// ★ 2.5 를 화면에서 숨긴다(2026-08-13 사용자 요청 — 원가가 크다).
//
// **지우지 않는다.** 지우면 이미 2.5 로 만든 문서가 가격 계산에서 던져 화면째 죽는다
// (오늘 seedance-2.0-fast 에서 실제로 그랬다). 고르는 길만 닫고, 값·엔드포인트·검증은
// 그대로 살려 둔다 — 옛 문서는 계속 열리고 계속 만들 수 있어야 한다.
describe("2.5 는 화면에서만 숨긴다", () => {
  it("표에는 남아 있고 hidden 표시가 붙는다", () => {
    const m = AD_MODELS.find((x) => x.id === "seedance-2.5");
    expect(m, "2.5 가 표에서 사라졌다 — 옛 문서가 죽는다").toBeTruthy();
    expect(m.hidden, "hidden 표시가 없다").toBe(true);
  });

  it("★ 서버는 여전히 받는다 — 이미 2.5 인 프로젝트가 저장·수정·굽기에서 막히면 안 된다", () => {
    expect(isAdModel("seedance-2.5")).toBe(true);
    expect(adSecondsFor("seedance-2.5").length).toBeGreaterThan(0);
    expect(adResolutionsFor("seedance-2.5").length).toBeGreaterThan(0);
  });

  it("기본 모델은 숨김이 아니다 — 숨긴 것이 기본이면 아무도 못 고른다", () => {
    expect(AD_MODELS.find((m) => m.id === DEFAULT_AD_MODEL)?.hidden).toBeFalsy();
  });

  it("고를 수 있는 모델이 하나는 남는다", () => {
    expect(AD_MODELS.filter((m) => !m.hidden).length).toBeGreaterThan(0);
  });
});
