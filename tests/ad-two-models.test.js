// 광고 모델은 **둘뿐이다** — 2.0 과 2.5 (2026-08-13 사용자 결정).
//
// 그전에는 셋이었다: 기본(2.0 standard) · 저가(2.0 fast) · 2.5. "기본/저가"라는 이름은
// fal 의 모델 이름이 아니라 우리가 붙인 등급이라, 사장님이 고른 것과 fal 이 받는 것이
// 머릿속에서 이어지지 않았다. 이제 이름도 값도 fal 과 **글자 그대로** 맞춘다.
import { describe, it, expect } from "vitest";
import { AD_MODELS, adModel, adResolutionsFor, adEndpoint, DEFAULT_AD_MODEL, LEGACY_AD_MODEL } from "../lib/ad/models.js";
import { AD_VIDEO_PRICE } from "../lib/pricing.js";

describe("광고 모델은 2.0 과 2.5 둘뿐이다", () => {
  // ★ 2026-08-21 — 셋이 됐다(MiniMax H3 추가). 이 시험이 지키는 것은 "개수"가 아니라
  //   **표가 손대지 않은 채 늘어나지 않는 것**이다 — 모델을 더할 때 이 줄을 함께 고치면
  //   그 순간 원가표·가격표·등급표도 같이 봐야 한다는 것을 알게 된다.
  it("표에 있는 모델은 셋이다 — 2.0 · 2.5 · H3", () => {
    expect(AD_MODELS.map((m) => m.id).sort()).toEqual(["minimax-h3", "seedance-2.0", "seedance-2.5"]);
  });

  it("fast 티어는 없다 — 등급이 아니라 모델로 고른다", () => {
    expect(AD_MODELS.some((m) => m.id.includes("fast"))).toBe(false);
    expect(AD_VIDEO_PRICE["seedance-2.0-fast"]).toBeUndefined();
  });

  // ★★★ **뒤집혔다**(2026-08-31 사장님 지시). 그전의 이 판은 정반대를 지켰다 —
  //   "label 은 모델 id 안에 들어 있는 조각이어야 한다(2.0·2.5·H3), 우리가 붙인 등급이면
  //   사장님이 고른 것과 fal 이 받는 것이 머릿속에서 안 이어진다"(2026-08-13).
  //
  //   왜 뒤집는가: 그 사이 모델이 셋이 되고 **계보가 다른 두 회사 것이 섞였다**.
  //   "2.0"·"2.5"·"H3" 는 어느 것이 더 좋은지·비싼지를 한 글자도 말해 주지 않는다.
  //   고르는 자리에 필요한 것은 그 답이다 — 그래서 등급으로 부른다.
  // ★ 그때의 걱정(화면 이름과 fal 이 갈린다)은 **id 로 막는다** — 값·원장·fal 호출은
  //   전부 id 로만 가고, 아래 "엔드포인트가 모델 id 를 그대로 담는다" 가 그것을 지킨다.
  // ⚠️ 2026-09-01 — 프로가 2.5 → 2.0 으로 뒤집혔고, 거르는 축에 `retired` 가 생겼다.
  it("고를 수 있는 모델의 이름은 등급이다 — 기본 · 프로", () => {
    const open = AD_MODELS.filter((m) => !m.hidden && !m.retired);
    expect(open.map((m) => m.label).sort()).toEqual(["기본", "프로"]);
    for (const m of open) {
      expect(m.name, `${m.id} 의 name 이 등급이 아니다`).toBe(m.label);
    }
  });

  it("★ 숨긴 모델은 등급 이름을 안 받는다 — 옛 문서에서만 보이는 이름이라 모델 이름이 맞다", () => {
    for (const m of AD_MODELS.filter((m) => m.hidden)) {
      expect(m.label, `${m.id}`).not.toMatch(/^(기본|프로)$/);
    }
  });
});

describe("해상도는 모델이 실제로 지원하는 것만", () => {
  it("2.0 은 480p·720p·1080p", () => {
    expect(adResolutionsFor("seedance-2.0")).toEqual(["480p", "720p", "1080p"]);
  });

  it("2.5 는 480p·720p — 1080p 는 없다", () => {
    expect(adResolutionsFor("seedance-2.5")).toEqual(["480p", "720p"]);
  });
});

describe("고른 것이 fal 이 받는 것과 글자 그대로 같다", () => {
  // 엔드포인트는 fal 문서의 모델 경로 그대로여야 한다 — 한 글자만 달라도 404 인데,
  // 그때는 이미 값을 치른 뒤다.
  it("엔드포인트가 모델 id 를 그대로 담는다", () => {
    for (const m of AD_MODELS) {
      // ★ 모델 id 에서 공급자·버전을 뽑아 엔드포인트가 그것을 담는지 본다.
      //   seedance-2.0 → bytedance/seedance-2.0/… · minimax-h3 → minimax/h3/…
      const [vendorPart, ...rest] = m.id.split("-");
      const vendor = vendorPart === "seedance" ? "bytedance" : vendorPart;
      const name = vendorPart === "seedance" ? m.id : rest.join("-");
      for (const kind of ["t2v", "i2v", "r2v"]) {
        const e = adEndpoint(m.id, kind);
        expect(e, `${m.id}/${kind}`).toMatch(new RegExp(`^${vendor}/${name.replace(/\./g, "\.")}/`));
        // 등급 세그먼트가 끼면 다른 모델을 부르는 것이다
        expect(e, `${m.id}/${kind} 에 fast 가 섞였다`).not.toContain("/fast/");
      }
    }
  });

  // ★★ 2026-08-31 — "정확히 같다"를 **"빠진 것이 없다"**로 고쳤다. 방향이 하나 늘었기
  //   때문이다: 고를 수 있는 해상도에 값이 없으면 adVideoPrice 가 던져 화면이 죽는다(그건
  //   여전히 막는다). 반대로 **값만 남고 못 고르는 칸**은 이제 정상이다 — H3 의 4K 가 그
  //   자리다(고르는 목록에서 뺐지만 이미 4K 로 만든 문서가 값을 조회한다).
  it("고를 수 있는 해상도는 전부 가격표에 있다 — 빠지면 그 자리에서 던진다", () => {
    for (const m of AD_MODELS) {
      for (const sec of m.seconds) {
        const cell = AD_VIDEO_PRICE[m.id]?.[sec];
        expect(cell, `${m.id} ${sec}초 값이 없다`).toBeTruthy();
        // ★ 관리자 전용 해상도도 **가격이 있어야 한다** — 관리자가 만들어도 청구·기록은
        //   똑같이 돌아야 하고, 값이 없으면 adVideoPrice 가 던져 화면이 죽는다.
        for (const res of [...m.resolutions, ...(m.adminResolutions || [])]) {
          expect(cell[res], `${m.id} ${sec}초 ${res} 값이 없다`).toBeDefined();
        }
      }
    }
  });

  // ★★ 2026-08-31 — 기본이 2.0 → 기본(H3)으로 옮겼다(2.0 을 숨기면서). 그러면서 상수가
  //   둘로 갈렸다 — **새로 만들 때의 기본**과 **모델을 안 든 옛 문서의 폴백**은 다른 축이다.
  it("새로 만들 때의 기본 모델은 기본(H3)이다", () => {
    expect(DEFAULT_AD_MODEL).toBe("minimax-h3");
    // 숨긴 모델을 기본으로 두면 새 광고가 접수 자리에서 403 이 난다.
    expect(adModel(DEFAULT_AD_MODEL).hidden).toBeFalsy();
  });

  it("옛 문서의 폴백은 2.0 이다 — 그때 그 모델로 만들어졌다", () => {
    expect(LEGACY_AD_MODEL).toBe("seedance-2.0");
    expect(adModel(LEGACY_AD_MODEL).resolutions).toContain("1080p");
  });
});
