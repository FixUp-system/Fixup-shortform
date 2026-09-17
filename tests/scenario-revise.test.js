// 시나리오 **수정** — 지금 시나리오를 싣고, 그 자리만 고치고, Opus 5 로 부른다(2026-09-17 사장님 지시).
//
// 🔍 고치기 전(코드 확인): 원클릭·단계별 둘 다 수정이 처음 만들기와 같은 호출이었고 **지금 시나리오가
//   프롬프트에 안 실렸다.** 단계별은 "나머지는 지금 시나리오 그대로 둔다"고 시켜 놓고 그 시나리오를
//   안 보여 줬다 — 모델은 매번 처음부터 새로 썼다.
import { describe, it, expect } from "vitest";
import { buildScenarioMessages as adMessages, generateScenario as adGenerate } from "../lib/ad/scenario.js";
import { buildScenarioMessages as reelMessages, generateScenario as reelGenerate } from "../lib/reel/scenario.js";
import { pickCurrentScenario, revisionLines, REVISION_STAGE } from "../lib/scenario-revise.js";
import { AD_SCENARIO_SCHEMA } from "../lib/ad/llm.js";

const AD_SETTINGS = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0",
};
const AD_CURRENT = {
  text: "A calm product shot of the serum on marble. A narrator says \"맑은 피부의 시작\".",
  angle: "고급스러운 제품 클로즈업",
  shots: [
    { beat: "제품 등장", line: "맑은 피부의 시작", seconds: 8 },
    { beat: "마무리", line: "", seconds: 7 },
  ],
  // 저장본에만 있는 우리 쪽 값 — 모델에게 가면 안 된다
  tries: 2, endpoint: "t2v", prev: { text: "옛 판" },
};
const content = (m) => m.messages[0].content;

describe("지금 시나리오 고르기", () => {
  it("★★ 스키마의 칸만 싣는다 — tries·prev 같은 우리 쪽 값은 빠진다", () => {
    const cur = pickCurrentScenario(AD_CURRENT, AD_SCENARIO_SCHEMA);
    expect(Object.keys(cur).sort()).toEqual(["angle", "shots", "text"]);
  });
  it("고칠 본문이 없으면 수정이 아니다", () => {
    expect(pickCurrentScenario({ tries: 1 }, AD_SCENARIO_SCHEMA)).toBeNull();
    expect(pickCurrentScenario(null, AD_SCENARIO_SCHEMA)).toBeNull();
    expect(revisionLines(null)).toEqual([]);
  });
});

describe("원클릭 — 고친 대로 다시 쓰기", () => {
  const edits = [{ n: 1, shot: { beat: "제품 등장", line: "촉촉한 피부의 시작", seconds: 8 } }];

  it("★★★ 고친 장면이 있으면 **지금 시나리오를 싣고** 수정으로 간다", () => {
    const m = adMessages({ settings: AD_SETTINGS, material: { text: "세럼 광고", photos: [] }, edits, scenario: AD_CURRENT });
    expect(m.revising).toBe(true);
    expect(content(m), "지금 시나리오가 안 실렸다 — 모델이 처음부터 새로 쓴다").toContain("맑은 피부의 시작");
    expect(content(m)).toContain("위 시나리오를 고치는 것");
    expect(content(m), "우리 쪽 값이 새어 나갔다").not.toContain("옛 판");
    expect(content(m), "'다시 써도 된다'가 남아 통째 재작성을 부른다").not.toContain("다시 써도 된다");
  });

  it("★★★ 요청 없는 [다시 쓰기]·처음 만들기는 예전 그대로다 — 지금 시나리오를 안 싣는다", () => {
    const again = adMessages({ settings: AD_SETTINGS, material: { text: "세럼 광고", photos: [] }, scenario: AD_CURRENT });
    const first = adMessages({ settings: AD_SETTINGS, material: { text: "세럼 광고", photos: [] } });
    expect(again.revising).toBe(false);
    expect(content(again)).toBe(content(first));
  });

  it("★★★ 수정은 **Opus 5** · 장부 단계는 「시나리오 수정」 / 새로 쓰기는 기본 모델(Fable 5)", async () => {
    const calls = [];
    const callJson = async (args) => { calls.push(args); return AD_CURRENT; };
    const project = { id: "p1", settings: AD_SETTINGS, material: { text: "세럼 광고", photos: [] }, scenario: AD_CURRENT };
    await adGenerate({ project, edits, deps: { callJson } });
    await adGenerate({ project, deps: { callJson } });
    expect(calls[0].model).toBe("claude-opus-5");
    expect(calls[0].stage).toBe(REVISION_STAGE);
    expect(calls[1].model, "새로 쓰기가 모델을 넘겼다 — Fable 5 가 아니게 된다").toBeUndefined();
    expect(calls[1].stage).toBe("광고 시나리오");
  });
});

describe("단계별 — 말로 한 수정 요청", () => {
  const REEL_SETTINGS = { ...AD_SETTINGS, concept: "auto" };
  const REEL_CURRENT = {
    text: "A bright morning routine with the serum.",
    shots: [{ beat: "아침", shows: "세럼 병", avatar_id: "", speaker: "", transition: "cut", camera: "close", lighting: "soft", action: "drop", sound: "birds", seconds: 15 }],
    narration: { text: "하루를 여는 한 방울" },
    tries: 3,
  };

  it("★★★ 요청이 있으면 **지금 시나리오를 싣고** 수정으로 간다", () => {
    const m = reelMessages({ settings: REEL_SETTINGS, material: { text: "세럼", photos: [] }, scenario: REEL_CURRENT }, { note: "대사를 더 짧게" });
    expect(m.revising).toBe(true);
    expect(content(m), "지금 시나리오가 안 실렸다").toContain("하루를 여는 한 방울");
    expect(content(m)).toContain("대사를 더 짧게");
  });

  it("★★ 요청 없는 [다시 쓰기]는 수정이 아니다", () => {
    const m = reelMessages({ settings: REEL_SETTINGS, material: { text: "세럼", photos: [] }, scenario: REEL_CURRENT }, {});
    expect(m.revising).toBe(false);
    expect(content(m)).not.toContain("하루를 여는 한 방울");
  });

  it("★★★ 수정은 **Opus 5** · 「시나리오 수정」 / 새로 쓰기는 모델을 안 넘긴다", async () => {
    const calls = [];
    const valid = { text: "t", shots: REEL_CURRENT.shots, narration: { text: "n" } };
    const callJson = async (args) => { calls.push(args); return valid; };
    const project = { id: "p2", settings: REEL_SETTINGS, material: { text: "세럼", photos: [] }, scenario: REEL_CURRENT };
    await reelGenerate({ project, note: "대사를 더 짧게", deps: { callJson } }).catch(() => {});
    await reelGenerate({ project, deps: { callJson } }).catch(() => {});
    expect(calls[0].model).toBe("claude-opus-5");
    expect(calls[0].stage).toBe(REVISION_STAGE);
    expect(calls[1].model).toBeUndefined();
    expect(calls[1].stage).toBe("광고 시나리오");
  });
});
