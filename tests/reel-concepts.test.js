// reel 의 **컨셉** — 광고 포맷을 빌려 쓰던 자리를 범용 큰 범주로 갈아 끼운다.
//
// ★★ 2026-08-25 사장님 지시: "좀 더 큰 카테고리화하는거야. 제품 홍보, 정보 전달, 등등
//   이런식으로 큰 범주로 칩을 고르게 할 수 있었으면 좋겠어."
//   그전에는 AD_FORMATS(제품 히어로·언박싱·비포애프터·브랜드 스토리·사용 후기)를 그대로
//   썼다. 다섯이 전부 **"팔 물건이 있다"** 를 전제로 해서, reel 이 하려는 범용 영상에는
//   좁았다 — 다섯 다 새 표의 "제품 홍보" 한 칸 안에 들어간다.
//
// ★★ **광고 흐름은 안 건드린다**(사장님이 남겨 두기로 했다). 그래서 표를 lib/ad/options.js
//   에 더하지 않고 이 파일을 새로 만들었고, 지시문도 **선택 인자 하나**로 갈린다 —
//   안 넘기면 광고는 예전과 글자 그대로다(이 저장소가 여섯 번 쓴 처방).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  REEL_CONCEPTS, DEFAULT_REEL_CONCEPT, normalizeReelConcept, reelConceptLine,
} from "../lib/reel/concepts.js";
import { buildScenarioMessages } from "../lib/ad/scenario.js";

const project = (settings = {}) => ({
  id: "p1",
  settings: {
    seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
    format: "hero", mood: "bright", style: "photo",
    ...settings,
  },
  material: { text: "동네 빵집 아침 풍경", photos: [] },
});

describe("컨셉 표", () => {
  it("큰 범주다 — 팔 물건이 없어도 고를 것이 있다", () => {
    const ids = REEL_CONCEPTS.map((c) => c.id);
    expect(ids).toContain("auto");
    expect(ids).toContain("product");
    expect(ids).toContain("info");
    // ★ 옛 표(AD_FORMATS)에는 이 셋이 아예 없었다 — 그것이 "좁다"의 내용이다.
    expect(ids).toContain("process");
    expect(ids).toContain("place");
  });

  it("[알아서]가 맨 앞이고 기본값이다", () => {
    expect(REEL_CONCEPTS[0].id).toBe("auto");
    expect(DEFAULT_REEL_CONCEPT).toBe("auto");
  });

  it("★ [알아서]에는 구성이 없다 — 모델이 정한다", () => {
    expect(reelConceptLine("auto")).toBe(null);
  });

  it("고른 칩은 그 구성이 실린다", () => {
    const line = reelConceptLine("process");
    expect(typeof line).toBe("string");
    expect(line).toContain("손");
  });

  it("모르는 값은 던지지 않고 기본값으로 떨어진다 — 화면이 부르는 자리다", () => {
    expect(normalizeReelConcept("없는것")).toBe(DEFAULT_REEL_CONCEPT);
    expect(normalizeReelConcept(undefined)).toBe(DEFAULT_REEL_CONCEPT);
    expect(normalizeReelConcept(null)).toBe(DEFAULT_REEL_CONCEPT);
  });

  it("★ 옛 프로젝트의 광고 포맷은 제품 홍보로 읽는다 — 뜻을 잃지 않는다", () => {
    // 옛 reel 은 AD_FORMATS 를 골랐다. 넷은 "팔 물건이 주인공"이라 제품 홍보다.
    for (const old of ["hero", "unboxing", "before_after", "testimonial"]) {
      expect(normalizeReelConcept(old), `${old} 가 안 옮겨진다`).toBe("product");
    }
  });

  it("★ story 는 **그대로** story 다 — 양쪽 표에 같은 뜻으로 있다", () => {
    // 옛 표에도 새 표에도 "story" 가 있고 둘 다 "분위기를 쌓고 마지막에 닫는다"다.
    // 제품 홍보로 옮기면 오히려 뜻을 잃는다 — 그래서 판정이 **새 표를 먼저** 본다.
    expect(normalizeReelConcept("story")).toBe("story");
  });

  it("고르는 값은 전부 구성을 갖는다 — 빈 칸이 없다", () => {
    for (const c of REEL_CONCEPTS) {
      expect(c.label, `${c.id} 에 이름이 없다`).toBeTruthy();
      if (c.id === "auto") continue;
      expect(c.beat, `${c.id} 에 구성이 없다`).toBeTruthy();
    }
  });
});

describe("지시문 — 선택 인자 하나로 갈린다", () => {
  it("안 넘기면 광고는 **글자 그대로** 예전이다", () => {
    const { messages } = buildScenarioMessages(project());
    expect(messages[0].content).toContain("광고 포맷:");
  });

  it("넘기면 그 줄이 광고 포맷 자리를 대신한다", () => {
    const { messages } = buildScenarioMessages(project(), {
      conceptLine: "구성: 정보 전달 — 무엇을 → 왜 → 어떻게 순으로 쌓는다.",
    });
    const body = messages[0].content;
    expect(body).toContain("구성: 정보 전달");
    expect(body, "광고 포맷 줄이 남아 두 번 실린다").not.toContain("광고 포맷:");
  });

  it("★ null 을 넘기면 그 줄이 아예 안 실린다 — [알아서]가 이 자리다", () => {
    const { messages } = buildScenarioMessages(project(), { conceptLine: null });
    const body = messages[0].content;
    expect(body).not.toContain("광고 포맷:");
    expect(body).not.toContain("구성:");
  });

  it("★ [알아서]는 **모르는 format 값**에도 안 죽는다 — 조회 자체를 건너뛴다", () => {
    // 옛 경로는 need(AD_FORMATS.find(...)) 가 무조건 돌아 모르는 값이면 던졌다.
    // reel 은 그 값을 안 쓰므로 conceptLine 을 넘긴 순간 조회도 없어야 한다.
    expect(() =>
      buildScenarioMessages(project({ format: "없는포맷" }), { conceptLine: null })
    ).not.toThrow();
  });
});

describe("배선 — 고른 칩이 실제로 시나리오까지 간다", () => {
  // ★ 주석을 걷고 잰다 — 새 표가 왜 생겼는지 설명하려면 AD_FORMATS 를 **이름으로**
  //   말해야 하고, 그 글자가 단정에 걸리면 안 된다. 이 저장소가 반복해 밟은
  //   "시험이 주석을 재는" 함정이다(tests/reel-sidebar-ui.test.js 의 strip 과 같은 처방).
  const read = (p) =>
    readFileSync(p, "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("라우트가 concept 를 받아 저장한다", () => {
    const src = read("app/api/reel/route.js");
    expect(src).toContain("normalizeReelConcept");
    expect(src).toMatch(/concept/);
  });

  it("시나리오 라우트가 그 값을 지시문으로 옮긴다", () => {
    const src = read("app/api/reel/[id]/scenario/route.js");
    expect(src).toContain("reelConceptLine");
    expect(src).toContain("conceptLine");
  });

  it("화면이 새 표를 그린다 — 광고 포맷 표를 안 쓴다", () => {
    const src = read("app/reel/new/page.js");
    expect(src).toContain("REEL_CONCEPTS");
    expect(src, "광고 포맷 표가 아직 남아 있다").not.toContain("AD_FORMATS");
  });

  it("★ 광고 화면은 여전히 자기 표를 쓴다 — 남겨 두기로 했다", () => {
    const src = read("app/ads/new/page.js");
    expect(src).toContain("AD_FORMATS");
  });
});
