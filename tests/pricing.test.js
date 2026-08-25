// 가격표 — 이 저장소에서 값이 바뀔 것을 전제로 만든 유일한 자리다.
// 숫자 자체보다 "표 밖에 숫자가 없다"와 "경계에서 어느 쪽으로 떨어지나"를 못 박는다.
import { describe, it, expect } from "vitest";
import { VIDEO_PRICE, REGEN_PRICE, FREE_REGEN_PER_CUT, DEFAULT_GRANT, videoPrice, regenPrice, AD_VIDEO_PRICE, adVideoPrice, MAX_SCENARIO_TRIES } from "../lib/pricing.js";
import { TARGET_CHOICES } from "../lib/script.js";
import { AD_MODELS, DEFAULT_AD_MODEL, DEFAULT_AD_RESOLUTION, adSecondsFor, adResolutionsFor } from "../lib/ad/models.js";
// ★ lib/pricing.js 는 화면이 import 하는 파일이라 lib/clip-limits.js 를 끌어올 수 없다
//   (import 사슬 끝에 fs 가 닿으면 번들이 깨진다). 그래서 해상도 문자열을 양쪽에 따로 적고,
//   두 목록이 갈리는 자리는 **테스트가** 대조한다 — 테스트는 화면이 아니라 import 해도 된다.
import { CLIP_PROFILES, I2V_MODELS } from "../lib/clip-limits.js";

// AD_VIDEO_PRICE 의 칸이 숫자(해상도 무관)일 수도, 객체(해상도별)일 수도 있다
// (lib/pricing.js 상단 주석 참고) — 테스트에서 "그 조합의 실제 가격"을 한 줄로 뽑는 헬퍼.
const cellPrice = (modelId, seconds, resolution) => {
  const cell = AD_VIDEO_PRICE[modelId][seconds];
  return typeof cell === "number" ? cell : cell[resolution];
};

// 표가 길이 × 모델로 갈라진 뒤에도 아래 성질은 **모델마다** 그대로여야 한다.
const MODELS = ["seedance-2.0", "kling-v3"];
// 모델을 안 넘긴 호출이 떨어지는 자리(= 옛 프로젝트). lib/pricing.js 의 LEGACY_MODEL 과 같다.
const LEGACY = "kling-v3";
// 해상도 축이 생기기 전의 값이 그대로 사는 열. 옛 호출(해상도 없음)이 떨어지는 자리이기도 하다
// — lib/pricing.js 의 PRICE_DEFAULT_RESOLUTION 과 같은 값이어야 한다.
const RES = "720p";

describe("가격표", () => {
  it("고를 수 있는 길이 전부에 값이 있다", () => {
    for (const m of MODELS) {
      for (const s of TARGET_CHOICES) {
        expect(typeof VIDEO_PRICE[m][RES][s]).toBe("number");
        expect(VIDEO_PRICE[m][RES][s]).toBeGreaterThan(0);
      }
    }
  });

  it("길이에 비례한다 — 원가가 컷 수에 비례하기 때문이다", () => {
    for (const m of MODELS) {
      expect(VIDEO_PRICE[m][RES][30]).toBeGreaterThan(VIDEO_PRICE[m][RES][15]);
      expect(VIDEO_PRICE[m][RES][60]).toBeGreaterThan(VIDEO_PRICE[m][RES][45]);
    }
  });

  it("videoPrice 는 목록 밖 값을 기본 길이(30초) 값으로 받는다", () => {
    for (const m of MODELS) {
      expect(videoPrice(30, m)).toBe(VIDEO_PRICE[m][RES][30]);
      expect(videoPrice(null, m)).toBe(VIDEO_PRICE[m][RES][30]);
      expect(videoPrice(7, m)).toBe(VIDEO_PRICE[m][RES][30]);
    }
    // 모델을 안 넘긴 옛 호출도 같은 규칙을 옛 모델 표에서 탄다
    expect(videoPrice(null)).toBe(VIDEO_PRICE[LEGACY][RES][30]);
  });

  it("컷당 첫 재생성은 공짜, 그 뒤는 정가", () => {
    expect(FREE_REGEN_PER_CUT).toBe(1);
    for (const m of MODELS) {
      expect(regenPrice("image", 0, m)).toBe(0);
      expect(regenPrice("image", 1, m)).toBe(REGEN_PRICE.image);
      expect(regenPrice("clip", 2, m)).toBe(REGEN_PRICE.clip[m][RES]);
      expect(regenPrice("voice", 1, m)).toBe(REGEN_PRICE.voice);
    }
    expect(regenPrice("clip", 2)).toBe(REGEN_PRICE.clip[LEGACY][RES]);
  });

  it("모르는 재생성 종류는 0 이 아니라 던진다 — 조용히 공짜가 되면 안 된다", () => {
    expect(() => regenPrice("사진", 1)).toThrow();
  });

  it("클립 재생성이 이미지보다 비싸다 — 실측 원가가 그렇다($0.42 대 $0.08)", () => {
    for (const m of MODELS) {
      expect(REGEN_PRICE.clip[m][RES]).toBeGreaterThan(REGEN_PRICE.image);
    }
  });

  it("기본 지급값이 30초 몇 편치는 된다", () => {
    expect(DEFAULT_GRANT).toBeGreaterThanOrEqual(VIDEO_PRICE[LEGACY][RES][30] * 2);
  });
});

describe("모델별 정가", () => {
  it("Seedance 는 원가 비례로 비싸다", () => {
    expect(videoPrice(15, "seedance-2.0")).toBe(80);
    expect(videoPrice(30, "seedance-2.0")).toBe(160);
    expect(videoPrice(45, "seedance-2.0")).toBe(240);
    expect(videoPrice(60, "seedance-2.0")).toBe(320);
  });

  it("Kling 정가는 그대로다 — 옛 프로젝트의 값이 바뀌면 안 된다", () => {
    expect(videoPrice(15, "kling-v3")).toBe(25);
    expect(videoPrice(30, "kling-v3")).toBe(50);
    expect(videoPrice(45, "kling-v3")).toBe(75);
    expect(videoPrice(60, "kling-v3")).toBe(100);
  });

  // ★★ 모델을 안 넘긴 옛 호출은 옛 프로젝트다 — Kling 으로 봐야 한다
  it("모델을 안 주면 Kling 값이다", () => {
    expect(videoPrice(30)).toBe(50);
    expect(videoPrice(30, undefined)).toBe(50);
    expect(videoPrice(30, "뒤죽박죽")).toBe(50);
  });

  it("길이를 모르면 30초 값으로 본다 — 모델별로", () => {
    expect(videoPrice(null, "seedance-2.0")).toBe(160);
    expect(videoPrice(7, "seedance-2.0")).toBe(160);
    expect(videoPrice(null, "kling-v3")).toBe(50);
  });

  it("클립 재생성도 모델을 탄다", () => {
    expect(regenPrice("clip", 1, "seedance-2.0")).toBe(25);
    expect(regenPrice("clip", 1, "kling-v3")).toBe(8);
    expect(regenPrice("clip", 1)).toBe(8);
  });

  it("이미지·목소리는 모델과 무관하다", () => {
    for (const m of ["seedance-2.0", "kling-v3", undefined]) {
      expect(regenPrice("image", 1, m)).toBe(2);
      expect(regenPrice("voice", 1, m)).toBe(1);
    }
  });

  it("컷마다 첫 회는 여전히 무료다", () => {
    expect(regenPrice("clip", 0, "seedance-2.0")).toBe(0);
    expect(regenPrice("image", 0, "seedance-2.0")).toBe(0);
  });

  // ★ 오타로 조용히 공짜가 되는 것이 이 표에서 가장 위험하다
  it("모르는 재생성 종류는 던진다", () => {
    expect(() => regenPrice("클립", 1, "seedance-2.0")).toThrow();
  });

  it("두 모델이 같은 길이 눈금을 덮는다 — 한쪽만 값이 빠지면 안 된다", () => {
    for (const m of ["seedance-2.0", "seedance-2.5", "kling-v3"]) {
      // 해상도 열마다 눈금이 똑같아야 한다 — 한 열만 60초가 빠지면 그 조합이 30초 값으로 샌다
      for (const table of Object.values(VIDEO_PRICE[m])) {
        expect(Object.keys(table).map(Number).sort((a, b) => a - b)).toEqual([15, 30, 45, 60]);
      }
    }
    expect(Object.keys(REGEN_PRICE.clip).sort()).toEqual(["kling-v3", "seedance-2.0", "seedance-2.5"]);
  });
});

describe("해상도별 가격", () => {
  it("옛 호출(해상도 없음)은 720p 값과 같다", () => {
    // 이 작업의 하드 제약 — 이미 만든 프로젝트의 가격이 소급해 바뀌면 안 된다
    expect(videoPrice(30, "seedance-2.0")).toBe(160);
    expect(videoPrice(30, "seedance-2.0", "720p")).toBe(160);
    expect(videoPrice(15, "seedance-2.0")).toBe(80);
  });

  // 1080p 는 원가비(2.25)가 크레딧에 **그대로** 살아 있다 — 그러니 관계식으로 적는다.
  // 하드코딩 숫자만 보면 표를 만질 때 관계가 깨져도 통과한다.
  it("1080p 는 720p 의 2.25배다 — 픽셀수 비", () => {
    expect(videoPrice(30, "seedance-2.0", "1080p")).toBe(videoPrice(30, "seedance-2.0") * 2.25);
    expect(videoPrice(15, "seedance-2.0", "1080p")).toBe(videoPrice(15, "seedance-2.0") * 2.25);
    expect(videoPrice(30, "seedance-2.0", "1080p")).toBe(360);
    expect(videoPrice(15, "seedance-2.0", "1080p")).toBe(180);
  });

  // ★ 480p 는 관계식으로 못 적는다 — 원가비는 4/9(≈0.444)인데 크레딧은 그것을 5의 배수로
  //   올려 결과가 **1/2** 이 됐다(lib/pricing.js 의 표 주석 참고). 이름이 "4/9" 라고 적혀
  //   있으면 본문이 재는 것과 달라서, 값이 4/9 가 아닌데도 초록이라 아무도 안 잡는다.
  it("480p 는 720p 의 절반이다 — 원가비 4/9 를 5의 배수로 올린 값", () => {
    expect(videoPrice(30, "seedance-2.0", "480p")).toBe(videoPrice(30, "seedance-2.0") / 2);
    expect(videoPrice(15, "seedance-2.0", "480p")).toBe(videoPrice(15, "seedance-2.0") / 2);
    expect(videoPrice(30, "seedance-2.0", "480p")).toBe(80);
    expect(videoPrice(15, "seedance-2.0", "480p")).toBe(40);
  });

  it("Kling 은 해상도를 안 받는다 — 무엇을 줘도 같은 값이다", () => {
    expect(videoPrice(30, "kling-v3")).toBe(50);
    expect(videoPrice(30, "kling-v3", "1080p")).toBe(50);
  });

  it("재생성도 해상도를 탄다", () => {
    expect(regenPrice("clip", 1, "seedance-2.0")).toBe(25);
    expect(regenPrice("clip", 1, "seedance-2.0", "1080p")).toBe(57);
    expect(regenPrice("clip", 1, "seedance-2.0", "480p")).toBe(12);
    expect(regenPrice("clip", 1, "kling-v3", "1080p")).toBe(8);
  });

  // ★ 두 표가 갈린 상태에서도 **화면은 떠야 한다.** regenPrice 는 ⑤영상 화면이 부르는
  //   자리라 던지면 페이지가 통째로 사라진다 — 값이 틀리는 것보다 그쪽이 나쁘다.
  //   (갈린 것 자체는 아래 대조 테스트가 잡는다. 이건 그때까지의 안전망이다.)
  it("VIDEO_PRICE 에만 있는 모델이 와도 재생성 값이 안 던진다", () => {
    VIDEO_PRICE["임시-신모델"] = { "720p": { 15: 1, 30: 2, 45: 3, 60: 4 } };
    try {
      // priceModel 은 VIDEO_PRICE 를 보고 이 모델을 그대로 돌려주는데 REGEN_PRICE.clip 에는 없다
      expect(() => regenPrice("clip", 1, "임시-신모델")).not.toThrow();
      expect(regenPrice("clip", 1, "임시-신모델")).toBe(REGEN_PRICE.clip[LEGACY][RES]);
    } finally {
      delete VIDEO_PRICE["임시-신모델"];
    }
  });

  it("모르는 해상도는 720p 로 본다", () => {
    // 던지지 않는다 — 가격은 화면이 부르는 자리라 죽으면 페이지가 안 뜬다.
    // 값이 틀리는 것보다 나쁜 것은 화면이 통째로 사라지는 것이다.
    expect(videoPrice(30, "seedance-2.0", "2160p")).toBe(160);
  });

  // ★ 두 목록이 갈릴 자리를 코드가 판정한다 — tests/ad-options.test.js 와 같은 방식.
  //   가격표에 없는 해상도를 화면이 띄우면 사장님이 고른 순간 720p 값으로 조용히 청구된다.
  it("가격표와 모델 프로필의 해상도 목록이 같다", () => {
    for (const profile of CLIP_PROFILES) {
      const model = I2V_MODELS.find((m) => m.endpoint.startsWith(profile.prefix));
      if (!model) continue; // 사장님이 못 고르는 옛 모델(LTX)은 가격표에 없어도 된다
      const priced = VIDEO_PRICE[model.id];
      expect(priced, `${model.id} 가 가격표에 없다`).toBeTruthy();
      for (const res of profile.resolutions) {
        expect(priced[res], `${model.id} 의 ${res} 가격이 없다`).toBeTruthy();
        // ★ 재생성 표도 같이 본다. 여기를 빠뜨리면 화면은 그 해상도를 띄우는데 재생성은
        //   조용히 720p 값을 청구한다 — 값이 안 맞는데 아무도 안 죽는 가장 나쁜 모양이다.
        expect(REGEN_PRICE.clip[model.id]?.[res], `${model.id} 의 ${res} 재생성 가격이 없다`).toBeTruthy();
      }
      // 해상도를 안 받는 모델도 720p 한 칸은 있어야 videoPrice·regenPrice 가 떨어질 자리가 있다
      if (!profile.resolutions.length) {
        expect(priced["720p"]).toBeTruthy();
        expect(REGEN_PRICE.clip[model.id]?.["720p"]).toBeTruthy();
      }
    }
  });
});

// 크레딧은 **개수**다 — 0.7 크레딧으로 살 수 있는 것이 없고, 화면에 "24.4 크레딧 차감"이
// 뜨면 사장님은 그것이 무슨 뜻인지 모른다(2026-08-13 사용자 결정: 정수 단위로 계산하고,
// 원가에서 소수가 떨어지면 반올림해서 차감한다).
describe("값은 늘 정수다", () => {
  it("표의 값이 전부 정수다", () => {
    for (const byRes of Object.values(VIDEO_PRICE)) {
      for (const [res, table] of Object.entries(byRes)) {
        for (const [seconds, credits] of Object.entries(table)) {
          expect(Number.isInteger(credits), `VIDEO_PRICE ${res} ${seconds}초가 소수다`).toBe(true);
        }
      }
    }
    for (const [kind, entry] of Object.entries(REGEN_PRICE)) {
      // clip 만 모델 → 해상도의 2단이고 나머지는 숫자 하나다
      const values = typeof entry === "number" ? [entry] : Object.values(entry).flatMap((v) => (typeof v === "number" ? [v] : Object.values(v)));
      for (const v of values) expect(Number.isInteger(v), `REGEN_PRICE ${kind} 가 소수다`).toBe(true);
    }
  });

  // ★ 표를 정수로 지키는 것만으로는 부족하다. 원가가 바뀌어 누가 24.4 를 적어 넣는 날,
  // 그 소수가 그대로 장부에 들어가고 잔액이 소수가 된다. 나가는 자리에서 막는다.
  it("표에 소수가 들어와도 반올림해서 나간다", () => {
    const before = VIDEO_PRICE["kling-v3"][RES][30];
    try {
      VIDEO_PRICE["kling-v3"][RES][30] = 24.4;
      expect(videoPrice(30, "kling-v3")).toBe(24);
      VIDEO_PRICE["kling-v3"][RES][30] = 24.6;
      expect(videoPrice(30, "kling-v3")).toBe(25);
    } finally {
      VIDEO_PRICE["kling-v3"][RES][30] = before;
    }
  });

  it("재생성 값도 반올림해서 나간다", () => {
    const before = REGEN_PRICE.image;
    try {
      REGEN_PRICE.image = 2.5;
      expect(regenPrice("image", 1)).toBe(3);
      REGEN_PRICE.image = 2.4;
      expect(regenPrice("image", 1)).toBe(2);
    } finally {
      REGEN_PRICE.image = before;
    }
  });

  it("공짜 회차는 그대로 0 이다", () => {
    expect(regenPrice("image", 0)).toBe(0);
  });
});

describe("광고 영상 정가", () => {
  // ★ Task 21 — 길이가 모델에 딸린다. 표가 모델 id → 길이 → 크레딧의 2단이 됐다.
  // ★ Task 24 — 해상도가 셋째 축이 됐다(칸이 숫자 또는 해상도별 객체). lib/pricing.js 는
  // lib/ad/models.js 를 import 하지 못하므로(화면 번들 규율) 두 표가 갈리지 않는지는
  // 여기서 AD_MODELS 를 훑어 대조한다.
  it("모델·길이·해상도 조합 전부에 값이 있다 — 두 표가 갈리지 않는다", () => {
    for (const m of AD_MODELS) {
      for (const s of adSecondsFor(m.id)) {
        const cell = AD_VIDEO_PRICE[m.id]?.[s];
        expect(cell, `${m.id}/${s} 칸이 없다`).toBeDefined();
        if (typeof cell === "number") {
          expect(cell).toBeGreaterThan(0);
          continue;
        }
        for (const r of adResolutionsFor(m.id)) {
          expect(typeof cell[r], `${m.id}/${s}/${r} 값이 없다`).toBe("number");
          expect(cell[r]).toBeGreaterThan(0);
        }
      }
    }
  });

  it("2.0/15초/720p = 80 · 2.5/15초/720p = 120 · 2.5/30초/720p = 240 — 원가 계산에서 뽑은 값", () => {
    expect(cellPrice("seedance-2.0", 15, "720p")).toBe(80);
    expect(cellPrice("seedance-2.5", 15, "720p")).toBe(120);
    expect(cellPrice("seedance-2.5", 30, "720p")).toBe(240);
  });


  it("★ standard 만 1080p 값이 있다 — 1080p 가 720p 보다 비싸다", () => {
    expect(AD_VIDEO_PRICE["seedance-2.0"][15]["1080p"]).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
  });

  it("길이에 비례한다 — 2.5 는 30초가 15초의 두 배 원가다(네이티브 단일 패스, 눈금 없음)", () => {
    expect(cellPrice("seedance-2.5", 30, "720p")).toBeGreaterThan(cellPrice("seedance-2.5", 15, "720p"));
    expect(cellPrice("seedance-2.5", 30, "480p")).toBeGreaterThan(cellPrice("seedance-2.5", 15, "480p"));
  });

  it("해상도가 높을수록 비싸다 — 같은 길이·모델에서 480p < 720p", () => {
    expect(cellPrice("seedance-2.5", 15, "720p")).toBeGreaterThan(cellPrice("seedance-2.5", 15, "480p"));
    expect(cellPrice("seedance-2.5", 30, "720p")).toBeGreaterThan(cellPrice("seedance-2.5", 30, "480p"));
    expect(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0"][15]["480p"]);
  });


  it("★ 기존 영상 정가와 섞이지 않는다 — 표가 둘이다", () => {
    expect(cellPrice("seedance-2.0", 15, "720p")).not.toBe(VIDEO_PRICE[15]);
  });

  it("adVideoPrice(seconds, modelId, resolution) 가 모델·길이·해상도 조합대로 값을 낸다", () => {
    expect(adVideoPrice(15, "seedance-2.0", "720p")).toBe(80);
    expect(adVideoPrice(15, "seedance-2.0", "1080p")).toBe(175);
    expect(adVideoPrice(15, "seedance-2.0", "480p")).toBe(35);
    expect(adVideoPrice(15, "seedance-2.5", "720p")).toBe(120);
    expect(adVideoPrice(30, "seedance-2.5", "720p")).toBe(240);
    expect(adVideoPrice(30, "seedance-2.5", "480p")).toBe(110);
  });

  // ③ 옛 문서 보호 — settings.model·settings.resolution 이 없는 옛 광고 문서는
  // 2.0(standard)·720p 값으로 봐야 한다. 반대로 두면 이미 만든 영상들이 갑자기 다른
  // 값으로 청구된다. ⚠️ 지금까지 만들어진 광고는 전부 실제로 fast 모델이었다(옛 기본값) —
  // 하지만 그 문서들은 settings.model 을 **명시 저장**했으므로(app/api/ads/route.js) 여기
  // "모델 생략" 경로를 타지 않는다. 이 폴백은 "정말 아무 값도 없는" 방어적 옛 문서용이다.
  it("★ 모델·해상도를 생략하면(옛 문서·옛 호출부) 기본 모델(standard)·720p 값으로 본다", () => {
    expect(adVideoPrice(15)).toBe(AD_VIDEO_PRICE[DEFAULT_AD_MODEL][15][DEFAULT_AD_RESOLUTION]);
    expect(adVideoPrice(15, undefined)).toBe(AD_VIDEO_PRICE[DEFAULT_AD_MODEL][15][DEFAULT_AD_RESOLUTION]);
    expect(adVideoPrice(15, null)).toBe(AD_VIDEO_PRICE[DEFAULT_AD_MODEL][15][DEFAULT_AD_RESOLUTION]);
    expect(adVideoPrice(15, "seedance-2.0")).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
    expect(adVideoPrice(15, "seedance-2.0", undefined)).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
    expect(adVideoPrice(15, "seedance-2.0", null)).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
  });

  // 해상도 무관 칸(fast)은 resolution 을 생략해도 값이 안 갈린다.
  
  // ④ 모르는 모델이 조용히 싼 값으로 새면 그 차액이 그대로 우리 돈이다 — regenPrice 와
  // 같은 원칙으로 던진다. "생략"(위 테스트)과 "값은 있는데 모르는 모델"을 가른다.
  it("★ 값이 있는데 모르는 모델은 던진다 — 조용히 기본값으로 떨어지면 안 된다", () => {
    // 메시지까지 확인한다 — 가드를 지워도 table 이 undefined 라 Object.keys(undefined) 가
    // 다른 TypeError 를 던져 toThrow() 만으로는 가드 자체가 있는지 못 가린다(우연히 초록).
    // 메시지 문구("모르는 광고 모델")로 **이 가드가 실제로 도는지**를 확인한다.
    expect(() => adVideoPrice(15, "seedance-3.0-오타")).toThrow(/모르는 광고 모델/);
    expect(() => adVideoPrice(30, "없는모델")).toThrow(/모르는 광고 모델/);
  });


  it("길이가 그 모델의 목록 밖이면 더 비싼 쪽으로 본다 — 싼 쪽으로 떨어지면 원가보다 적게 청구한다", () => {
    expect(adVideoPrice(999, "seedance-2.5", "720p")).toBe(cellPrice("seedance-2.5", 30, "720p"));
    expect(adVideoPrice(null, "seedance-2.0", "720p")).toBe(cellPrice("seedance-2.0", 15, "720p"));
  });

  it("시나리오 다시 쓰기 상한이 있다 — 무료·무제한이면 원가가 샌다", () => {
    expect(MAX_SCENARIO_TRIES).toBe(20);
  });
});
