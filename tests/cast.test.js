import { describe, it, expect } from "vitest";
import { buildCastMessages } from "../lib/cast.js";
import { AVATARS } from "../lib/refs.js";

const project = {
  briefing: { topic: "성수동 자전거 수리점 소개" },
  script: { text: "작년에 초등학생이 형에게 물려받은 자전거를 끌고 왔습니다. 그냥 교체해줬습니다." },
};

describe("buildCastMessages", () => {
  it("원고 전문과 아바타 목록을 넘긴다", () => {
    const { system, messages } = buildCastMessages(project, AVATARS);
    const user = messages[0].content;
    expect(user).toContain("초등학생이 형에게 물려받은");
    expect(user).toContain(AVATARS[0].id);
    expect(user).toContain(AVATARS[0].traits);
    expect(system).toContain("JSON");
  });

  it("아바타가 없으면 (없음) 이라고 적는다 — 없는 것을 고르라고 하면 안 된다", () => {
    const { messages } = buildCastMessages(project, []);
    expect(messages[0].content).toContain("(없음)");
  });

  it("주제를 안 밝힌 프로젝트도 견딘다", () => {
    const { messages } = buildCastMessages({ script: { text: "한 문장." } }, AVATARS);
    expect(messages[0].content).toContain("한 문장.");
  });
});
