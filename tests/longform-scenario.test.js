// 롱폼 시나리오 — 인물을 시나리오가 정의하고, 샷이 그 key 로 말한다(계획서 「스펙과 다르게
// 가는 곳」 1). 구간 초는 H3 프로필(5~15)이 정한다.
import { describe, it, expect } from "vitest";
import { REEL_SCENARIO_SCHEMA } from "../lib/reel/scenario.js";
import {
  LONGFORM_SCENARIO_SCHEMA, segmentBounds, buildLongformScenarioMessages,
  validateLongformScenario, generateLongformScenario, fakeLongformResponse,
  checkStoredScenario,
} from "../lib/longform/scenario.js";

const project = {
  id: "00000000-0000-4000-8000-000000000001",
  settings: { aspect_ratio: "9:16", style: "photo", mood: "premium", narration_lang: "ko", seconds: 30, target_seconds: 30 },
  material: { text: "동네 빵집 두 사람의 아침", photos: [] },
};

describe("스키마 — 단계별 것을 넓히되 건드리지 않는다", () => {
  it("★★ 단계별 스키마가 그대로다 — 복사해서 넓혔다", () => {
    expect(REEL_SCENARIO_SCHEMA.properties.characters).toBeUndefined();
    expect(REEL_SCENARIO_SCHEMA.properties.shots.items.properties.segment).toBeUndefined();
    expect(REEL_SCENARIO_SCHEMA.required).not.toContain("characters");
  });

  it("인물·구간·화자·출연을 요구한다", () => {
    expect(LONGFORM_SCENARIO_SCHEMA.required).toContain("characters");
    const shot = LONGFORM_SCENARIO_SCHEMA.properties.shots.items;
    expect(shot.required).toEqual(expect.arrayContaining(["segment", "speaker_id", "on_screen"]));
  });
});

describe("구간 초는 H3 프로필에서 온다", () => {
  it("5~15초", () => expect(segmentBounds()).toEqual({ min: 5, max: 15 }));
});

describe("지시문", () => {
  it("★ 롱폼 규칙이 실리고, 구간 초 범위가 숫자로 들어간다", () => {
    const { system } = buildLongformScenarioMessages(project, { segmentCount: 2 });
    expect(system).toMatch(/구간은 2개/);
    expect(system).toMatch(/5초 이상 15초 이하/);
    expect(system).toMatch(/장면이 바뀌는 자리/);
    expect(system).toMatch(/speaker_id/);
    expect(system).toMatch(/on_screen/);
  });
});

describe("검증", () => {
  it("가짜 응답은 통과한다 — 0원 관통이 이것으로 돈다", () => {
    const out = validateLongformScenario(fakeLongformResponse(), 0, { segmentCount: 2 });
    expect(out.ok).toBe(true);
    expect(out.scenario.characters.map((c) => c.key)).toEqual(["A", "B"]);
    expect(out.scenario.shots[0].segment).toBe(1);
  });

  it("★★★ 구간이 15초를 넘으면 막고, 몇 초인지 말한다", () => {
    const raw = fakeLongformResponse();
    raw.shots[0].seconds = 10; // 구간 1 = 10 + 5 + 4 = 19초
    const out = validateLongformScenario(raw, 0, { segmentCount: 2 });
    expect(out.ok).toBe(false);
    expect(out.errors.join(" ")).toMatch(/구간 1 가 19초/);
  });

  it("구간이 5초보다 짧아도 막는다", () => {
    const raw = fakeLongformResponse();
    for (const i of [3, 4, 5]) raw.shots[i].seconds = 1; // 구간 2 = 3초
    expect(validateLongformScenario(raw, 0).ok).toBe(false);
  });

  it("★★ 대사가 있는데 speaker_id 가 비면 막는다", () => {
    const raw = fakeLongformResponse();
    raw.shots[0].speaker_id = "";
    const out = validateLongformScenario(raw, 0);
    expect(out.errors.join(" ")).toMatch(/speaker_id 가 비었다/);
  });

  it("★★ 인물 목록에 없는 key 로 말하면 막는다", () => {
    const raw = fakeLongformResponse();
    raw.shots[1].speaker_id = "C";
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/"C" 는 인물 목록에 없다/);
  });

  it("on_screen 에 모르는 key 가 있어도 막는다", () => {
    const raw = fakeLongformResponse();
    raw.shots[2].on_screen = ["A", "Z"];
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/on_screen "Z"/);
  });

  it("구간이 거꾸로 가면 막는다", () => {
    const raw = fakeLongformResponse();
    raw.shots[4].segment = 1; // 구간 2 의 첫 샷(3) 다음에 1 로 되돌아간다
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/거꾸로/);
  });

  it("비어 있는 구간이 있으면 막는다", () => {
    const raw = fakeLongformResponse();
    for (const s of raw.shots) s.segment = 1;
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/구간 2 에 샷이 없다/);
  });

  it("★★★ 구간 샷이 판 한 장에 못 담기는 수면 막는다 — 판이 없으면 H3 가 구도를 못 받는다", () => {
    // reelGridFor 는 3컷 미만이면 null 이다(REEL_MIN_CUTS). 2샷 구간은 스토리보드를 못 그린다.
    const raw = fakeLongformResponse();
    raw.shots = raw.shots.filter((s) => s.segment === 2).concat(); // 구간 2 만 남긴다
    raw.shots.unshift({ ...raw.shots[0], segment: 1, seconds: 7 }, { ...raw.shots[0], segment: 1, seconds: 7 });
    const out = validateLongformScenario(raw, 0);
    expect(out.ok).toBe(false);
    expect(out.errors.join(" ")).toMatch(/구간 1 의 샷 2개는 스토리보드 판 한 장에 못 담는다/);
  });

  it("인물 key 가 겹치면 막는다", () => {
    const raw = fakeLongformResponse();
    raw.characters[1].key = "A";
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/겹쳐요/);
  });
});

describe("최종 리뷰에서 잡힌 것", () => {
  it("★★★ 단계별 지문의 '화자는 하나'·'통째로 만든다'를 명시적으로 덮어쓴다 — 안 그러면 다중 화자 시험이 기운다", () => {
    const { system } = buildLongformScenarioMessages(project, { segmentCount: 2 });
    // 단계별 지문이 실제로 그 문장들을 싣는다 — 덮어쓸 대상이 있다는 것을 먼저 확인한다.
    expect(system).toMatch(/화자는 \*\*하나\*\*다/);
    expect(system).toMatch(/한 번에 통째로/);
    // 롱폼 규칙이 그 둘을 이 영상에 적용하지 않는다고 말한다.
    const rules = system.slice(system.indexOf("★★ 롱폼 규칙"));
    expect(rules).toMatch(/화자는 하나.*적용하지 않는다/);
    expect(rules).toMatch(/통째로.*적용하지 않는다/);
    expect(rules).toMatch(/인물마다 자기 목소리/);
  });

  it("★★ 소품을 드는 샷은 누가 어느 손으로 드는지 적게 한다 — 안 적으면 우산이 공중에 뜬다", () => {
    // 실제 구간 1(romance-busstop) 끝 4초: 샷 설명이 "우산 하나 아래 어깨를 나란히"뿐이라 두 사람이
    // 팔짱을 꼈고 우산은 아무도 안 든 채 떠 있었다. 금지("띄우지 마라")가 아니라 원하는 상태를 적게 한다.
    const { system } = buildLongformScenarioMessages(project, { segmentCount: 2 });
    expect(system).toMatch(/누가 어느 손으로/);
  });

  it("★★★ 저장된 시나리오를 다시 잰다 — 확인 ① 뒤 run.json 편집이 규칙을 우회하지 못한다", () => {
    const scenario = validateLongformScenario(fakeLongformResponse(), 0).scenario;
    const state = { scenario, photos: [], settings: { resolution: "768P", aspect_ratio: "9:16" } };
    expect(checkStoredScenario(state)).toEqual({ ok: true, scenario: expect.any(Object) });

    const edited = structuredClone(state);
    for (const s of edited.scenario.shots.filter((x) => x.segment === 2)) s.seconds = 9; // 구간 2 = 27초
    edited.scenario.shots[3].speaker_id = "Z";
    const out = checkStoredScenario(edited);
    expect(out.ok).toBe(false);
    expect(out.errors.join(" ")).toMatch(/구간 2 가 27초/);
    expect(out.errors.join(" ")).toMatch(/"Z" 는 인물 목록에 없다/);
  });
});

describe("생성", () => {
  it("LLM 답을 검증해 돌려준다", async () => {
    const scn = await generateLongformScenario({
      project, deps: { callJson: async () => fakeLongformResponse() },
    });
    expect(scn.characters).toHaveLength(2);
  });

  it("규칙을 어기면 던지고, 무엇을 어겼는지 말한다", async () => {
    const bad = fakeLongformResponse();
    bad.shots[0].seconds = 20;
    await expect(generateLongformScenario({ project, deps: { callJson: async () => bad } }))
      .rejects.toThrow(/구간 1/);
  });
});
