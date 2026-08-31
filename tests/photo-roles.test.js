// **사진을 로고·제품·인물로 받고, 그 라벨을 "변하면 안 되는 레퍼런스" 지시로 싣는다**
// (2026-08-31 사장님 지시).
//
// ★ 그전에는 두 흐름 다 `＋사진` 하나로 전부 받아서, 프롬프트가 그 사진들을 **뭉뚱그려**
//   가리켰다 — 원클릭은 *"첨부한 순서대로 @Image1 · @Image2 다"*, 단계별은
//   *"The attached images show what this scene, the person and the product look like."*
//   즉 **어느 것이 로고이고 어느 것이 제품인지 모델이 몰랐다.**
//
// ★★ 필드 이름이 `role` 인 이유: `resolveCutRefs`(lib/cast.js)가 이미 ref 마다 `kind`
//   (thing·person)를 달고 있다. 같은 함수 안에 뜻이 다른 `kind` 가 둘이면 반드시 헷갈린다.
//
// ★★★ **vision 은 한 줄도 안 건드린다**(사장님 결정 A). 라벨이 대체하는 것은 다섯 칸 중
//   `person` 하나뿐이고, 단계별이 실제로 싣는 `lettering`(제품에 인쇄된 글자)·`what`(색)·
//   `scale` 은 **사진을 봐야만 아는 값**이다. 호출도 한 번에 다섯을 받으므로 라벨을 준다고
//   아낄 값이 없다 — 건너뛰면 잃기만 한다(08-28 "캔 로고 폰트가 달라진다"가 그 자리다).
//
// ★ **옛 문서는 글자 그대로다.** role 이 없으면 프롬프트가 한 글자도 안 바뀐다 —
//   각인(`of`)이 그 글 위에 서 있어서, 바뀌면 이미 값을 치른 클립이 통째로 낡는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PHOTO_ROLES, PHOTO_ROLE_IDS, isPhotoRole, photoRole } from "../lib/photos.js";
import { buildScenarioMessages } from "../lib/ad/scenario.js";
import { buildImagePrompt, buildClipPrompt } from "../lib/cuts.js";

const AD_SETTINGS = {
  model: "minimax-h3", resolution: "2K", seconds: 15, aspect_ratio: "9:16",
  format: "hero", style: "photo", mood: "premium", narration_lang: "ko",
};
const adPrompt = (photos) =>
  buildScenarioMessages({ settings: AD_SETTINGS, material: { text: "소재", photos } }).messages[0].content;

const photo = (id, role) => ({ id, filename: `${id}.png`, url: `/api/uploads/${id}.png`, ...(role ? { role } : {}) });

describe("표 한 곳이 종류를 쥔다", () => {
  it("★ 셋이다 — 로고 · 제품 · 인물", () => {
    expect(PHOTO_ROLE_IDS).toEqual(["logo", "product", "person"]);
  });

  it("항목마다 화면 이름과 두 언어의 지시를 든다", () => {
    for (const r of PHOTO_ROLES) {
      expect(typeof r.label, `${r.id} 의 화면 이름`).toBe("string");
      expect(r.label.length).toBeGreaterThan(0);
      // ko 는 시나리오 LLM 에게(한국어 지시문), en 은 그림·영상 모델에게(영어 프롬프트) 간다.
      expect(typeof r.ko, `${r.id} 의 한국어 지시`).toBe("string");
      expect(typeof r.en, `${r.id} 의 영어 지시`).toBe("string");
    }
  });

  it("★★ 지시가 **변하면 안 된다**고 말한다 — 이것이 이 기능의 전부다", () => {
    for (const r of PHOTO_ROLES) {
      expect(r.ko, `${r.id} 의 한국어 지시에 불변 지시가 없다`).toMatch(/절대|그대로|바꾸지/);
      expect(r.en, `${r.id} 의 영어 지시에 불변 지시가 없다`).toMatch(/never|exactly|unchanged/i);
    }
  });

  it("모르는 값은 종류가 아니다 — 라우트가 이 판정으로 막는다", () => {
    expect(isPhotoRole("logo")).toBe(true);
    expect(isPhotoRole("배경")).toBe(false);
    expect(isPhotoRole(undefined)).toBe(false);
    expect(photoRole("없는것")).toBeNull();
  });
});

describe("원클릭 — 장마다 한 줄", () => {
  it("★ 종류를 말하고, 모델이 부르는 이름을 함께 준다", () => {
    const p = adPrompt([photo("a", "logo"), photo("b", "product")]);
    // 이름은 모델 표(adRefLabel)가 만든다 — H3 는 "Image 1" 이다.
    expect(p).toMatch(/Image 1[\s\S]{0,80}로고/);
    expect(p).toMatch(/Image 2[\s\S]{0,80}제품/);
  });

  it("★★ 불변 지시가 실린다", () => {
    const p = adPrompt([photo("a", "logo")]);
    expect(p).toMatch(/절대|그대로|바꾸지/);
  });

  it("★ 종류가 없으면 예전 그대로다 — 한 글자도 안 붙는다(회귀 0)", () => {
    const before = adPrompt([photo("a"), photo("b")]);
    for (const r of PHOTO_ROLES) expect(before, `${r.label} 문구가 새어 나왔다`).not.toContain(r.ko);
  });

  it("★ 섞여 있으면 종류를 든 것만 말한다", () => {
    const p = adPrompt([photo("a", "logo"), photo("b")]);
    expect(p).toContain(photoRole("logo").ko);
    expect(p).not.toContain(photoRole("product").ko);
  });
});

describe("단계별 그림 — 참조 사진마다 한 줄", () => {
  const project = (photos) => ({
    id: "pid", material: { text: "소재", photos },
    settings: { aspect_ratio: "9:16", style: { preset: "photo" } },
  });
  const cut = { idx: 0, shows: "a bench", seconds: 5 };

  it("★ 종류를 영어로 말한다 — 그림 모델이 읽는 자리다", () => {
    const p = buildImagePrompt(cut, project([photo("a", "logo")]), [{ photo_id: "a" }]);
    expect(p).toContain(photoRole("logo").en);
  });

  it("★ 번호가 붙는다 — 어느 첨부인지 가리켜야 뜻이 있다", () => {
    const p = buildImagePrompt(cut, project([photo("a", "logo"), photo("b", "person")]),
      [{ photo_id: "a" }, { photo_id: "b" }]);
    expect(p).toMatch(/\[1\][\s\S]{0,120}logo/i);
    expect(p).toMatch(/\[2\][\s\S]{0,120}person/i);
  });

  it("★★ 종류가 없으면 한 글자도 안 붙는다 — 각인이 이 글 위에 서 있다", () => {
    const p = buildImagePrompt(cut, project([photo("a")]), [{ photo_id: "a" }]);
    for (const r of PHOTO_ROLES) expect(p).not.toContain(r.en);
  });
});

describe("단계별 클립 — 첨부 설명이 종류를 안다", () => {
  const project = (photos) => ({
    id: "pid", material: { text: "소재", photos },
    settings: { aspect_ratio: "9:16", speech_lang: "ko" },
  });

  it("★ 그 컷에 꽂힌 사진의 종류를 말한다", () => {
    const cut = { idx: 0, shows: "a bench", seconds: 5, ref_ids: ["a"] };
    const p = buildClipPrompt(cut, project([photo("a", "logo")]), { attach: "refs" });
    expect(p).toContain(photoRole("logo").en);
  });

  it("★★ 종류가 없으면 예전 한 줄 그대로다", () => {
    const cut = { idx: 0, shows: "a bench", seconds: 5, ref_ids: ["a"] };
    const p = buildClipPrompt(cut, project([photo("a")]), { attach: "refs" });
    expect(p).toContain("The attached images show what this scene, the person and the product look like.");
  });

  it("첫 프레임 갈래(i2v)는 안 건드린다 — 그 첨부는 참조가 아니라 첫 프레임이다", () => {
    const cut = { idx: 0, shows: "a bench", seconds: 5 };
    const p = buildClipPrompt(cut, project([photo("a", "logo")]), {});
    expect(p).toContain("The attached image is the first frame");
    for (const r of PHOTO_ROLES) expect(p).not.toContain(r.en);
  });
});

describe("서버가 판정한다 — 화면만 거르면 가림막이다", () => {
  // 이 저장소가 같은 자리에서 이미 배운 것: 화면에서만 거르면 API 를 직접 두드려 뚫린다
  // (2.5 를 hidden 으로 두었다가 실제로 뚫렸다).
  for (const p of ["app/api/ads/route.js", "app/api/reel/route.js"]) {
    it(`${p} 가 모르는 종류를 막는다`, () => {
      expect(readFileSync(p, "utf8"), `${p} 가 isPhotoRole 을 안 본다`).toMatch(/isPhotoRole/);
    });
  }
});

describe("화면 — 버튼이 셋이다", () => {
  for (const p of ["app/ads/new/page.js", "app/reel/new/page.js"]) {
    it(`${p} 에 로고·제품·인물 버튼이 있다`, () => {
      const src = readFileSync(p, "utf8");
      // 표를 돌려 그린다 — 손으로 세 번 적으면 종류가 늘 때 그 자리가 낡는다.
      expect(src, "표를 안 읽는다").toMatch(/PHOTO_ROLES/);
      expect(src, "올린 사진에 종류를 안 붙인다").toMatch(/role/);
    });
  }
});
