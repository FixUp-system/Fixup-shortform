// 의상 캐스팅 · 내레이션은 인물 목소리 · 배경 엑스트라 — 2026-09-30 첫 1분 plan(revenge-wedding)에서 나온 셋.
//   ① 대사 13줄 중 11줄이 "narration" — 캐스팅은 인물만 만드므로 내레이터 목소리는 잠기지 않는다
//   ② 결혼식장인데 지문이 "배경에도 아무도 없다" — 샷 설명의 하객과 싸운다
//   ③ A 의 look 에 "회귀 전 웨딩드레스, 회귀 후 정장"이 섞였다 — 캐스팅이 어느 옷인지 모르고,
//      모든 구간 지문에 두 벌이 함께 실린다
// 사장님 결정(방법 2): 옷이 바뀌는 인물은 **기본 캐스팅 얼굴을 참조로 옷별 5초를 더 찍어** 그 프레임을
// 그 옷을 입는 구간의 참조로 쓴다(GPT Image 로 옷만 바꾸면 AI 질감이 다시 들어온다).
import { describe, it, expect } from "vitest";
import {
  buildLongformScenarioMessages, validateLongformScenario, generateLongformScenario, fakeLongformResponse,
} from "../lib/longform/scenario.js";
import { buildSegmentPrompt, segmentCastRefs } from "../lib/longform/segment-prompt.js";
import { buildCastingPrompt, buildCostumePrompt } from "../lib/longform/casting.js";

const project = {
  id: "00000000-0000-4000-8000-000000000001",
  settings: { aspect_ratio: "9:16", style: "photo", mood: "premium", narration_lang: "ko", seconds: 60, target_seconds: 60 },
  material: { text: "결혼식 배신 회귀 복수", photos: [] },
};

// 옷이 바뀌는 시나리오 — A 가 구간 1 은 A1(드레스), 구간 2 는 A1 → A2(정장).
function wedding() {
  const raw = fakeLongformResponse();
  raw.characters[0].outfits = [{ id: "A1", desc: "ivory silk wedding dress with a short veil" }, { id: "A2", desc: "charcoal wool trouser suit over a white shirt" }];
  raw.characters[1].outfits = [{ id: "B1", desc: "black tuxedo with a bow tie" }];
  raw.shots.forEach((s) => { s.outfits = s.on_screen.map((k) => (k === "A" ? "A1" : "B1")); });
  raw.shots[5].outfits = ["A2", "B1"]; // 구간 2 마지막 샷에서 A 가 정장으로
  return raw;
}

describe("시나리오 규칙", () => {
  const { system } = buildLongformScenarioMessages(project, { segmentCount: 4 });
  const rules = system.slice(system.indexOf("★★ 롱폼 규칙"));

  it("★★★ 내레이션은 인물의 voiceover 로 — narration 은 쓰지 마라(목소리가 잠기지 않는다)", () => {
    expect(rules).toMatch(/voiceover/);
    expect(rules).toMatch(/"narration" 은 쓰지 마라/);
  });

  it("★★ look 에는 얼굴·머리·체격만 — 옷은 outfits 로", () => {
    expect(rules).toMatch(/look 에는 얼굴·머리·체격/);
    expect(rules).toMatch(/outfits/);
  });

  it("★★ 샷마다 누가 어느 옷을 입는지(outfits id) 적게 한다", () => {
    expect(rules).toMatch(/그 샷에 보이는 인물이 입은 옷의 id/);
  });

  it("★ 이름 없는 배경 인물은 써도 된다 — 말하지 않고 초점 밖", () => {
    expect(rules).toMatch(/엑스트라/);
  });

  it("★★★ 새 칸의 JSON 모양을 말한다 — callJson 은 schema 를 모델에 안 넘긴다", () => {
    for (const k of ['"characters"', '"outfits"', '"voiceover"', '"segment_looks"', '"desc"']) expect(rules).toContain(k);
  });
});

describe("검증 — 의상", () => {
  it("의상 시나리오는 통과하고, 인물의 outfits 와 샷의 outfits 가 살아남는다", () => {
    const out = validateLongformScenario(wedding(), 0);
    expect(out.errors).toBeUndefined();
    expect(out.scenario.characters[0].outfits.map((o) => o.id)).toEqual(["A1", "A2"]);
    expect(out.scenario.shots[5].outfits).toEqual(["A2", "B1"]);
  });

  it("없는 옷 id 를 쓰면 막는다", () => {
    const raw = wedding();
    raw.shots[0].outfits = ["A9"];
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/"A9"/);
  });

  it("★ 화면에 있는 인물의 옷이 빠지면 막는다 — 그 샷에서 무엇을 입는지 모른다", () => {
    const raw = wedding();
    raw.shots[1].outfits = ["A1"]; // B 도 화면에 있다
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/B 의 옷/);
  });

  it("옷 id 가 겹치면 막는다", () => {
    const raw = wedding();
    raw.characters[1].outfits[0].id = "A1";
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/옷 id/);
  });

  it("옛 시나리오(옷 칸이 아예 없음)는 그대로 통과한다", () => {
    expect(validateLongformScenario(fakeLongformResponse(), 0).ok).toBe(true);
  });

  it("★★★ narration 화자는 막는다 — 인물 voiceover 로 쓴다", () => {
    const raw = wedding();
    raw.shots[0].speaker_id = "narration";
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/narration/);
  });
});

describe("★★ 규칙을 어기면 이유를 붙여 한 번 다시 쓰게 한다", () => {
  it("두 번째 답이 맞으면 그것을 쓴다 — 시나리오 값이 헛되이 안 나간다", async () => {
    const bad = wedding();
    bad.shots[0].speaker_id = "narration";
    const calls = [];
    const callJson = async (a) => { calls.push(a); return calls.length === 1 ? bad : wedding(); };
    const scn = await generateLongformScenario({ project, segmentCount: 2, deps: { callJson } });
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1].messages)).toMatch(/narration/);
    expect(scn.shots[0].speaker_id).not.toBe("narration");
  });

  it("두 번째도 어기면 던진다", async () => {
    const bad = wedding();
    bad.shots[0].speaker_id = "narration";
    await expect(generateLongformScenario({ project, segmentCount: 2, deps: { callJson: async () => bad } })).rejects.toThrow(/narration/);
  });
});

describe("구간 지문 — 엑스트라 · 샷별 옷 · 의상 참조", () => {
  const scn = validateLongformScenario(wedding(), 0).scenario;

  it("★ 배경 엑스트라를 허용한다 — '배경에도 아무도 없다'가 결혼식장 하객과 싸웠다", () => {
    const p = buildSegmentPrompt({ scenario: scn, seg: 1, bible: "", refs: [] });
    expect(p).toMatch(/unnamed background extras/);
    expect(p).not.toMatch(/no other people, including in the background/);
  });

  it("★★ 샷마다 누가 어느 옷을 입는지 적는다", () => {
    const p = buildSegmentPrompt({ scenario: scn, seg: 2, bible: "", refs: [] });
    expect(p).toMatch(/Wearing: A in A2 \(charcoal wool trouser suit over a white shirt\)/);
    expect(p).toMatch(/Wearing: A in A1 \(ivory silk wedding dress/);
  });

  it("★★ 의상 참조 줄 — 어느 옷의 사진인지 짚는다", () => {
    const refs = [{ kind: "cast", who: "A", outfit: "A2", desc: "charcoal wool trouser suit over a white shirt" }];
    const p = buildSegmentPrompt({ scenario: scn, seg: 2, bible: "", refs });
    expect(p).toMatch(/Image 1 shows A wearing outfit A2 \(charcoal wool trouser suit/);
    expect(p).toMatch(/in the shots where A wears A2/);
  });
});

describe("구간별 의상 참조 고르기", () => {
  const scn = validateLongformScenario(wedding(), 0).scenario;

  it("그 구간에서 입는 옷만, 인물 목록 순서로", () => {
    expect(segmentCastRefs(scn, 1)).toEqual([{ key: "A", outfit: "A1" }, { key: "B", outfit: "B1" }]);
    expect(segmentCastRefs(scn, 2)).toEqual([{ key: "A", outfit: "A1" }, { key: "A", outfit: "A2" }, { key: "B", outfit: "B1" }]);
  });

  it("옛 시나리오(옷 칸 없음)는 인물마다 기본 하나", () => {
    const old = validateLongformScenario(fakeLongformResponse(), 0).scenario;
    expect(segmentCastRefs(old, 1)).toEqual([{ key: "A", outfit: null }, { key: "B", outfit: null }]);
  });
});

describe("캐스팅 지문 — 기본 · 의상", () => {
  const scn = validateLongformScenario(wedding(), 0).scenario;

  it("기본 캐스팅은 첫 번째 옷을 입는다", () => {
    const p = buildCastingPrompt(scn.characters[0]);
    expect(p).toMatch(/Wearing: ivory silk wedding dress/);
    expect(p).not.toMatch(/charcoal/);
  });

  it("★★ 의상 캐스팅 — 기본 얼굴(Image 1)과 같은 사람이 그 옷을 입는다, 분위기 없는 전신", () => {
    const p = buildCostumePrompt(scn.characters[0], scn.characters[0].outfits[1]);
    expect(p).toMatch(/Image 1/);
    expect(p).toMatch(/same person/);
    expect(p).toMatch(/charcoal wool trouser suit/);
    expect(p).toMatch(/plain light-grey wall/);
    expect(p).toMatch(/full-length/);
    expect(p).not.toMatch(/golden|cinematic|bokeh/i);
  });
});
