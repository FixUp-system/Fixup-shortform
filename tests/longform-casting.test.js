// 실사 캐스팅 · 판 끄기 · "예쁘게" 문구 걷기 · 요구하지 말 것 — 2026-09-30 실측에서 나온 구조 변경.
//
// ★★★ 실측(romance-busstop, 5초 시험 셋):
//   ① 글만(참조 없음·스타일 말 없음) → 흐린 날 실제 도로·평범한 얼굴 — **실사**
//   ② 같은 글 + 구간 1 에서 자른 인물 참조 → 황금빛 역광·보케·화보 얼굴로 **통째로 돌아갔다**
//      (지문에 그런 말이 한 글자도 없었다 — H3 는 참조에서 빛·색감·배경 질감까지 가져온다)
//   ③ H3 글만 캐스팅 클립의 얼굴·목소리를 참조로 → 실사 유지 · 인물 유지
//   → AI 티의 원인은 GPT Image 판에서 출발한 참조 사슬이다. 출발점을 H3 실사 캐스팅으로 바꾼다.
import { describe, it, expect } from "vitest";
import { buildCastingPrompt, castingVoiceSeconds, CASTING_SECONDS, castingCostUsd } from "../lib/longform/casting.js";
import { buildFixedBlock } from "../lib/longform/bible.js";
import { buildLongformScenarioMessages, buildExtendMessages, fakeLongformResponse, validateLongformScenario } from "../lib/longform/scenario.js";
import { h3Body, submitH3 } from "../lib/longform/h3.js";
import { H3_T2V, H3_R2V } from "../lib/longform/plan.js";
import { gate, stageCostUsd, stageIsFree, SHEET_USD } from "../lib/longform/run-state.js";
import { segmentRefs } from "../lib/longform/refs.js";
import { buildSegmentPrompt } from "../lib/longform/segment-prompt.js";

const scn = validateLongformScenario(fakeLongformResponse(), 0).scenario;
const project = {
  id: "00000000-0000-4000-8000-000000000001",
  settings: { aspect_ratio: "9:16", style: "photo", mood: "premium", narration_lang: "ko", seconds: 30, target_seconds: 30 },
  material: { text: "동네 빵집 두 사람의 아침", photos: [] },
};

describe("캐스팅 지문", () => {
  const p = buildCastingPrompt(scn.characters[0]);

  it("생김새·옷·목소리는 인물 칸에서, 장면 설명(who)은 안 싣는다", () => {
    expect(p).toContain(scn.characters[0].look);
    expect(p).toContain(scn.characters[0].voice);
    expect(p).not.toContain(scn.characters[0].who);
  });

  it("★★ 분위기 없는 사진이다 — 참조의 빛·배경이 본편으로 샌다", () => {
    expect(p).toMatch(/plain light-grey wall/);
    expect(p).toMatch(/overcast/);
    expect(p).not.toMatch(/golden|cinematic|bokeh|backlight|shallow depth/i);
  });

  it("★ 전신이 나온다 — 가슴 위만 찍었더니 하의가 없어 본편에서 흰 바지가 됐다", () => {
    expect(p).toMatch(/full-length/);
  });

  it("카메라를 보고 한마디 한다 — 그 소리가 목소리 참조다", () => {
    expect(p).toMatch(/looks into the camera and speaks/);
    expect(p).toMatch(/\(in Korean\):/);
  });
});

describe("캐스팅 값·목소리 길이", () => {
  it("인물마다 5초", () => {
    expect(CASTING_SECONDS).toBe(5);
    expect(castingCostUsd(2, "768P")).toBeCloseTo(0.6, 5);
  });

  it("★ 목소리 참조는 합쳐 15초까지다(fal) — 인물이 많으면 한 명 몫을 줄인다", () => {
    expect(castingVoiceSeconds(2)).toBe(5);
    expect(castingVoiceSeconds(3)).toBe(5);
    expect(castingVoiceSeconds(4)).toBe(3);
    expect(castingVoiceSeconds(7)).toBe(2);
    expect(() => castingVoiceSeconds(8)).toThrow(/7명/);
  });
});

describe("H3 글만(text-to-video)", () => {
  it("엔드포인트가 따로다", () => {
    expect(H3_T2V).toBe("minimax/h3/text-to-video");
    expect(H3_T2V).not.toBe(H3_R2V);
  });

  it("★★ 참조 칸을 안 만든다 · 화질을 반드시 싣는다(기본값이 2K 라 두 배 넘게 나간다)", () => {
    const b = h3Body({ prompt: "p", seconds: 5, aspect: "9:16", resolution: "768P", refs: [], textOnly: true });
    expect(b.reference_image_urls).toBeUndefined();
    expect(b.resolution).toBe("768P");
  });

  it("접수는 그 엔드포인트로 간다", async () => {
    let url = "";
    const fetchImpl = async (u) => { url = u; return { ok: true, json: async () => ({ request_id: "r", status_url: "s", response_url: "o" }) }; };
    await submitH3({ prompt: "p" }, { fetchImpl, endpoint: H3_T2V });
    expect(url).toBe(`https://queue.fal.run/${H3_T2V}`);
  });
});

describe("★★★ 고정 블록에서 '예쁘게' 문구를 걷는다", () => {
  const f = buildFixedBlock({ ...scn, tone: "warm film grain, honeyed golden highlights" }, { style: "photo" });

  it("화풍·색감 줄이 없다 — 그 말이 광택 피부·보케를 부른다", () => {
    expect(f).not.toMatch(/Style:/);
    expect(f).not.toMatch(/Color treatment:/);
    expect(f).not.toMatch(/hyper-realistic|shallow depth|golden/);
  });

  it("인물 줄은 그대로다(잠금이 이것을 본다)", () => {
    expect(f).toMatch(/- A: /);
  });
});

describe("★★ 요구하지 말 것 — 모델이 못 그리는 것은 애초에 요구하지 않는다", () => {
  const { system } = buildLongformScenarioMessages(project, { segmentCount: 2 });
  const ext = buildExtendMessages({ scenario: scn, fromSegment: 3, brief: "x" }).system;

  for (const [name, text] of [["시나리오", system], ["이어 쓰기", ext]]) {
    it(`${name}: 옷감 상태 변화(젖음·얼룩)를 요구하지 않는다`, () => expect(text).toMatch(/옷이 젖거나/));
    it(`${name}: 한 우산을 쓰고 뒤에서 걷는 구도를 요구하지 않는다`, () => expect(text).toMatch(/뒤에서 걸어가는 구도/));
    it(`${name}: 소품 개수를 적는다`, () => expect(text).toMatch(/몇 개인지/));
    it(`${name}: 조명은 평범한 자연광 — 황금빛·역광·보케를 쓰지 않는다`, () => {
      expect(text).toMatch(/평범한/);
      expect(text).toMatch(/golden hour/);
    });
  }
});

describe("판을 끄면 참조에서 판 자리가 빠진다", () => {
  it("판 없이 인물·닻만 — Image 1 이 인물이다", () => {
    const { refs } = segmentRefs({ cast: [{ key: "A", bytes: Buffer.from("a") }], anchor: { key: "a" } });
    expect(refs.map((r) => r.kind)).toEqual(["cast", "anchor"]);
  });

  it("판이 없으면 지문에 판 머리말도 판 줄도 없다", () => {
    const { refs } = segmentRefs({ cast: [{ key: "A", bytes: Buffer.from("a") }] });
    const p = buildSegmentPrompt({ scenario: scn, seg: 1, bible: "", refs, grid: { rows: 2, cols: 2 } });
    expect(p).not.toMatch(/storyboard/);
    expect(p).toMatch(/Image 1 shows A/);
  });
});

describe("관문 — 캐스팅", () => {
  const planned = { scenario: { characters: [{ key: "A" }, { key: "B" }] }, segments: [{ seg: 1 }, { seg: 2 }] };

  it("유료(fal)다 — --yes 가 필요하고 plan 뒤에만 된다", () => {
    expect(gate(planned, "cast", {}).reason).toMatch(/--yes/);
    expect(gate(planned, "cast", { yes: true })).toEqual({ ok: true });
    expect(gate({}, "cast", { yes: true }).reason).toMatch(/plan 을 먼저/);
    expect(stageIsFree("cast", { fal: true, llm: false })).toBe(true);
  });

  it("값은 인물 수 × 5초", () => {
    expect(stageCostUsd("cast", { resolution: "768P", characters: 2 })).toBeCloseTo(0.6, 5);
  });

  it("★ 판을 끄면 구간 값에서 판 값이 빠진다", () => {
    const withSheet = stageCostUsd("seg1", { resolution: "768P", seconds: 15 });
    const without = stageCostUsd("seg1", { resolution: "768P", seconds: 15, sheet: false });
    expect(withSheet - without).toBeCloseTo(SHEET_USD, 5);
  });
});
