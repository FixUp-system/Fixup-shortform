// 자동 관통(lib/auto.js)과 그 재료(추출 루프)의 계약 테스트.
// 스토어는 vitest.setup.js 가 SHOTFORM_STORE=memory 로 세운다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { extractBriefing } from "../lib/briefing-extract.js";
import { generateScript } from "../lib/script-gen.js";

// validateBriefing 스키마를 통과하는 최소 형태 — briefing.test.js 의 실물과 같은 키
const RAW_BRIEFING = {
  topic: "딸기라떼 신메뉴",
  key_points: ["국산 딸기 사용", "이번 주 출시"],
  questions: [],
};

describe("extractBriefing", () => {
  beforeEach(() => resetMemoryStore());

  it("LLM 응답이 검증을 통과하면 브리핑을 돌려준다", async () => {
    // 실물 프로젝트는 항상 photos 배열을 가진다(lib/projects.js 의 기본값) — 픽스처도 그에 맞춘다
    const project = { id: "p1", material: { text: "국산 딸기 딸기라떼 이번 주 출시", photos: [] } };
    const briefing = await extractBriefing(project, { llm: async () => RAW_BRIEFING });
    expect(briefing).toBeTruthy();
    expect(briefing.topic).toBe("딸기라떼 신메뉴");
  });

  it("첫 호출이 죽으면 한 번 더 부르고, 두 번째가 성공하면 그것을 쓴다", async () => {
    let calls = 0;
    const llm = async () => {
      calls += 1;
      if (calls === 1) throw new Error("일시 실패");
      return RAW_BRIEFING;
    };
    const project = { id: "p1", material: { text: "자료", photos: [] } };
    const briefing = await extractBriefing(project, { llm });
    expect(calls).toBe(2);
    expect(briefing).toBeTruthy();
  });

  it("두 번 다 실패하면 null — 던지지 않는다(응답 코드는 부르는 쪽의 일)", async () => {
    const llm = async () => { throw new Error("죽음"); };
    const briefing = await extractBriefing({ id: "p1", material: { text: "자료", photos: [] } }, { llm });
    expect(briefing).toBeNull();
  });
});

// validateScript 를 통과하는 최소 형태 — 검증기가 읽는 키는 `script` 다(lib/validate.js:7).
// 돌려주는 것은 { text } 이므로 픽스처(LLM 원응답)와 결과의 키가 다르다.
const RAW_SCRIPT = { script: "국산 딸기를 쓴 딸기라떼가 이번 주에 나옵니다. 매장에서 만나 보세요." };

const PROJECT = {
  id: "p1",
  // 실물 프로젝트는 항상 photos 배열을 가진다(lib/projects.js 의 기본값) — 픽스처도 그에 맞춘다
  material: { text: "국산 딸기 딸기라떼 이번 주 출시", photos: [] },
  briefing: { topic: "딸기라떼", key_points: ["국산 딸기"], confirmed: true, version: 1 },
  settings: { target_seconds: 15 },
};

describe("generateScript", () => {
  it("초안이 검증을 통과하면 대본을 돌려준다", async () => {
    const script = await generateScript(PROJECT, "p1", { llm: async () => RAW_SCRIPT });
    expect(script).toBeTruthy();
    expect(typeof script.text).toBe("string");
  });

  it("모든 시도가 실패하면 null", async () => {
    const script = await generateScript(PROJECT, "p1", {
      llm: async () => { throw new Error("죽음"); },
    });
    expect(script).toBeNull();
  });
});
