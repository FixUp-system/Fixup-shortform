import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildShowsMessages } from "../lib/cuts.js";
import { buildCastMessages } from "../lib/cast.js";

const project = {
  settings: { i2v_model: "seedance-2.0", target_seconds: 30 },
  material: { text: "동네 카페", photos: [] },
  scenario: { topic: "카페", focus: { mode: "물건", subject: "핸드드립 커피" }, angle: "아침의 준비를 따라간다" },
};
const cuts = [
  { idx: 0, sentence: "오늘도 문을 엽니다.", seconds: 10 },
  { idx: 1, sentence: "", silent: true, seconds: 10 },
];

describe("화면 설계가 시나리오를 읽는다", () => {
  it("★ 전달 방식(angle)이 지문에 실린다 — 없으면 컷마다 딴 이야기가 된다", () => {
    const m = buildShowsMessages(project, cuts, { angle: project.scenario.angle, beats: ["문을 연다", "원두를 간다"] });
    expect(m.messages[0].content).toContain("아침의 준비를 따라간다");
  });

  it("★ 장면이 하는 일(beat)이 컷마다 실린다", () => {
    const m = buildShowsMessages(project, cuts, { angle: "", beats: ["문을 연다", "원두를 간다"] });
    expect(m.messages[0].content).toContain("문을 연다");
    expect(m.messages[0].content).toContain("원두를 간다");
  });

  it("★ 초점을 브리핑이 아니라 시나리오에서 읽는다", () => {
    const m = buildShowsMessages(project, cuts, { angle: "", beats: ["가", "나"] });
    expect(m.messages[0].content).toContain("핸드드립 커피");
  });

  // 시나리오를 거치지 않은 옛 프로젝트는 값이 브리핑에만 있다 — 거기서 읽지 않으면
  // 그 프로젝트의 화면이 초점 없이 만들어진다(어떤 편은 사물, 어떤 편은 인물로 쏠렸다).
  it("시나리오가 없는 옛 프로젝트는 브리핑 초점으로 떨어진다", () => {
    const old = { settings: {}, material: {}, briefing: { focus: { mode: "사람", subject: "50대 사장님" } } };
    expect(buildShowsMessages(old, cuts).messages[0].content).toContain("50대 사장님");
  });

  it("옵션을 안 주면 지금까지와 같은 지문이다 — 옛 호출부가 안 깨진다", () => {
    const m = buildShowsMessages(project, cuts);
    expect(m.messages[0].content).not.toContain("아침의 준비를 따라간다");
  });

  // 위 단언은 angle 하나만 본다. 옛 호출부(측정 스크립트·옛 테스트)가 안 깨진다는 것은
  // **지문 전체가 글자 그대로 같다**는 뜻이라, 그것을 직접 잰다.
  it("★ 옵션이 없으면 컷 줄에 beat 자리가 생기지도 않는다", () => {
    const noOpts = buildShowsMessages(project, cuts).messages[0].content;
    // 컷 줄만 뽑아 본다 — 다른 블록에도 줄표가 쓰이므로(초점 "물건 — …") 전문에서 찾으면 거짓 통과다
    const numbered = noOpts.split("\n").filter((l) => /^\d+\. /.test(l));
    expect(numbered).toEqual(["1. 오늘도 문을 엽니다.", "2. (말 없는 장면)"]);
  });
});

describe("캐스팅이 화자를 받는다", () => {
  it("★ 시나리오가 정한 화자가 지문에 실린다", () => {
    const m = buildCastMessages(cuts, [], "", [], { speakers: ["20대 여성 바리스타", ""] });
    expect(m.messages[0].content).toContain("20대 여성 바리스타");
  });

  it("★ 화면 밖 목소리는 인물로 뽑지 말라고 알린다", () => {
    const m = buildCastMessages(cuts, [], "", [], { speakers: ["내레이션", ""] });
    expect(m.messages[0].content).toContain("내레이션");
  });

  // 화자가 아무도 없는 시나리오(전부 무음)에서 빈 표를 실으면 지문만 길어진다.
  it("화자가 하나도 없으면 블록째 빠진다", () => {
    const m = buildCastMessages(cuts, [], "", [], { speakers: ["", ""] });
    expect(m.messages[0].content).not.toContain("말하는 사람");
  });

  it("옵션을 안 주면 지금까지와 같다", () => {
    const m = buildCastMessages(cuts, [], "", []);
    expect(m.messages[0].content).not.toContain("말하는 사람");
  });
});

// ★★ 이 설계가 실제로 소리 문제를 푸는가 — 이 계획의 존재 이유를 직접 잰다.
//
// 지금까지 막혔던 것: projectSpeaks 가 "대사 있는 컷마다 화면에 말할 사람이 있어야" 를
// 요구하는데, 원고가 먼저 정해지고 캐스팅이 나중에 "화면에 보이는 사람"만 뽑아서
// 실측 15편 중 13편이 떨어졌다. 시나리오가 대사와 화자를 **같이** 정하면 그 어긋남이
// 설계 단계에서 사라진다 — 그것을 여기서 단언한다.
describe("★ 시나리오가 정한 화자가 캐스팅에 닿으면 클립이 말한다", () => {
  it("모든 대사 컷에 화자가 있으면 projectSpeaks 가 통과한다", async () => {
    const { projectSpeaks } = await import("../lib/clip-limits.js");
    const { shotsToCuts } = await import("../lib/cuts.js");
    const scenario = {
      angle: "아침의 준비",
      shots: [
        { beat: "문을 연다", line: "오늘도 문을 엽니다.", speaker: "20대 여성 바리스타", seconds: 10 },
        { beat: "원두를 간다", line: "", speaker: "", seconds: 10 },
        { beat: "잔을 내민다", line: "한 잔 드릴까요.", speaker: "20대 여성 바리스타", seconds: 10 },
      ],
    };
    const cuts = shotsToCuts(scenario);
    // 캐스팅이 화자를 받아 그 컷들을 맡았다고 본다(실제 캐스팅 패스가 하는 일)
    const cast = [{ id: "c1", who: "20대 여성 바리스타", voice: "밝고 또렷한", cuts: [0, 2] }];
    const project = { settings: { i2v_model: "seedance-2.0" }, cuts, cast };
    expect(projectSpeaks(project)).toBe(true);
  });

  it("무음 컷은 화자가 없어도 막지 않는다", async () => {
    const { projectSpeaks } = await import("../lib/clip-limits.js");
    const { shotsToCuts } = await import("../lib/cuts.js");
    const cuts = shotsToCuts({
      shots: [
        { beat: "가", line: "한 잔 드릴까요.", speaker: "20대 여성 바리스타", seconds: 15 },
        { beat: "나", line: "", speaker: "", seconds: 15 },
      ],
    });
    const cast = [{ id: "c1", who: "20대 여성 바리스타", voice: "밝고 또렷한", cuts: [0] }];
    expect(projectSpeaks({ settings: { i2v_model: "seedance-2.0" }, cuts, cast })).toBe(true);
  });
});

// ── 파이프라인이 실제로 시나리오를 읽는가 ────────────────────────────────────
//
// 위 단언들은 지문을 만드는 함수만 본다. 그 함수에 무엇이 넘어가는지는 splitCuts 한 자리가
// 정하고, 거기서 값이 안 넘어가면 **모든 단위 테스트가 초록인 채** 시나리오가 아무 데도
// 안 닿는다(초점을 브리핑에서 읽던 자리가 둘이었던 것이 바로 그런 함정이다).
const llmMock = vi.hoisted(() => ({ callJson: vi.fn() }));
vi.mock("../lib/llm.js", () => ({ callJson: (...a) => llmMock.callJson(...a) }));

import * as projects from "../lib/projects.js";
import * as pipeline from "../lib/pipeline.js";
import { resetMemoryStore } from "../lib/store/memory.js";

const OWNER = "11111111-1111-1111-1111-111111111111";

describe("splitCuts 가 시나리오에서 컷을 만든다", () => {
  beforeEach(() => {
    resetMemoryStore();
    llmMock.callJson.mockReset();
  });

  const SCENARIO = {
    topic: "핸드드립 커피",
    focus: { mode: "물건", subject: "핸드드립 커피" },
    angle: "아침의 준비를 따라간다",
    shots: [
      { beat: "문을 연다", line: "오늘도 문을 엽니다.", speaker: "20대 여성 바리스타", seconds: 8 },
      { beat: "원두를 간다", line: "", speaker: "", seconds: 7 },
    ],
    confirmed: true,
  };

  async function saved(scenario = SCENARIO) {
    const p = await projects.createProject({ ownerId: OWNER,
      settings: { aspect_ratio: "9:16", target_seconds: 15 },
      material: { text: "자료", photos: [] },
    });
    return projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      // 브리핑에는 **다른** 초점을 넣어 둔다 — 어느 쪽을 읽는지가 값으로 갈린다
      briefing: { topic: "옛 주제", focus: { mode: "사람", subject: "옛 브리핑 인물" } },
      script: { text: "옛 원고입니다." },
      scenario,
    }));
  }
  const noCast = { cast: [] };
  const shots = { shots: [{ shows: "문을 여는 손 클로즈업" }, { shows: "원두를 가는 미디엄 샷" }] };

  it("★ 컷과 초가 시나리오 장면 그대로다 — 다시 자르지도 다시 배분하지도 않는다", async () => {
    llmMock.callJson.mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    const cuts = await pipeline.defaultDeps.splitCuts(await saved(), OWNER);
    expect(cuts).toHaveLength(2);
    expect(cuts[0].sentence).toBe("오늘도 문을 엽니다.");
    expect(cuts[0].seconds).toBe(8);
    expect(cuts[1].silent).toBe(true);
    expect(cuts[1].seconds).toBe(7);
    // 원고를 자르던 시절의 흔적이 없다 — 옛 원고("옛 원고입니다.")는 어디에도 안 쓰인다
    expect(cuts.map((c) => c.sentence).join("")).not.toContain("옛 원고");
  });

  it("★ 컷 분할에 LLM 을 부르지 않는다 — 사장님이 확정한 것을 다시 묻지 않는다", async () => {
    llmMock.callJson.mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    await pipeline.defaultDeps.splitCuts(await saved(), OWNER);
    expect(llmMock.callJson.mock.calls.some((c) => c[0]?.stage === "컷 분할")).toBe(false);
  });

  it("★ angle·beat 가 화면 설계 지문까지 간다", async () => {
    llmMock.callJson.mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    await pipeline.defaultDeps.splitCuts(await saved(), OWNER);
    const design = llmMock.callJson.mock.calls.find((c) => c[0]?.stage === "화면 설계")[0];
    const user = design.messages[0].content;
    expect(user).toContain("아침의 준비를 따라간다");
    expect(user).toContain("문을 연다");
    expect(user).toContain("원두를 간다");
    // 초점도 시나리오 쪽이다 — 브리핑의 옛 값이 아니다
    expect(user).toContain("핸드드립 커피");
    expect(user).not.toContain("옛 브리핑 인물");
  });

  it("★ 화자가 캐스팅 지문까지 간다", async () => {
    llmMock.callJson.mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    await pipeline.defaultDeps.splitCuts(await saved(), OWNER);
    const cast = llmMock.callJson.mock.calls.find((c) => c[0]?.stage === "캐스팅")[0];
    expect(cast.messages[0].content).toContain("20대 여성 바리스타");
  });

  // lead 는 초점이 '사람'일 때만 넘어간다. 브리핑을 읽던 자리를 안 옮기면 여기서
  // **브리핑의 인물**이 주인공으로 넘어간다 — 시나리오가 물건을 따라가기로 했는데도.
  it("★ 주인공(lead)을 시나리오 초점에서 읽는다", async () => {
    llmMock.callJson.mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    await pipeline.defaultDeps.splitCuts(await saved(), OWNER);
    const cast = llmMock.callJson.mock.calls.find((c) => c[0]?.stage === "캐스팅")[0];
    expect(cast.messages[0].content).not.toContain("옛 브리핑 인물");

    llmMock.callJson.mockReset();
    llmMock.callJson.mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    const person = { ...SCENARIO, focus: { mode: "사람", subject: "20대 여성 바리스타 사장" } };
    await pipeline.defaultDeps.splitCuts(await saved(person), OWNER);
    const cast2 = llmMock.callJson.mock.calls.find((c) => c[0]?.stage === "캐스팅")[0];
    expect(cast2.messages[0].content).toContain("[이 영상이 따라가는 사람]");
    expect(cast2.messages[0].content).toContain("20대 여성 바리스타 사장");
  });

  it("시나리오가 없으면 던진다 — 원고를 잘라 만들어 내지 않는다", async () => {
    const p = await saved();
    await expect(pipeline.defaultDeps.splitCuts({ ...p, scenario: null }, OWNER)).rejects.toThrow("시나리오가 없어요");
  });
});
