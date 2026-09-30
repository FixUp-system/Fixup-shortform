// 구간 이어 쓰기 — 이미 구운 구간은 그대로 두고 뒤에 구간을 더한다(사장님 승인 2026-09-30:
// "그렇게 우리의 만남이 시작돼서 간단한 연애사가 나오는 형식"). 5분·10분의 첫 계단이다.
//   ① 인물(얼굴·머리·체격·목소리)·화풍·색감은 **잠근다**
//   ② 장소·옷은 **구간마다 바꿀 수 있다**(segment_looks) — 몽타주는 장소와 날이 바뀐다
//   ③ 말하는 인물이 그 샷 화면에 없으면 **화면 밖 내레이션**(보이스오버)이다
import { describe, it, expect } from "vitest";
import {
  validateLongformScenario, fakeLongformResponse, buildExtendMessages, extendLongformScenario,
  fakeExtendResponse, LONGFORM_EXTEND_SCHEMA,
} from "../lib/longform/scenario.js";
import { buildFixedBlock, segmentBible, segmentLook, buildBible } from "../lib/longform/bible.js";
import { buildSegmentPrompt } from "../lib/longform/segment-prompt.js";
import { gate, checkBibleLock, stageCostUsd, stageIsFree, SHEET_USD } from "../lib/longform/run-state.js";

const base = () => validateLongformScenario(fakeLongformResponse(), 0).scenario;
const extended = () => {
  const s = base();
  const ext = fakeExtendResponse({ fromSegment: 3 });
  const raw = { ...s, text: `${s.text} ${ext.text}`, shots: [...s.shots, ...ext.shots], segment_looks: ext.segment_looks };
  return validateLongformScenario(raw, 0, { segmentCount: 3 }).scenario;
};

describe("★★★ 샷을 12개에서 자르지 않는다", () => {
  // 단계별 validateScenario 는 shots.slice(0, 12) 다(15~60초 한 편 기준). 롱폼은 30초가 벌써 8샷이고
  // 구간 하나를 더하면 12를 넘는다 — 그대로 두면 뒤 샷이 **말없이 사라진다**(10분은 아예 불가능).
  it("4구간 15샷이 전부 남는다", () => {
    const raw = fakeLongformResponse();
    const one = raw.shots[2]; // 대사 없는 샷
    const plan = [[1, 4, 3], [2, 4, 3], [3, 4, 3], [4, 3, 5]]; // [구간, 샷 수, 초]
    raw.shots = plan.flatMap(([segment, n, seconds]) =>
      Array.from({ length: n }, (_, i) => ({ ...one, segment, seconds, shows: `A shot ${segment}-${i}` })));
    expect(raw.shots.length).toBe(15);
    const out = validateLongformScenario(raw, 0, { segmentCount: 4 });
    expect(out.errors).toBeUndefined();
    expect(out.scenario.shots).toHaveLength(15);
  });
});

describe("구간별 장소·옷(segment_looks)", () => {
  it("검증을 지나도 살아남는다", () => {
    expect(extended().segment_looks).toEqual([{ segment: 3, environment: expect.any(String), wardrobe: expect.any(String) }]);
  });

  it("없는 구간을 가리키면 막는다", () => {
    const s = base();
    const out = validateLongformScenario({ ...s, segment_looks: [{ segment: 5, environment: "x", wardrobe: "" }] }, 0);
    expect(out.errors.join(" ")).toMatch(/segment_looks 의 구간 5/);
  });

  it("그 구간만 바뀌고, 나머지는 시나리오 기본값", () => {
    const s = extended();
    expect(segmentLook(s, 1)).toEqual({ environment: s.environment, wardrobe: s.wardrobe, override: false });
    expect(segmentLook(s, 3).override).toBe(true);
    expect(segmentLook(s, 3).environment).not.toBe(s.environment);
  });
});

describe("고정 블록 — 인물은 잠그고 장소·옷은 구간이 정한다", () => {
  const s = extended();
  const fixed = buildFixedBlock(s, { style: "photo" });

  it("고정 블록에는 장소·옷이 없다", () => {
    expect(fixed).not.toMatch(/Setting:/);
    expect(fixed).not.toMatch(/Wardrobe:/);
    expect(fixed).toMatch(/Characters:/);
  });

  it("구간 지문에는 그 구간의 장소·옷이 붙는다", () => {
    const b3 = segmentBible(s, { style: "photo", seg: 3 });
    expect(b3).toContain(`Setting: ${segmentLook(s, 3).environment}`);
    // 인물 묘사(look)에 옷이 섞여 있다 — 이 구간 옷이 그것을 **덮는다고** 말해야 한다.
    expect(b3).toMatch(/overrides any clothing in the character descriptions/);
    expect(segmentBible(s, { style: "photo", seg: 1 })).not.toMatch(/overrides/);
  });

  it("★★ 옛 형식 고정 블록(buildBible)으로 구운 구간과도 잠금이 맞는다 — 인물 줄이 그대로면 통과", () => {
    const old = buildBible(base(), { style: "photo" });
    expect(checkBibleLock({ segments: [{ bible: old }] }, buildFixedBlock(base(), { style: "photo" }))).toEqual({ ok: true });
  });

  it("★★★ 인물 목소리를 바꾸면 막는다", () => {
    const old = buildBible(base(), { style: "photo" });
    const changed = base();
    changed.characters[0].voice = "high, bright, fast";
    const out = checkBibleLock({ segments: [{ bible: old }] }, buildFixedBlock(changed, { style: "photo" }));
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/인물·목소리·화풍/);
  });

  it("장소·옷만 바뀐 것은 잠금에 안 걸린다", () => {
    const old = buildBible(base(), { style: "photo" });
    expect(checkBibleLock({ segments: [{ bible: old }] }, buildFixedBlock(extended(), { style: "photo" })).ok).toBe(true);
  });
});

describe("지문 — 화면 밖 내레이션 · 옷이 바뀐 구간의 닻", () => {
  const s = extended();
  const bible = segmentBible(s, { style: "photo", seg: 3 });
  const p = buildSegmentPrompt({ scenario: s, seg: 3, bible, refs: [{ kind: "anchor", keys: ["A", "B"] }], audios: [{ key: "A" }] });

  it("★ 말하는 인물이 화면에 없으면 보이스오버로 쓰고 입 맞춤을 요구하지 않는다", () => {
    const vo = p.split("\n").find((l) => l.includes("그렇게 우리의 만남이 시작됐어요"));
    expect(vo).toMatch(/A \(the voice in Audio 1\) speaks off-screen as a voice-over/);
    expect(vo).not.toMatch(/lip sync/);
  });

  it("화면에 있으면 예전처럼 입을 맞춘다", () => {
    const on = p.split("\n").find((l) => l.includes("우리 또 보자"));
    expect(on).toMatch(/says, with natural lip sync/);
  });

  it("★ 옷이 바뀐 구간에서는 닻의 옷을 따르라고 하지 않는다", () => {
    expect(p).toMatch(/keep every person's face, hair and build identical to it/);
    expect(p).not.toMatch(/build and clothing identical/);
  });
});

describe("이어 쓰기", () => {
  const state = { scenario: base(), segments: [{ seg: 1, video: "a" }, { seg: 2, video: "b" }], photos: [], settings: { resolution: "768P", aspect_ratio: "9:16" } };

  it("지시문에 지금까지의 이야기·인물·다음 구간 번호·사장님 방향이 든다", () => {
    const { system, messages } = buildExtendMessages({ scenario: state.scenario, fromSegment: 3, addSegments: 1, brief: "만남 뒤 짧은 연애 몽타주" });
    const all = system + JSON.stringify(messages);
    expect(all).toMatch(/만남 뒤 짧은 연애 몽타주/);
    expect(all).toMatch(/구간 3/);
    expect(all).toMatch(/늦어서 죄송해요/); // 앞 구간 대사
    expect(all).toMatch(/segment_looks/);
    expect(all).toMatch(/화면 밖/);
  });

  it("★★★ 지시문이 답의 JSON 모양을 칸 이름까지 말한다 — callJson 은 schema 를 **안 쓴다**", () => {
    // 첫 실제 extend(2026-09-30)가 "LLM 응답 해석 실패"로 죽었다. lib/llm.js 의 callJson 은 schema 인자를
    // 받기만 하고 모델에 안 넘긴다 — 모양을 정하는 것은 지시문의 "JSON 으로만 답한다" 블록뿐이다.
    const { system } = buildExtendMessages({ scenario: state.scenario, fromSegment: 3, brief: "x" });
    expect(system).toMatch(/JSON 으로만 답한다/);
    for (const k of ["text", "segment_looks", "shots", "segment", "speaker_id", "on_screen", "shows", "line", "seconds", "camera", "lighting", "action", "sound"]) {
      expect(system).toContain(`"${k}"`);
    }
  });

  it("스키마는 새 샷·장소옷·글만 받는다 — 인물 칸이 없다(인물은 잠겨 있다)", () => {
    expect(Object.keys(LONGFORM_EXTEND_SCHEMA.properties).sort()).toEqual(["segment_looks", "shots", "text"]);
  });

  it("앞 구간은 그대로 두고 뒤에 붙인다", async () => {
    const out = await extendLongformScenario({ state, brief: "x", deps: { callJson: async () => fakeExtendResponse({ fromSegment: 3 }) } });
    expect(out.shots.slice(0, state.scenario.shots.length)).toEqual(state.scenario.shots);
    expect(out.shots.at(-1).segment).toBe(3);
    expect(out.characters).toEqual(state.scenario.characters);
    expect(out.text.startsWith(state.scenario.text)).toBe(true);
  });

  it("새 샷이 앞 구간 번호를 쓰면 던진다", async () => {
    const bad = fakeExtendResponse({ fromSegment: 3 });
    bad.shots[0].segment = 2;
    await expect(extendLongformScenario({ state, brief: "x", deps: { callJson: async () => bad } })).rejects.toThrow(/구간 3/);
  });
});

describe("관문 — 구간 N개", () => {
  const three = { scenario: {}, segments: [{ seg: 1, video: "a" }, { seg: 2, video: "b" }, { seg: 3 }] };

  it("구간 3 은 구간 2 영상이 있어야 굽는다", () => {
    expect(gate(three, "seg3", { yes: true })).toEqual({ ok: true });
    const no2 = { ...three, segments: [{ seg: 1, video: "a" }, { seg: 2 }, { seg: 3 }] };
    expect(gate(no2, "seg3", { yes: true }).reason).toMatch(/구간 2 영상이 없어요/);
  });

  it("없는 구간은 모른다", () => expect(gate(three, "seg4", { yes: true }).ok).toBe(false));

  it("잇기는 모든 구간이 있어야 한다", () => {
    expect(gate(three, "join", {}).ok).toBe(false);
    const all = { ...three, segments: [...three.segments.slice(0, 2), { seg: 3, video: "c" }] };
    expect(gate(all, "join", {})).toEqual({ ok: true });
  });

  it("이어 쓰기는 유료(LLM)다 — --yes 가 필요하고, plan 뒤에만 된다", () => {
    expect(gate(three, "extend", {}).reason).toMatch(/--yes/);
    expect(gate(three, "extend", { yes: true })).toEqual({ ok: true });
    expect(gate({}, "extend", { yes: true }).reason).toMatch(/plan 을 먼저/);
  });

  it("값·가짜 판정도 구간 번호와 무관하게 같다", () => {
    expect(stageCostUsd("seg3", { resolution: "768P", seconds: 15 })).toBeCloseTo(SHEET_USD + 0.9, 5);
    expect(stageIsFree("seg3", { fal: true, llm: false })).toBe(true);
    expect(stageIsFree("extend", { fal: true, llm: false })).toBe(false);
  });
});
