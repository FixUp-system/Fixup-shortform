import { describe, it, expect, beforeEach, vi } from "vitest";
import { isAudioStale, isImageStale, isClipStale, isRenderStale, renderKey, toneKey } from "../lib/steps.js";
import { splitUnits, buildImagePrompt } from "../lib/cuts.js";

const llmMock = vi.hoisted(() => ({ callJson: vi.fn() }));
vi.mock("../lib/llm.js", () => ({ callJson: (...a) => llmMock.callJson(...a) }));

// describePhoto 만 스파이로 바꾼다 — 나머지(selectCandidate)는 진짜를 그대로 쓴다.
// 이 함수는 **불렸는가 안 불렸는가**가 곧 "유료 호출을 했는가"라, 결과만 봐서는
// "판정이 실패했다"와 "볼 바이트가 없어 건너뛰었다"가 구분되지 않는다.
const vlmMock = vi.hoisted(() => ({ describePhoto: vi.fn() }));
vi.mock("../lib/vlm.js", async (importOriginal) => ({
  ...(await importOriginal()),
  describePhoto: (...a) => vlmMock.describePhoto(...a),
}));

// 정적 import 로 올린다 — 동적 재로드는 모듈 스코프의 locks Map 을 새로 만들기 위한
// 것이었는데 낙관적 락으로 바뀌며 그 Map 이 사라졌다.
import * as projects from "../lib/projects.js";
import * as pipeline from "../lib/pipeline.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

const OWNER = "11111111-1111-1111-1111-111111111111";

function deps({ failCut } = {}) {
  return {
    splitCuts: async () => [
      { idx: 0, sentence: "AI컷", seconds: 6, source: "ai", regen_count: 0 },
      { idx: 1, sentence: "사진컷", seconds: 8, source: "photo", photo_id: "p1", regen_count: 0 },
    ],
    genImage: async ({ prompt }) => ({ url: "http://img/" + Math.random() }),
    select: async ({ cut }) =>
      cut.idx === failCut ? { selectedIndex: 0, passed: false, note: "불합격" } : { selectedIndex: 0, passed: true, note: "ok" },
  };
}

beforeEach(() => {
  resetMemoryStore();
  llmMock.callJson.mockReset();
  // 기본은 "아무것도 알아내지 못했다" — 판정을 세우지 않은 테스트가 실수로
  // vision 을 저장하는 일이 없게 한다
  vlmMock.describePhoto.mockReset();
  vlmMock.describePhoto.mockResolvedValue({ person: false, what: "", who: null });
});

async function makeProject() {
  return projects.createProject({ ownerId: OWNER,
    settings: { aspect_ratio: "9:16" },
    material: { text: "자료", photos: [{ id: "p1", filename: "a.jpg", url: "/api/uploads/a.jpg" }] },
  });
}

// 분할과 이미지가 갈라지기 전에는 한 함수였다. 갈라져도 이어 부르면 결과가 같아야 하므로,
// 그 시절 단언들은 이 헬퍼를 거쳐 그대로 살아 있다.
const runBoth = async (id, d) => {
  await pipeline.runSplitPipeline(id, OWNER, d);
  await pipeline.runImagesPipeline(id, OWNER, d);
};

// 주입 deps가 전부 우회하는 자리 — buildCutsMessages와 validateCuts(obj, scenes)가
// 실제로 맞물리는 유일한 지점이라 여기만 직접 부른다.
describe("defaultDeps.splitCuts — 두 패스", () => {
  const SCRIPT = "매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다. 성수역에서 2분입니다.";
  // 실제로 저장된 프로젝트를 쓴다 — splitCuts 가 캐스팅 결과를 프로젝트에 남기기 때문이다.
  // 껍데기 객체로는 그 저장이 갈 곳이 없다.
  async function saved() {
    const p = await projects.createProject({ ownerId: OWNER,
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [{ id: "p1", filename: "a.jpg" }] },
    });
    return projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      briefing: { topic: "생딸기라떼" },
      script: { text: SCRIPT },
    }));
  }
  const ranges = { cuts: [{ from: 1, to: 2 }, { from: 3, to: 3 }] };
  const noCast = { cast: [] };
  // 화면 설계는 사진을 고르지 않는다 — 사진은 props 로 온다
  const shots = { shots: [{ shows: "딸기를 가는 손 클로즈업" }, { shows: "골목을 걷는 시점 샷" }] };

  it("경계로 자른 컷에 화면을 붙여 돌려준다", async () => {
    llmMock.callJson.mockResolvedValueOnce(ranges).mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    const cuts = await pipeline.defaultDeps.splitCuts(await saved(), OWNER);
    expect(cuts).toHaveLength(2);
    // 텍스트는 코드가 원고에서 자른다 — 모델이 문장을 다시 쓰지 못한다
    expect(cuts[0].sentence).toBe("매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다.");
    expect(cuts[1].sentence).toBe("성수역에서 2분입니다.");
    expect(cuts[0].shows).toBe("딸기를 가는 손 클로즈업");
    expect(cuts[0].ref_ids).toBeUndefined();   // 화면 설계는 사진을 고르지 않는다
    expect(cuts[1].ref_ids).toBeUndefined();
    expect(cuts[0].source).toBe("ai");
    expect(cuts[0].seconds).toBeGreaterThan(1);
  });

  it("컷을 이어붙이면 원고와 같다 — 승인한 문장이 글자 그대로 살아남는다", async () => {
    llmMock.callJson.mockResolvedValueOnce(ranges).mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    const cuts = await pipeline.defaultDeps.splitCuts(await saved(), OWNER);
    const joined = cuts.map((c) => c.sentence).join(" ").replace(/\s/g, "");
    expect(joined).toBe(SCRIPT.replace(/\s/g, ""));
  });

  it("화면에서 뽑은 인물이 프로젝트에 남고, 코드가 컷에 꽂는다", async () => {
    const p = await saved();
    // 순서가 요점이다 — 화면 설계가 먼저 돌고, 캐스팅은 그 화면을 읽는다
    llmMock.callJson
      .mockResolvedValueOnce(ranges)
      .mockResolvedValueOnce(shots)
      .mockResolvedValueOnce({ cast: [{ who: "10세 전후 남자아이", cuts: [1] }] });
    const cuts = await pipeline.defaultDeps.splitCuts(p, OWNER);
    const after = await projects.getProject(p.id, OWNER);
    expect(after.cast).toEqual([{ id: "c1", who: "10세 전후 남자아이", cuts: [0] }]);
    // 인물 id 를 컷에 꽂는 것은 모델이 아니라 코드다 — 이것이 인물 일관성의 전부다
    expect(cuts[0].ref_ids).toEqual(["c1"]);   // 인물만 꽂힌다
    expect(cuts[1].ref_ids).toBeUndefined();
  });

  it("화면 패스가 실패해도 컷은 남는다 — 그림은 문장으로 폴백한다", async () => {
    llmMock.callJson.mockResolvedValueOnce(ranges).mockResolvedValue({ shots: [] }); // 개수 불일치
    const cuts = await pipeline.defaultDeps.splitCuts(await saved(), OWNER);
    expect(cuts).toHaveLength(2);
    expect(cuts[0].shows).toBeUndefined();
  });

  it("경계를 못 받으면 한 문장에 한 컷으로 떨어진다 — 대본은 살아 있다", async () => {
    // 빈틈이 있는 경계(2번 문장을 건너뜀)는 거절된다
    llmMock.callJson.mockResolvedValue({ cuts: [{ from: 1, to: 1 }, { from: 3, to: 3 }] });
    const cuts = await pipeline.defaultDeps.splitCuts(await saved(), OWNER);
    expect(cuts).toHaveLength(3);
    expect(cuts[1].sentence).toBe("시럽은 쓰지 않습니다.");
  });

  // ★ 관통의 이음매 — 화면 설계가 답한 톤·전환이 **컷에 꽂히는 그 한 줄**을 잰다.
  //
  // tests/cuts.test.js 의 관통 테스트는 validateShows → buildImagePrompt → toneKey 를
  // 잇지만, 컷과 화면 설계를 합치는 것은 손으로 한다. 실제로 그 합치기가 일어나는 자리는
  // pipeline.js 의 `cuts.map((c, i) => ({ ...c, ...designed[i] }))` 하나뿐이라, 누가 그 spread 를
  // 화이트리스트(shows·motion·speed 만 뽑기)로 "정리"하면 톤·전환이 조용히 사라진다 —
  // 프롬프트에도 각인에도 안 실리니 **전 영상이 톤 없이 나오는데 테스트는 전부 초록**이다.
  // 그래서 여기서는 스텁 컷이 아니라 실제 splitCuts 를 통과시킨다.
  it("화면 설계가 답한 톤·전환이 컷에 꽂혀 그림 프롬프트와 각인까지 간다", async () => {
    const p = await saved();
    llmMock.callJson
      .mockResolvedValueOnce(ranges)
      .mockResolvedValueOnce({
        tone: "채도를 올린 시네마틱 질감",
        environment: "성수동 골목, 골든아워",
        shots: [
          { shows: "딸기를 가는 손 클로즈업" },
          { shows: "골목을 걷는 시점 샷", transition: "발끝이 화면 아래에 걸린 로우 앵글" },
        ],
      })
      .mockResolvedValueOnce(noCast);
    const cuts = await pipeline.defaultDeps.splitCuts(p, OWNER);

    // 톤은 영상 하나의 값이라 전 컷에 꽂힌다. 전환은 컷 고유이고 첫 컷에는 없다.
    expect(cuts[0].tone).toBe("채도를 올린 시네마틱 질감");
    expect(cuts[1].tone).toBe("채도를 올린 시네마틱 질감");
    expect(cuts[0].transition).toBeUndefined();
    expect(cuts[1].transition).toBe("발끝이 화면 아래에 걸린 로우 앵글");

    // 그리고 그 값이 그림 지시와 각인 양쪽에 도달한다 — 여기까지 와야 관통이다
    expect(buildImagePrompt(cuts[0], p)).toContain("채도를 올린 시네마틱 질감");
    expect(buildImagePrompt(cuts[1], p)).toContain("발끝이 화면 아래에 걸린 로우 앵글");
    expect(buildImagePrompt(cuts[0], p)).not.toContain("발끝이 화면 아래에");
    expect(toneKey(cuts[0])).not.toBe(toneKey(cuts[1]));
    expect(toneKey(cuts[1])).toContain("발끝이 화면 아래에 걸린 로우 앵글");
  });

  it("원고가 없으면 컷 분할 실패를 던진다", async () => {
    await expect(pipeline.defaultDeps.splitCuts({ ...(await saved()), script: null }, OWNER)).rejects.toThrow("컷 분할 실패");
  });
});

describe("분할과 이미지가 갈라져 있다", () => {
  it("runSplitPipeline 은 컷만 만들고 이미지는 부르지 않는다", async () => {
    let imageCalls = 0;
    const d = { ...deps(), genImage: async () => { imageCalls++; return { url: "http://img/x" }; } };
    const p = await makeProject();

    await pipeline.runSplitPipeline(p.id, OWNER, d);

    const after = await projects.getProject(p.id, OWNER);
    expect(after.status).toBe("cuts");
    expect(after.cuts.length).toBeGreaterThan(0);
    expect(after.cuts.every((c) => c.state === "pending")).toBe(true);
    expect(imageCalls).toBe(0); // 목소리가 먼저다 — 아직 그림 값을 치르지 않는다
  });

  it("runImagesPipeline 은 이미 있는 컷에 그림을 붙이고 status 를 images 로 올린다", async () => {
    const d = {
      ...deps(),
      splitCuts: async () => { throw new Error("분할을 다시 부르면 안 된다"); },
    };
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      status: "voice",
      cuts: [{ idx: 0, sentence: "첫 문장입니다.", seconds: 3, state: "pending", regen_count: 0, source: "ai" }],
    }));

    await pipeline.runImagesPipeline(p.id, OWNER, d);

    const after = await projects.getProject(p.id, OWNER);
    expect(after.status).toBe("images");
    expect(after.cuts[0].state).toBe("done");
    expect(after.cuts[0].image.url).toContain("http://img/");
  });
});

describe("분할 → 이미지 (이어 부르면 갈라지기 전과 같다)", () => {
  it("정상 흐름: ai 컷은 이미지·검수, photo 컷은 즉시 done", async () => {
    const p = await makeProject();
    await runBoth(p.id,deps());
    const after = await projects.getProject(p.id, OWNER);
    expect(after.status).toBe("images");
    expect(after.cuts[0].state).toBe("done");
    expect(after.cuts[0].image.url).toContain("http://img/");
    expect(after.cuts[1].state).toBe("done");
    expect(after.cuts[1].image).toBeUndefined(); // 사진 컷은 원본 사용
  });

  it("전원 탈락 컷은 자동 보정 후에도 실패하면 needs_attention — 다른 컷은 정상(실패 격리)", async () => {
    const p = await makeProject();
    await runBoth(p.id,deps({ failCut: 0 }));
    const after = await projects.getProject(p.id, OWNER);
    expect(after.cuts[0].state).toBe("needs_attention");
    expect(after.cuts[1].state).toBe("done");
  });

  // ★ 2026-07-31: 검수가 400 으로 던져 방금 $0.08 을 치른 그림이 사라졌다.
  // 화면에는 옛 그림이 그대로여서 "아무것도 안 변했다"로 보였다. 값을 치른 것은 남긴다.
  describe("산 그림은 버리지 않는다", () => {
    it("검수가 물려도 그림은 남는다 — 판정은 passed:false 로 적힌다", async () => {
      const p = await makeProject();
      await runBoth(p.id, deps({ failCut: 0 }));
      const cut = (await projects.getProject(p.id, OWNER)).cuts[0];
      expect(cut.state).toBe("needs_attention");
      expect(cut.image.url).toContain("http://img/");
      expect(cut.vlm.passed).toBe(false);
    });

    it("검수가 죽으면 그림은 남고 판정은 null 이다 — 물린 것과 구분한다", async () => {
      const p = await makeProject();
      await runBoth(p.id, {
        ...deps(),
        select: async () => { throw new Error("VLM 검수 실패 (400)"); },
      });
      const cut = (await projects.getProject(p.id, OWNER)).cuts[0];
      expect(cut.state).toBe("needs_attention");
      expect(cut.image.url).toContain("http://img/");
      expect(cut.vlm.passed).toBeNull();       // 판정이 없다 ≠ 물렸다
      expect(cut.vlm.note).toContain("400");
    });

    it("각인도 함께 남는다 — 안 그러면 낡음 판정이 이 그림을 못 본다", async () => {
      const p = await makeProject();
      await runBoth(p.id, {
        ...deps(),
        splitCuts: async () => [
          { idx: 0, sentence: "AI컷", shows: "딸기라떼 클로즈업", seconds: 6, source: "ai", regen_count: 0 },
        ],
        select: async () => { throw new Error("죽었다"); },
      });
      const cut = (await projects.getProject(p.id, OWNER)).cuts[0];
      expect(cut.image.of).toBe("딸기라떼 클로즈업");
      expect(cut.image.style_of).toBeTruthy();
    });

    it("그림 생성 자체가 죽으면 남길 것이 없다 — 옛 그림을 덮지 않는다", async () => {
      const p = await makeProject();
      await runBoth(p.id, {
        ...deps(),
        genImage: async () => { throw new Error("fal 이 죽었다"); },
      });
      const cut = (await projects.getProject(p.id, OWNER)).cuts[0];
      expect(cut.state).toBe("needs_attention");
      expect(cut.image).toBeUndefined();
      expect(cut.vlm.passed).toBe(false);
    });
  });

  it("검수에 그 컷의 화면을 함께 넘긴다(그림과 심사가 같은 기준을 보게)", async () => {
    const p = await makeProject();
    const seen = [];
    const capturing = {
      ...deps(),
      splitCuts: async () => [{ idx: 0, sentence: "AI컷", shows: "딸기라떼 클로즈업", seconds: 6, source: "ai", regen_count: 0 }],
      select: async ({ scene }) => { seen.push(scene); return { selectedIndex: 0, passed: true, note: "ok" }; },
    };
    await runBoth(p.id,capturing);
    expect(seen[0]?.shows).toBe("딸기라떼 클로즈업");
  });

  it("구성 시절 컷은 장면의 화면으로 검수한다 — 옛 프로젝트를 버리지 않는다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      synopsis: { angle: "앵글", scenes: [{ role: "여는말", shows: "옛 장면 화면", says: "요지", seconds: 5, facts: [] }] },
    }));
    const seen = [];
    const capturing = {
      ...deps(),
      splitCuts: async () => [{ idx: 0, scene_idx: 0, sentence: "옛 컷", seconds: 6, source: "ai", regen_count: 0 }],
      select: async ({ scene }) => { seen.push(scene); return { selectedIndex: 0, passed: true, note: "ok" }; },
    };
    await runBoth(p.id,capturing);
    expect(seen[0]?.shows).toBe("옛 장면 화면");
  });

  it("regenCut은 3회 제한", async () => {
    const p = await makeProject();
    await runBoth(p.id,deps());
    await pipeline.regenCut(p.id, OWNER, 0, deps());
    await pipeline.regenCut(p.id, OWNER, 0, deps());
    await pipeline.regenCut(p.id, OWNER, 0, deps());
    await expect(pipeline.regenCut(p.id, OWNER, 0, deps())).rejects.toThrow(/3회/);
  });

  it("regenCut instruction이 컷에 저장되고 이후 프롬프트에 실린다", async () => {
    const p = await makeProject();
    await runBoth(p.id,deps());
    const prompts = [];
    const capturing = { ...deps(), genImage: async ({ prompt }) => { prompts.push(prompt); return { url: "http://img/x" }; } };
    await pipeline.regenCut(p.id, OWNER, 0, capturing, "딸기라떼가 보이게");
    const cut = (await projects.getProject(p.id, OWNER)).cuts.find((c) => c.idx === 0);
    expect(cut.edit_instruction).toBe("딸기라떼가 보이게");
    expect(prompts.some((pr) => pr.includes("딸기라떼가 보이게"))).toBe(true);
  });

  it("그림에 무엇을 보고 그렸는지를 각인한다", async () => {
    const p = await makeProject();
    await runBoth(p.id, deps());
    const saved = await projects.getProject(p.id, OWNER);
    const ai = saved.cuts.find((c) => c.source === "ai");
    expect(ai.image.of).toBe(ai.shows || "");
    expect(isImageStale(ai)).toBe(false);
    // 화면 설명을 고치면 그 자리에서 낡는다
    expect(isImageStale({ ...ai, shows: "다른 화면" })).toBe(true);
    // 화풍도 함께 각인한다 — 컷 밖(settings)에 있어 따로 적어 둔다.
    // 화풍을 안 고른 프로젝트라 실사로 파생된다.
    expect(ai.image.style_of).toBe("photo|");
    expect(isImageStale(ai, saved)).toBe(false);
    expect(isImageStale(ai, { settings: { style: { preset: "anime" } } })).toBe(true);
  });

  // ⚠️ 이 자리를 테스트가 안 보면, engraved 를 tone_of: cut.tone(원문 그대로)으로 바꿔도
  //    전체 스위트가 그린이다. 그러면 걸러지는 톤을 가진 컷은 각인(원문)과 toneKey("")가
  //    어긋나 **다음 화면 진입에서 전 컷이 낡음으로 뒤집히고 재구매가 제시된다.**
  it("톤도 함께 각인한다 — 단, 그림에 안 들어간 톤은 각인도 안 한다", async () => {
    const p = await makeProject();
    await runBoth(p.id, {
      ...deps(),
      splitCuts: async () => [
        { idx: 0, sentence: "쓰는 톤", shows: "딸기라떼", seconds: 6, source: "ai", regen_count: 0,
          tone: "따뜻한 오후 햇살", transition: "정면 구도로 연다" },
        // 카메라 어휘가 섞여 usableTone 이 통째로 버린다 — 프롬프트에 안 들어가니 각인도 없다
        { idx: 1, sentence: "걸러지는 톤", shows: "간판", seconds: 6, source: "ai", regen_count: 0,
          tone: "천천히 줌 인하는 질감" },
      ],
    });
    const cuts = (await projects.getProject(p.id, OWNER)).cuts;
    expect(cuts[0].image.tone_of).toBe(toneKey(cuts[0]));
    expect(cuts[0].image.tone_of).toBe("따뜻한 오후 햇살\n정면 구도로 연다");
    expect(isImageStale(cuts[0])).toBe(false);
    // 톤을 고치면 그 자리에서 낡는다
    expect(isImageStale({ ...cuts[0], tone: "차가운 새벽" })).toBe(true);

    // 걸러진 톤은 키 자체가 없다 — 빈 문자열을 붙이면 undefined 가 아니게 되어
    // 판정에 들어오고, 각인이 없던 옛 그림까지 같은 문으로 낡는다
    expect("tone_of" in cuts[1].image).toBe(false);
    expect(isImageStale(cuts[1])).toBe(false);
  });

  it("컷마다 그림을 한 장만 만든다 — 후보 2장이던 것을 줄였다", async () => {
    const p = await makeProject();
    let calls = 0;
    const d = { ...deps(), genImage: async () => { calls += 1; return { url: "http://img/" + calls }; } };
    await runBoth(p.id, d);
    const saved = await projects.getProject(p.id, OWNER);
    const aiCuts = saved.cuts.filter((c) => c.source === "ai").length;
    expect(calls).toBe(aiCuts);
  });
});

describe("이미지 생성에 레퍼런스가 배열로 간다", () => {
  it("컷이 고른 인물·사물이 refs 로 넘어간다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      status: "voice",
      cast: [{ id: "c1", who: "주인", ref: { from: "avatar", id: "av-man-30s" } }],
      // 사물(업로드 사진 p1)과 인물(아바타)을 함께 꽂는다 — 사물이 앞이다
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, state: "pending",
               shows: "주인이 자전거를 끄는 미디엄 샷", ref_ids: ["p1", "c1"], regen_count: 0 }],
    }));
    // 업로드 바이트는 Storage 에 있다 — 없으면 레퍼런스가 버려져 이 단언이 무의미해진다
    await getStore().putObject("uploads", "a.jpg", Buffer.from("사진"), "image/jpeg");
    const seen = [];
    const d = {
      splitCuts: async () => { throw new Error("부르면 안 된다"); },
      genImage: async (args) => { seen.push(args.refs); return { url: "img" }; },
      select: async () => ({ passed: true, selectedIndex: 0, note: "" }),
    };
    await pipeline.runImagesPipeline(p.id, OWNER, d);
    // 경로가 아니라 출처와 키다 — 어디서 읽을지는 lib/refs-io.js 가 안다
    expect(seen[0]).toHaveLength(2);
    // ★ 업로드 key 는 photos[].url 의 마지막 조각("a.jpg")이지 photos[].id("p1") 가 아니다.
    // id 를 쓰면 확장자가 없어 toDataUri 가 MIME 을 "image/p1" 으로 만든다 — 조용히 틀린다.
    expect(seen[0][0]).toMatchObject({ source: "upload", key: "a.jpg", kind: "thing" });
    expect(seen[0][1]).toMatchObject({ source: "avatar", key: "man-30s.jpg", who: "주인" });
    // 바이트까지 실려야 한다 — 못 읽은 레퍼런스는 애초에 배열에 없다
    expect(seen[0][0].bytes.toString()).toBe("사진");
    expect(Buffer.isBuffer(seen[0][1].bytes)).toBe(true);
    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cuts[0].image.url).toBe("img");
  });

  it("못 읽는 레퍼런스는 버린다 — 그래도 그림은 나온다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      status: "voice",
      // assets/refs 에 없는 아바타다. 예전에는 avatarFile 이 null 을 줘서 걸러졌고,
      // 지금은 바이트를 못 읽어 걸러진다 — 어느 쪽이든 컷은 살아남아야 한다.
      cast: [{ id: "c1", who: "아이", ref: { from: "avatar", id: "av-child" } }],
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, state: "pending",
               shows: "아이가 자전거를 끄는 미디엄 샷", ref_ids: ["c1"], regen_count: 0 }],
    }));
    const seen = [];
    const d = {
      splitCuts: async () => { throw new Error("부르면 안 된다"); },
      genImage: async (args) => { seen.push(args.refs); return { url: "img" }; },
      select: async () => ({ passed: true, selectedIndex: 0, note: "" }),
    };
    await pipeline.runImagesPipeline(p.id, OWNER, d);
    expect(seen[0]).toEqual([]);
    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cuts[0].image.url).toBe("img");
  });
});

describe("runVoicePipeline — 컷마다 따로 읽힌다", () => {
  async function withCuts(cuts) {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "cuts", cuts, voice_id: "v1" }));
    return p;
  }

  it("컷마다 audio를 채우고 seconds를 실측으로 덮어쓴다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "첫 문장", seconds: 3, state: "done", image: { url: "i0" } },
      { idx: 1, sentence: "둘째 문장", seconds: 9, state: "done", image: { url: "i1" } },
    ]);

    await pipeline.runVoicePipeline(p.id, OWNER, {
      speak: async ({ text }) => ({ url: "a/" + text, seconds: 4.3 }),
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.status).toBe("voice");
    expect(saved.cuts[0].audio).toEqual({ url: "a/첫 문장", seconds: 4.3, of: "첫 문장" });
    // 추정치 3초·9초가 실측 4.3초로 덮인다 — 소리와 그림이 어긋나지 않게
    expect(saved.cuts[0].seconds).toBe(4.3);
    expect(saved.cuts[1].seconds).toBe(4.3);
  });

  it("고른 목소리를 그대로 넘긴다", async () => {
    const p = await withCuts([{ idx: 0, sentence: "문장", seconds: 3 }]);
    let got;
    await pipeline.runVoicePipeline(p.id, OWNER, {
      speak: async (args) => { got = args; return { url: "a", seconds: 1 }; },
    });
    expect(got.voiceId).toBe("v1");
  });

  it("한 컷이 실패해도 나머지는 살아남는다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "실패", seconds: 3 },
      { idx: 1, sentence: "성공", seconds: 3 },
    ]);

    await pipeline.runVoicePipeline(p.id, OWNER, {
      speak: async ({ text }) => {
        if (text === "실패") throw new Error("고장");
        return { url: "a", seconds: 2 };
      },
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cuts[0].voice_error).toMatch(/고장/);
    expect(saved.cuts[0].audio).toBeUndefined();
    expect(saved.cuts[1].audio.url).toBe("a");
    // 일부가 실패해도 단계는 넘어간다 — 사장님이 그 컷만 다시 만들 수 있어야 한다
    expect(saved.status).toBe("voice");
  });

  it("다시 만들면 앞선 실패 표시가 지워진다", async () => {
    const p = await withCuts([{ idx: 0, sentence: "문장", seconds: 3, voice_error: "지난번 실패" }]);
    await pipeline.runVoicePipeline(p.id, OWNER, { speak: async () => ({ url: "a", seconds: 2 }) });
    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cuts[0].voice_error).toBe(null);
  });

  it("소리에 읽은 문장을 각인한다 — 문장을 고치면 낡는다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, OWNER, deps());
    await pipeline.runVoicePipeline(p.id, OWNER, { speak: async () => ({ url: "http://a", seconds: 5 }) });
    const cut = (await projects.getProject(p.id, OWNER)).cuts[0];
    expect(cut.audio.of).toBe(cut.sentence);
    expect(isAudioStale(cut)).toBe(false);
    expect(isAudioStale({ ...cut, sentence: "고친 문장" })).toBe(true);
  });

  // ★ 말하는 모델(Seedance)에서는 클립이 직접 말한다. 여기서 TTS 까지 만들면 소리가
  // 두 겹이 되고, 합성이 컷의 audio 를 우선하므로 화면은 클립 입모양인데 들리는 소리는
  // TTS 가 된다(립싱크가 어긋난다).
  describe("말하는 프로젝트는 목소리를 만들지 않는다", () => {
    // projectSpeaks 는 모델·cast·cuts 를 함께 본다 — 셋이 다 있어야 true 다
    async function speaking(model) {
      const p = await projects.createProject({ ownerId: OWNER,
        settings: { aspect_ratio: "9:16", i2v_model: model },
        material: { text: "자료", photos: [] },
      });
      await projects.updateProject(p.id, OWNER, (proj) => ({
        ...proj, status: "cuts", voice_id: "v1",
        cast: [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }],
        cuts: [{ idx: 0, sentence: "안녕하세요", seconds: 3 }],
      }));
      return p;
    }

    it("TTS 를 한 번도 부르지 않는다", async () => {
      const speak = vi.fn(async () => ({ url: "a.mp3", seconds: 3 }));
      const p = await speaking("seedance-2.0");
      await pipeline.runVoicePipeline(p.id, OWNER, { speak });
      expect(speak).not.toHaveBeenCalled();
      const saved = await projects.getProject(p.id, OWNER);
      expect(saved.cuts[0].audio, "소리가 없어야 합성이 클립 소리를 쓴다").toBeUndefined();
      // 단계는 넘어간다 — status 가 다음 화면을 여는 유일한 신호다(lib/steps.js)
      expect(saved.status).toBe("voice");
    });

    // ★ Kling 은 그대로다 — 이 태스크가 깨면 안 되는 것
    it("말하지 않는 프로젝트는 지금처럼 만든다", async () => {
      const speak = vi.fn(async () => ({ url: "a.mp3", seconds: 3 }));
      const p = await speaking("kling-v3");
      await pipeline.runVoicePipeline(p.id, OWNER, { speak });
      expect(speak).toHaveBeenCalled();
      const saved = await projects.getProject(p.id, OWNER);
      expect(saved.cuts[0].audio.url).toBe("a.mp3");
    });
  });

  it("실측이 8초를 넘으면 추정과 나란히 로그로 남긴다 — 흐름은 막지 않는다", async () => {
    const p = await makeProject();
    await runBoth(p.id, deps());
    const logs = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a) => logs.push(a.join(" ")));
    try {
      // 추정 6초짜리 컷을 9초로 읽어 온다
      await pipeline.runVoicePipeline(p.id, OWNER, {
        speak: async () => ({ url: "http://a.mp3", seconds: 9 }),
      });
    } finally {
      spy.mockRestore();
    }
    expect(logs.some((l) => l.includes("추정") && l.includes("실측")), "긴 실측이 로그에 없다").toBe(true);
    const after = await projects.getProject(p.id, OWNER);
    expect(after.status, "로그를 남겨도 흐름은 그대로 간다").toBe("voice");
    expect(after.cuts.find((c) => c.source === "ai").seconds, "실측이 추정을 덮는다").toBe(9);
  });
});

describe("runVideoPipeline — 이미지를 클립으로", () => {
  async function withCuts(cuts) {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "voice", cuts }));
    return p;
  }

  it("컷마다 클립을 만들고 잘린 컷을 표시한다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "짧은", seconds: 4, image: { url: "i0" }, audio: { url: "a0", seconds: 4 } },
      { idx: 1, sentence: "긴", seconds: 13, image: { url: "i1" }, audio: { url: "a1", seconds: 13 } },
    ]);

    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async ({ seconds }) => ({
        url: "v" + seconds, seconds: Math.min(seconds, 10), truncated: seconds > 10,
      }),
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.status).toBe("video");
    expect(saved.cuts[0].video).toEqual({ url: "v4", seconds: 4, truncated: false, of: "i0|4|" });
    expect(saved.cuts[1].video.truncated).toBe(true);
    // 소리 길이(13초)는 그대로 둔다 — 합성이 정지로 늘려 맞춘다
    expect(saved.cuts[1].seconds).toBe(13);
  });

  it("이미지와 비율을 그대로 넘긴다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "문장", seconds: 3, image: { url: "https://img/a.png" }, audio: { url: "a", seconds: 3 } },
    ]);
    let got;
    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async (args) => { got = args; return { url: "v", seconds: 3, truncated: false }; },
    });
    expect(got.imageUrl).toBe("https://img/a.png");
    expect(got.aspect_ratio).toBe("9:16");
  });

  // 어느 모델로 만들지는 프로젝트가 정한다(lib/clip-limits.js). 파이프라인이 그 문서를
  // 안 넘기면 클립이 조용히 레거시(Kling)로 돌아 한 편 안에 두 모델이 섞인다.
  it("프로젝트 문서를 그대로 넘긴다 — 모델은 프로젝트가 정한다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "문장", seconds: 3, image: { url: "i0" }, audio: { url: "a", seconds: 3 } },
    ]);
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      settings: { ...proj.settings, i2v_model: "seedance-2.0" },
    }));
    let got;
    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async (args) => { got = args; return { url: "v", seconds: 3, truncated: false }; },
    });
    expect(got.project?.settings?.i2v_model).toBe("seedance-2.0");
  });

  it("한 컷이 실패해도 나머지는 살아남는다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "실패", seconds: 3, image: { url: "i0" }, audio: { url: "a0", seconds: 3 } },
      { idx: 1, sentence: "성공", seconds: 3, image: { url: "i1" }, audio: { url: "a1", seconds: 3 } },
    ]);

    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async ({ imageUrl }) => {
        if (imageUrl === "i0") throw new Error("고장");
        return { url: "v", seconds: 3, truncated: false };
      },
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cuts[0].video_error).toMatch(/고장/);
    expect(saved.cuts[1].video.url).toBe("v");
    expect(saved.status).toBe("video");
  });

  it("이미지가 없는 컷은 건너뛴다", async () => {
    // 이미지 단계에서 실패한 컷이 남아 있을 수 있다 — 없는 그림으로 클립을 부르면 안 된다
    const p = await withCuts([
      { idx: 0, sentence: "그림 없음", seconds: 3, audio: { url: "a0", seconds: 3 } },
    ]);
    let called = false;
    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async () => { called = true; return { url: "v", seconds: 3, truncated: false }; },
    });
    expect(called).toBe(false);
    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cuts[0].video_error).toMatch(/이미지/);
  });

  it("클립에 그림·길이·움직임을 각인한다 — 소리를 다시 만들면 낡는다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, OWNER, deps());
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => ({ ...c, image: { url: "http://img/" + c.idx } })),
    }));
    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async () => ({ url: "http://v", seconds: 6, truncated: false }),
    });
    const cut = (await projects.getProject(p.id, OWNER)).cuts[0];
    expect(isClipStale(cut)).toBe(false);
    // 낭독을 다시 만들어 길이가 바뀐 상태
    expect(isClipStale({ ...cut, seconds: cut.seconds + 3 })).toBe(true);
  });

  // 클립은 한 편에서 가장 비싼 단계다. 있는 것을 또 사면 그 값이 그대로 두 배가 된다.
  // 2026-07-30 A/B 측정으로 컷 하나를 미리 사 둔 일이 있었고, 그것을 심어도 다시 샀다.
  it("살아 있는 클립이 있는 컷은 건너뛴다 — 부르지 않는다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "이미 있다", seconds: 3, image: { url: "i0" }, audio: { url: "a0", seconds: 3 },
        video: { url: "https://fal/keep.mp4", seconds: 3, truncated: false, of: "i0|3|" } },
      { idx: 1, sentence: "없다", seconds: 3, image: { url: "i1" }, audio: { url: "a1", seconds: 3 } },
    ]);

    const called = [];
    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async ({ imageUrl }) => { called.push(imageUrl); return { url: "new", seconds: 3, truncated: false }; },
    });

    expect(called).toEqual(["i1"]);                       // i0 는 부르지 않았다
    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cuts[0].video.url).toBe("https://fal/keep.mp4"); // 있던 것이 그대로다
    expect(saved.cuts[1].video.url).toBe("new");
    expect(saved.status).toBe("video");
  });

  // 그림이나 낭독이 바뀐 뒤의 클립은 옛것이다. 아끼려고 그것을 두면 완성본이 어긋난다.
  it("낡은 클립은 건너뛰지 않는다 — 다시 만든다", async () => {
    const p = await withCuts([
      // of 가 지금 clipKey(= "i0|3|") 와 다르다 — 그림이 바뀐 뒤다
      { idx: 0, sentence: "낡음", seconds: 3, image: { url: "i0" }, audio: { url: "a0", seconds: 3 },
        video: { url: "https://fal/old.mp4", seconds: 3, truncated: false, of: "옛그림|3|" } },
    ]);

    const called = [];
    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async ({ imageUrl }) => { called.push(imageUrl); return { url: "new", seconds: 3, truncated: false }; },
    });

    expect(called).toEqual(["i0"]);
    expect((await projects.getProject(p.id, OWNER)).cuts[0].video.url).toBe("new");
  });

  // 각인이 없는 옛 산출물은 낡지 않은 것으로 본다(isClipStale 의 규칙). 그러면 건너뛴다 —
  // 유료 호출을 부르는 쪽에서는 "모르면 사지 않는다"가 안전한 방향이다.
  it("각인이 없는 옛 클립도 건너뛴다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "각인없음", seconds: 3, image: { url: "i0" }, audio: { url: "a0", seconds: 3 },
        video: { url: "https://fal/nostamp.mp4", seconds: 3 } },
    ]);

    const called = [];
    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async ({ imageUrl }) => { called.push(imageUrl); return { url: "new", seconds: 3, truncated: false }; },
    });

    expect(called).toEqual([]);
    expect((await projects.getProject(p.id, OWNER)).cuts[0].video.url).toBe("https://fal/nostamp.mp4");
  });

  // ★ 말하는 모델에서는 대사·목소리가 프롬프트에 실리므로 각인에도 들어간다. 그런데 각인을
  //   **남길 때와 잴 때가 다른 출처**면 영원히 불일치가 되어, [영상 만들기]를 누를 때마다
  //   살아 있는 클립을 전부 다시 산다(Seedance 30초 한 편이 회당 ~$9다).
  //   그래서 손으로 꽂은 필드가 아니라 **파이프라인을 두 번 돌려** 재구매를 잰다.
  describe("말하는 모델의 각인 — 다시 돌려도 다시 사지 않는다", () => {
    async function speaking(voice = "중저음, 차분한 톤") {
      const p = await makeProject();
      await projects.updateProject(p.id, OWNER, (proj) => ({
        ...proj,
        status: "voice",
        settings: { ...proj.settings, i2v_model: "seedance-2.0" },
        cast: [{ id: "c1", who: "20대 남성", voice, cuts: [0] }],
        // ★ audio 가 없는 것이 말하는 프로젝트의 실제 모습이다 — ③목소리가 TTS 를 아예 안
        //   만든다(runVoicePipeline). 소리 파일이 있으면 projectSpeaks 가 false 로 떨어진다.
        cuts: [{ idx: 0, sentence: "안녕하세요", seconds: 4, image: { url: "i0" } }],
      }));
      return p;
    }
    const counting = (called) => ({
      clip: async () => { called.push(1); return { url: "v", seconds: 4, truncated: false }; },
    });

    it("두 번 돌려도 두 번 사지 않는다", async () => {
      const p = await speaking();
      const called = [];
      await pipeline.runVideoPipeline(p.id, OWNER, counting(called));
      expect(called.length).toBe(1);
      await pipeline.runVideoPipeline(p.id, OWNER, counting(called));
      expect(called.length, "살아 있는 말하는 클립을 다시 샀다").toBe(1);
    });

    it("목소리를 바꾸면 그때 다시 산다", async () => {
      const p = await speaking();
      const called = [];
      await pipeline.runVideoPipeline(p.id, OWNER, counting(called));
      await projects.updateProject(p.id, OWNER, (proj) => ({
        ...proj,
        cast: [{ ...proj.cast[0], voice: "높고 밝은 톤" }],
      }));
      await pipeline.runVideoPipeline(p.id, OWNER, counting(called));
      expect(called.length, "목소리를 바꿨는데 옛 클립을 그대로 뒀다").toBe(2);
    });

    it("대사를 바꾸면 그때 다시 산다", async () => {
      const p = await speaking();
      const called = [];
      await pipeline.runVideoPipeline(p.id, OWNER, counting(called));
      await projects.updateProject(p.id, OWNER, (proj) => ({
        ...proj,
        cuts: proj.cuts.map((c) => ({ ...c, sentence: "다른 말을 합니다" })),
      }));
      await pipeline.runVideoPipeline(p.id, OWNER, counting(called));
      expect(called.length).toBe(2);
    });
  });
});

describe("runRenderPipeline — 하나로 합친다", () => {
  it("합성 결과를 render 에 담고 done 으로 넘긴다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "video",
      cuts: [{ idx: 0, sentence: "문장", seconds: 4, video: { url: "v0" }, audio: { url: "a0", seconds: 4 } }],
    }));

    await pipeline.runRenderPipeline(p.id, OWNER, {
      compose: async () => ({ url: "/api/renders/x.mp4", seconds: 4 }),
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.status).toBe("done");
    expect(saved.render.url).toBe("/api/renders/x.mp4");
    expect(saved.render.ts).toBeGreaterThan(0);
  });

  it("가짜 모드 표시를 그대로 옮긴다", async () => {
    // 화면이 "파일은 만들어지지 않았어요"를 띄우려면 이 값이 살아 있어야 한다
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "video",
      cuts: [{ idx: 0, sentence: "문장", seconds: 4, video: { url: "v0" }, audio: { url: "a0", seconds: 4 } }],
    }));

    await pipeline.runRenderPipeline(p.id, OWNER, {
      compose: async () => ({ url: null, seconds: 4, fake: true }),
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.render.fake).toBe(true);
    expect(saved.render.url).toBe(null);
  });

  it("고른 비율과 컷을 그대로 넘긴다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "video", settings: { aspect_ratio: "1:1" },
      cuts: [{ idx: 0, sentence: "문장", seconds: 4, video: { url: "v0" }, audio: { url: "a0", seconds: 4 } }],
    }));

    let got;
    await pipeline.runRenderPipeline(p.id, OWNER, {
      compose: async (args) => { got = args; return { url: "u", seconds: 4 }; },
    });
    expect(got.aspect_ratio).toBe("1:1");
    expect(got.cuts).toHaveLength(1);
  });

  // ★★ 각인(renderKey)에는 subtitle 이 들어간다. 합성에 설정을 안 실으면 완성본은 기본
  // 흰 자막·옛 자리로 나오는데 각인은 "설정대로 만들었다"고 찍혀 **낡음으로도 안 잡힌다** —
  // 사장님이 꾸민 자막이 컷을 한 번 고치는 순간 조용히 사라진다.
  it("고른 자막 설정을 합성에 싣는다", async () => {
    const p = await makeProject();
    const subtitle = { pos: [0.5, 0.4], font: "impact", color: "#FF0000", size: 1.4 };
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "video", settings: { aspect_ratio: "9:16", subtitle },
      cuts: [{ idx: 0, sentence: "문장", seconds: 4, video: { url: "v0" }, audio: { url: "a0", seconds: 4 } }],
    }));

    let got;
    await pipeline.runRenderPipeline(p.id, OWNER, {
      compose: async (args) => { got = args; return { url: "u", seconds: 4 }; },
    });
    expect(got.subtitle).toEqual(subtitle);
  });

  it("설정을 한 번도 안 고친 프로젝트는 subtitle 없이 간다 — 옛 경로 그대로", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "video", settings: { aspect_ratio: "9:16", subtitle_position: "top" },
      cuts: [{ idx: 0, sentence: "문장", seconds: 4, video: { url: "v0" }, audio: { url: "a0", seconds: 4 } }],
    }));

    let got;
    await pipeline.runRenderPipeline(p.id, OWNER, {
      compose: async (args) => { got = args; return { url: "u", seconds: 4 }; },
    });
    expect(got.subtitle).toBeUndefined();
    expect(got.subtitlePosition).toBe("top");
  });

  it("완성본에 컷별 소리·클립·문장을 각인한다 — 컷을 고치면 낡는다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, OWNER, deps());
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => ({
        ...c, audio: { url: "http://a" + c.idx, seconds: 5 }, video: { url: "http://v" + c.idx, seconds: 6 },
      })),
    }));
    await pipeline.runRenderPipeline(p.id, OWNER, {
      compose: async () => ({ url: "http://out.mp4", seconds: 12 }),
    });
    const saved = await projects.getProject(p.id, OWNER);
    expect(isRenderStale(saved)).toBe(false);
    const edited = { ...saved, cuts: [{ ...saved.cuts[0], sentence: "고친 문장" }, ...saved.cuts.slice(1)] };
    expect(isRenderStale(edited)).toBe(true);
  });
});

// ★★ 자막만 다시 굽는 길은 **옛 원본**(컷을 고치기 전에 만든 것)에 자막만 얹는다.
// 그런데 각인을 지금 컷 기준으로 통째로 덮으면 낡음 경고가 사라지고 [내려받기]가 열려,
// 사장님이 **옛 클립·옛 소리**짜리 mp4 를 최신인 줄 알고 받아 간다.
describe("runSubtitlePipeline — 각인의 머리만 갈아 끼운다", () => {
  async function projectWithRender({ subtitle } = {}) {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "video",
      cuts: [{ idx: 0, sentence: "문장", seconds: 4, video: { url: "v0" }, audio: { url: "a0", seconds: 4 } }],
      ...(subtitle ? { settings: { ...proj.settings, subtitle } } : {}),
    }));
    await pipeline.runRenderPipeline(p.id, OWNER, {
      compose: async () => ({ url: "/api/renders/x.mp4", rawUrl: "/api/renders/x-raw.mp4", seconds: 4 }),
    });
    return p;
  }

  const burn = async () => ({ url: "/api/renders/x.mp4", seconds: 4 });

  it("낡은 프로젝트는 자막만 다시 구워도 여전히 낡음이다 — 몸통을 보존한다", async () => {
    const p = await projectWithRender();
    // 완성본을 만든 뒤 컷을 고친다 → 옛 소리·옛 그림으로 만든 완성본이 된다
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => ({ ...c, sentence: "고친 문장" })),
      settings: { ...proj.settings, subtitle: { color: "#FF0000" } },
    }));
    expect(isRenderStale(await projects.getProject(p.id, OWNER))).toBe(true);

    await pipeline.runSubtitlePipeline(p.id, OWNER, { burn });

    const saved = await projects.getProject(p.id, OWNER);
    expect(isRenderStale(saved), "낡은 원본에 자막만 얹고 '최신'으로 찍혔다").toBe(true);
  });

  it("안 낡은 프로젝트는 각인이 renderKey 와 같다", async () => {
    const p = await projectWithRender();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, settings: { ...proj.settings, subtitle: { color: "#FF0000" } },
    }));

    await pipeline.runSubtitlePipeline(p.id, OWNER, { burn });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.render.of).toBe(renderKey(saved));
    expect(isRenderStale(saved)).toBe(false);
  });

  it("옛 위치 필드도 함께 태운다 — settings.subtitle 이 없는 프로젝트", async () => {
    const p = await projectWithRender();
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, settings: { ...proj.settings, subtitle_position: "top" },
    }));

    let got;
    await pipeline.runSubtitlePipeline(p.id, OWNER, {
      burn: async (args) => { got = args; return { url: "/api/renders/x.mp4", seconds: 4 }; },
    });
    expect(got.subtitlePosition).toBe("top");
  });
});

describe("사물 레퍼런스 — 캐스팅이 답하고 코드가 꽂는다", () => {
  // 자료에 사물 사진 하나. vision.person 이 false 라 인물 쪽으로 가지 않는다.
  async function projectWithThingPhoto(focusMode = "물건") {
    const p = await projects.createProject({ ownerId: OWNER,
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [{ id: "p1", filename: "b.jpg", vision: { person: false, what: "화장품 병" } }] },
    });
    return projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      briefing: { topic: "앰플", focus: { mode: focusMode, subject: "VT 앰플" } },
      script: { text: "앰플이 있습니다. 얼굴에 바릅니다." },
    }));
  }

  // 분할 → 화면 설계 → 캐스팅 순서로 응답을 준다
  function answer({ props }) {
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [], props });
  }

  it("사물이 보이는 컷에 사진을 꽂는다", async () => {
    const p = await projectWithThingPhoto();
    answer({ props: [{ photo_id: "p1", cuts: [1, 2] }] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id, OWNER), OWNER);
    expect(cuts[0].ref_ids).toEqual(["p1"]);
    expect(cuts[1].ref_ids).toEqual(["p1"]);
  });

  it("초점이 물건인데 사물이 0개면 한 번 더 묻는다", async () => {
    const p = await projectWithThingPhoto("물건");
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [], props: [] })            // 1차 — 빈손
      .mockResolvedValueOnce({ cast: [], props: [{ photo_id: "p1", cuts: [1] }] }); // 2차
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id, OWNER), OWNER);
    expect(cuts[0].ref_ids).toEqual(["p1"]);
    expect(llmMock.callJson).toHaveBeenCalledTimes(4); // 분할·화면·캐스팅 두 번
  });

  it("초점이 물건이 아니면 0개라도 다시 묻지 않는다 — 값을 치를 이유가 없다", async () => {
    const p = await projectWithThingPhoto("정보");
    answer({ props: [] });
    await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id, OWNER), OWNER);
    expect(llmMock.callJson).toHaveBeenCalledTimes(3);
  });

  it("재시도 2차에 인물이 빠져도 1차에서 뽑은 인물을 잃지 않는다", async () => {
    const p = await projectWithThingPhoto("물건");
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [{ who: "20대 여성", cuts: [1] }], props: [] })  // 1차 — 인물 있음, 제품 0개
      .mockResolvedValueOnce({ cast: [], props: [{ photo_id: "p1", cuts: [1] }] });   // 2차 — 인물 사라짐
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id, OWNER), OWNER);
    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cast).toHaveLength(1);            // 1차 인물이 살아 있다
    expect(cuts[0].ref_ids).toContain("p1");       // 2차 제품도 반영됐다
  });

  it("재시도 2차가 예외로 죽어도 1차 답을 지킨다", async () => {
    const p = await projectWithThingPhoto("물건");
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [{ who: "20대 여성", cuts: [1] }], props: [] })
      .mockRejectedValueOnce(new Error("네트워크"));
    await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id, OWNER), OWNER);
    expect((await projects.getProject(p.id, OWNER)).cast).toHaveLength(1);
  });
});

describe("사진 판정 실패는 저장하지 않는다 — 다음 실행이 다시 본다", () => {
  // 사진 한 장짜리 프로젝트를 세우고 분할 두 패스를 흘려보낸다
  async function withPhoto() {
    const p = await projects.createProject({ ownerId: OWNER,
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [{ id: "p1", filename: "c.jpg", url: "/api/uploads/c.jpg" }] },
    });
    const saved = await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      script: { text: "문장 하나입니다." },
    }));
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "화면" }] })
      .mockResolvedValueOnce({ cast: [], props: [] });
    return saved;
  }

  it("VLM 이 아무것도 알아내지 못한 판정(none)은 vision 을 저장하지 않는다", async () => {
    // ★ 바이트를 Storage 에 심어야 describePhoto 가 실제로 불린다. 안 심으면 그 앞의
    // "볼 것이 없으면 건너뛴다"에서 끊겨, 이 단언이 **다른 이유로** 통과한다(그렇게 무력해진 적이 있다).
    await getStore().putObject("uploads", "c.jpg", Buffer.from("사진"), "image/jpeg");
    const saved = await withPhoto();
    // none({person:false, what:""}) = 실패한 판정. 저장되면 다음 실행이 재판정하지 않고 사물로 굳는다.
    vlmMock.describePhoto.mockResolvedValue({ person: false, what: "", who: null });
    await pipeline.defaultDeps.splitCuts(saved, OWNER);
    expect(vlmMock.describePhoto).toHaveBeenCalledTimes(1);
    const after = await projects.getProject(saved.id, OWNER);
    expect(after.material.photos[0].vision).toBeUndefined();
  });

  it("알아낸 판정은 저장한다 — none 과 갈리는 자리다", async () => {
    await getStore().putObject("uploads", "c.jpg", Buffer.from("사진"), "image/jpeg");
    const saved = await withPhoto();
    vlmMock.describePhoto.mockResolvedValue({ person: false, what: "화장품 병", who: null });
    await pipeline.defaultDeps.splitCuts(saved, OWNER);
    const after = await projects.getProject(saved.id, OWNER);
    expect(after.material.photos[0].vision).toEqual({ person: false, what: "화장품 병", who: null });
  });

  it("볼 바이트가 없으면 판정을 건너뛴다 — 못 보고 내리는 판정에 값을 치르지 않는다", async () => {
    // Storage 에 c.jpg 를 안 심는다. 유료 호출(gpt-4o vision)이 아예 나가면 안 된다.
    const saved = await withPhoto();
    await pipeline.defaultDeps.splitCuts(saved, OWNER);
    expect(vlmMock.describePhoto).not.toHaveBeenCalled();
    const after = await projects.getProject(saved.id, OWNER);
    expect(after.material.photos[0].vision).toBeUndefined();
  });

  it("성공한 판정({person:false, what:'화장품 병'})은 저장한다", async () => {
    // 사람이 아니라고 '알아낸' 것은 성공이다 — none 과 구분해야 한다
    const p = await projects.createProject({ ownerId: OWNER,
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [{ id: "p1", filename: "b.jpg", vision: { person: false, what: "화장품 병" } }] },
    });
    const saved = await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      script: { text: "문장 하나입니다." },
    }));
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "화면" }] })
      .mockResolvedValueOnce({ cast: [], props: [] });
    await pipeline.defaultDeps.splitCuts(saved, OWNER);
    const after = await projects.getProject(p.id, OWNER);
    expect(after.material.photos[0].vision).toEqual({ person: false, what: "화장품 병" });
  });
});

describe("컷 길이 — 쪼갤 수 있으면 코드가 되돌린다", () => {
  // 판정만 하고 되묻는 방식은 실패했다 — 모델이 같은 답을 다시 냈고 코드가 받았다.
  // 이제 되묻지 않고 그 자리에서 푼다.
  const LONG = "이 앰플은 PDRN과 엑소좀, 시카가 함께 들어 있어 자기 전에 토너를 바른 후, 2~3방울을 얼굴에 펴 바르고 자면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";

  async function projectWithLongSentence() {
    const p = await projects.createProject({ ownerId: OWNER,
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [] },
    });
    return projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, briefing: { topic: "앰플" }, script: { text: LONG },
    }));
  }

  const splitCallCount = () =>
    llmMock.callJson.mock.calls.filter((c) => c[0]?.stage === "컷 분할").length;

  it("한 컷에 다 몰아넣으면 되묻지 않고 코드가 푼다", async () => {
    const p = await projectWithLongSentence();
    const units = splitUnits(LONG);
    expect(units.length, "이 문장이 여러 조각으로 나뉘어야 이 테스트가 의미가 있다").toBeGreaterThan(1);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: units.length }] })   // 통째로 몰아넣은 답
      .mockResolvedValueOnce({ shots: [] })                               // 화면 설계
      .mockResolvedValueOnce({ cast: [] });                               // 캐스팅
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id, OWNER), OWNER);
    expect(splitCallCount(), "분할은 한 번만 묻는다").toBe(1);
    expect(cuts.length, "조각 수만큼 풀린다").toBe(units.length);
  });

  it("컷을 이어붙이면 원고와 같다 — 풀어도 보장은 그대로다", async () => {
    const p = await projectWithLongSentence();
    const units = splitUnits(LONG);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: units.length }] })
      .mockResolvedValueOnce({ shots: [] })
      .mockResolvedValueOnce({ cast: [] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id, OWNER), OWNER);
    const joined = cuts.map((c) => c.sentence).join(" ").replace(/\s/g, "");
    expect(joined).toBe(LONG.replace(/\s/g, ""));
  });

  it("쪼갤 수 없는 문장은 그대로 둔다 — 영영 실패하지 않게", async () => {
    const NO_BREAK = "아주아주아주긴한덩어리로이어져서끊을자리가전혀없는문장이길게이어지고또이어져서마침내끝납니다.";
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, briefing: { topic: "t" }, script: { text: NO_BREAK },
    }));
    const units = splitUnits(NO_BREAK);
    expect(units.length, "이 문장은 나눌 자리가 없어야 한다").toBe(1);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }] })
      .mockResolvedValueOnce({ shots: [] })
      .mockResolvedValueOnce({ cast: [] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id, OWNER), OWNER);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].seconds, "8초를 넘지만 더 쪼갤 수 없다").toBeGreaterThan(8);
    expect(splitCallCount()).toBe(1);
  });

  it("8초 이하로 묶은 답은 건드리지 않는다", async () => {
    const TWO = "매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다.";
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj, briefing: { topic: "t" }, script: { text: TWO },
    }));
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 2 }] })   // 둘을 한 컷으로 — 8초 이하다
      .mockResolvedValueOnce({ shots: [] })
      .mockResolvedValueOnce({ cast: [] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id, OWNER), OWNER);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].seconds).toBeLessThanOrEqual(8);
  });
});

// 재생성 3회 상한은 낙관적 락(updateProject) **안에서** 판정된다. 그런데 CAS 에 지면
// 같은 patchFn 이 다시 불리므로, 바깥 변수(exceeded)를 시도마다 초기화하지 않으면
// **버려진 시도가 세운 true 가 다음 시도까지 살아남는다** — 재시도가 성공해 카운트를
// 올려놓고도 "3회까지예요"를 던지는 상태다. 그 회귀를 여기서 막는다.
describe("재생성 상한 판정이 낙관적 락 재시도를 견딘다", () => {
  async function projectWithCut(extra = {}) {
    const p = await projects.createProject({ ownerId: OWNER,
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [] },
    });
    return projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 5, source: "ai", regen_count: 0, ...extra }],
    }));
  }

  // 첫 CAS 한 번만 지게 한다 — 남이 먼저 쓴 상황을 그대로 흉내 낸다.
  function loseFirstCas() {
    const store = getStore();
    const real = store.updateProjectRow.bind(store);
    let first = true;
    return vi.spyOn(store, "updateProjectRow").mockImplementation(async (...a) => {
      if (first) { first = false; return false; }
      return real(...a);
    });
  }

  // ★ 리셋 유무를 실제로 가르는 유일한 방법 — **두 시도가 서로 다른 문서를 보게 한다.**
  //
  // 첫 CAS 를 지게만 하면 재시도는 같은 문서를 다시 읽는다. 그러면 상한 판정도 같아서
  // `exceeded = false;` 를 지워도 결과가 안 바뀐다(실제로 지워 보고 확인했다 — 전부 통과했다).
  // 그래서 여기서는 **남이 먼저 쓴 그 쓰기가 문서를 바꾸게** 한다:
  //   - 버려진 첫 시도 → 카운트가 이미 3 이라 **상한 초과**(exceeded = true)
  //   - 재시도 → 남이 컷을 새로 만들어 카운트가 0 이므로 **정상**
  // 재분할처럼 컷 배열을 통째로 새로 쓰는 요청이 겹치면 실제로 이렇게 된다.
  // 리셋이 있으면 재시도가 성공해 던지지 않고, 없으면 버려진 true 가 살아남아 던진다.
  function loseFirstCasAndResetCount(field) {
    const store = getStore();
    const real = store.updateProjectRow.bind(store);
    let first = true;
    return vi.spyOn(store, "updateProjectRow").mockImplementation(async (id, ownerId, expectedVersion, doc) => {
      if (first) {
        first = false;
        const row = await store.selectProject(id, OWNER);
        await real(id, ownerId, row.version, {
          ...row.doc,
          cuts: row.doc.cuts.map((c) => ({ ...c, [field]: 0 })),
        });
        return false; // 우리 시도는 졌다 — version 이 이미 올라갔으니 진짜로도 진다
      }
      return real(id, ownerId, expectedVersion, doc);
    });
  }

  it("regenVoice — 버려진 시도가 본 상한이 재시도까지 살아남지 않는다", async () => {
    const p = await projectWithCut({ voice_regen_count: 3 });
    const spy = loseFirstCasAndResetCount("voice_regen_count");
    try {
      await pipeline.regenVoice(p.id, OWNER, 0, { speak: async () => ({ url: "http://a.mp3", seconds: 3 }) });
    } finally {
      spy.mockRestore();
    }
    const cut = (await projects.getProject(p.id, OWNER)).cuts[0];
    // 버려진 시도는 세지 않는다 — 0 에서 한 번 올라 1이어야 한다
    expect(cut.voice_regen_count).toBe(1);
    expect(cut.audio?.url).toBe("http://a.mp3");
  });

  // ★ 재생성도 같은 모델로 돌아야 한다 — 여기를 빠뜨리면 재생성만 레거시(Kling)가 되어
  // 한 편 안에 두 모델이 섞인다.
  it("regenClip — 프로젝트 문서를 그대로 넘긴다", async () => {
    const p = await projectWithCut({ image: { url: "http://img/a", of: "" } });
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      settings: { ...proj.settings, i2v_model: "seedance-2.0" },
    }));
    let got;
    await pipeline.regenClip(p.id, OWNER, 0, {
      clip: async (args) => { got = args; return { url: "http://v.mp4", seconds: 5 }; },
    });
    expect(got.project?.settings?.i2v_model).toBe("seedance-2.0");
  });

  it("regenClip — 버려진 시도가 본 상한이 재시도까지 살아남지 않는다", async () => {
    const p = await projectWithCut({ clip_regen_count: 3, image: { url: "http://img/a", of: "" } });
    const spy = loseFirstCasAndResetCount("clip_regen_count");
    try {
      await pipeline.regenClip(p.id, OWNER, 0, { clip: async () => ({ url: "http://v.mp4", seconds: 5 }) });
    } finally {
      spy.mockRestore();
    }
    const cut = (await projects.getProject(p.id, OWNER)).cuts[0];
    expect(cut.clip_regen_count).toBe(1);
    expect(cut.video?.url).toBe("http://v.mp4");
  });

  it("regenCut — 버려진 시도가 본 상한이 재시도까지 살아남지 않는다", async () => {
    const p = await projectWithCut({ regen_count: 3 });
    const spy = loseFirstCasAndResetCount("regen_count");
    try {
      await pipeline.regenCut(p.id, OWNER, 0, deps());
    } finally {
      spy.mockRestore();
    }
    expect((await projects.getProject(p.id, OWNER)).cuts[0].regen_count).toBe(1);
  });

  it("진짜로 상한에 닿았으면 CAS 에 져도 여전히 던진다", async () => {
    const p = await projectWithCut({ voice_regen_count: 3 });
    const spy = loseFirstCas();
    try {
      await expect(
        pipeline.regenVoice(p.id, OWNER, 0, { speak: async () => ({ url: "x", seconds: 1 }) })
      ).rejects.toThrow(/3회/);
    } finally {
      spy.mockRestore();
    }
  });
});

// 심장박동 — 파이프라인이 컷을 저장할 때마다 progress 를 함께 남기는가.
// 순수 함수(withProgress·isCutDone)는 따로 보고, 여기서는 **파이프라인이 실제로 찍는가**를
// 본다. 감싸는 것을 하나 빼먹어도 순수 테스트는 전부 통과하기 때문이다.
describe("심장박동 — 파이프라인이 컷 저장에 진척을 남긴다", () => {
  // 인메모리 저장소에 쓰기 카운터가 따로 없어, 낙관적 락의 version 을 센다 —
  // updateProjectRow 가 성공할 때만 1 오르므로 저장 횟수와 같은 값이다.
  const writes = async (id) => (await getStore().selectProject(id, OWNER)).version;

  async function withCuts(cuts, status) {
    const p = await makeProject();
    await projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, status, cuts, voice_id: "v1" }));
    return p;
  }

  it("runImagesPipeline 뒤에 images 단계 표식이 남는다", async () => {
    const p = await makeProject();
    await runBoth(p.id, deps());

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.progress.phase).toBe("images");
    expect(saved.progress.total).toBe(2);
    expect(saved.progress.done).toBe(2); // ai 컷 + 사진 컷 둘 다 끝났다
    expect(saved.progress.at).toBeGreaterThan(0);
  });

  // ★ 회귀 방지(끝남 판정에 needs_attention 이 빠졌을 때 잡히는 자리):
  // 그림 생성이 죽은 컷은 image 없이 needs_attention 으로 끝난다. 그 컷을 안 세면
  // 문서가 done:1/total:2 로 굳어 정상 종료한 생성이 영영 "멈춤"으로 읽힌다.
  it("이미지 단계에서 죽은 컷이 있어도 끝나면 done 이 total 까지 찬다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, OWNER, deps());
    await pipeline.runImagesPipeline(p.id, OWNER, {
      ...deps(),
      genImage: async () => { throw new Error("그림 생성이 죽었다"); },
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cuts[0].state).toBe("needs_attention");
    expect(saved.cuts[0].image).toBeUndefined(); // 산 그림이 없어 남길 것이 없었다
    expect(saved.progress).toMatchObject({ phase: "images", done: 2, total: 2 });
  });

  it("runVoicePipeline 뒤에 voice 단계 표식이 남는다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "첫", seconds: 3, image: { url: "i0" } },
      { idx: 1, sentence: "둘", seconds: 3, image: { url: "i1" } },
    ], "cuts");

    await pipeline.runVoicePipeline(p.id, OWNER, { speak: async () => ({ url: "a", seconds: 2 }) });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.progress).toMatchObject({ phase: "voice", done: 2, total: 2 });
  });

  it("낭독이 실패한 컷도 끝난 것으로 세어 진척이 멈추지 않는다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "실패", seconds: 3 },
      { idx: 1, sentence: "성공", seconds: 3 },
    ], "cuts");

    await pipeline.runVoicePipeline(p.id, OWNER, {
      speak: async ({ text }) => {
        if (text === "실패") throw new Error("못 읽었다");
        return { url: "a", seconds: 2 };
      },
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.progress).toMatchObject({ phase: "voice", done: 2, total: 2 });
  });

  it("runVideoPipeline 뒤에 video 단계 표식이 남는다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "첫", seconds: 4, image: { url: "i0" }, audio: { url: "a0", seconds: 4 } },
      { idx: 1, sentence: "둘", seconds: 4, image: { url: "i1" }, audio: { url: "a1", seconds: 4 } },
    ], "voice");

    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async () => ({ url: "v", seconds: 4, truncated: false }),
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.progress).toMatchObject({ phase: "video", done: 2, total: 2 });
  });

  it("표식을 얹어도 저장 횟수는 늘지 않는다 — 기존 저장에 얹기 때문이다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "첫", seconds: 4, image: { url: "i0" }, audio: { url: "a0", seconds: 4 } },
      { idx: 1, sentence: "둘", seconds: 4, image: { url: "i1" }, audio: { url: "a1", seconds: 4 } },
    ], "voice");
    const before = await writes(p.id);

    await pipeline.runVideoPipeline(p.id, OWNER, {
      clip: async () => ({ url: "v", seconds: 4, truncated: false }),
    });

    // 컷 2개 × 클립 저장 1번 + 마지막 status 저장 1번 = 3. 심장박동은 그 3번에 얹히므로
    // 표식이 붙기 전과 같은 수다 — 4가 되면 어딘가에서 저장을 새로 하고 있다는 뜻이다.
    expect((await writes(p.id)) - before).toBe(3);
    expect((await projects.getProject(p.id, OWNER)).progress.phase).toBe("video");
  });
});
