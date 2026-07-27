import { describe, it, expect } from "vitest";
import { buildCutsMessages, buildImagePrompt } from "../lib/cuts.js";

const project = {
  settings: { aspect_ratio: "9:16" },
  material: { text: "자료", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  briefing: { topic: "생딸기라떼" },
  synopsis: {
    angle: "매일 맛이 다른 라떼",
    scenes: [
      { role: "여는말", shows: "딸기 과육이 우유에 섞이는 클로즈업", says: "오늘 한 잔은 다르다", seconds: 3, facts: [] },
      { role: "마감", shows: "성수역 3번 출구에서 카페까지 걷는 시점 샷", says: "도보 2분", seconds: 4, facts: [] },
    ],
  },
  script: { paragraphs: [{ text: "요즘 이거 모르면 손해" }, { text: "성수역 3번 출구 2분입니다" }] },
};

describe("buildCutsMessages — 구성 주입", () => {
  it("장면의 보여줌이 지문에 들어간다", () => {
    const user = buildCutsMessages(project).messages[0].content;
    expect(user).toContain("딸기 과육이 우유에 섞이는 클로즈업");
    expect(user).toContain("성수역 3번 출구에서 카페까지 걷는 시점 샷");
  });

  it("문단이 장면 번호와 함께 붙는다", () => {
    const user = buildCutsMessages(project).messages[0].content;
    expect(user).toContain("장면 0");
    expect(user).toContain("요즘 이거 모르면 손해");
  });

  it("컷이 장면 경계를 넘지 말라고 지시하고 scene_idx를 요구한다", () => {
    const { system } = buildCutsMessages(project);
    expect(system).toContain("scene_idx");
    expect(system).toContain("장면 경계를 넘지 않는다");
  });

  it("사진 선택은 구성의 일이므로 컷 프롬프트는 사진을 다루지 않는다", () => {
    const { system, messages } = buildCutsMessages(project);
    expect(system).not.toContain("ref_photo_id");
    expect(messages[0].content).not.toContain("업로드 사진");
  });

  it("목표 길이 제약은 더 이상 주입하지 않는다", () => {
    const { system, messages } = buildCutsMessages(project);
    expect(messages[0].content).not.toContain("목표 길이");
    expect(system).not.toContain("±20%");
  });
});

describe("buildImagePrompt — 화면 근거", () => {
  it("나레이션 문장이 아니라 장면의 보여줌을 쓴다", () => {
    const cut = { idx: 0, scene_idx: 0, sentence: "요즘 이거 모르면 손해", seconds: 3 };
    const p = buildImagePrompt(cut, project);
    expect(p).toContain("딸기 과육이 우유에 섞이는 클로즈업");
    expect(p).not.toContain("요즘 이거 모르면 손해");
  });

  it("구성이 없는 옛 프로젝트는 문장으로 폴백한다", () => {
    const cut = { idx: 0, sentence: "옛 문장", seconds: 3 };
    const p = buildImagePrompt(cut, { ...project, synopsis: undefined });
    expect(p).toContain("옛 문장");
  });

  it("컷 비율·레퍼런스 지시가 반영된다", () => {
    const cut = { idx: 0, scene_idx: 0, sentence: "첫 모금에 과육이 씹히는", source: "ai", ref_photo_id: "p1" };
    const prompt = buildImagePrompt(cut, project);
    expect(prompt).toMatch(/vertical|9:16/);
    expect(prompt).toContain("reference");
  });

  it("사진 목록에 없는 ref는 레퍼런스 문장을 붙이지 않는다", () => {
    const cut = { idx: 0, scene_idx: 0, sentence: "첫 모금에 과육이 씹히는", source: "ai", ref_photo_id: "지워진사진" };
    const prompt = buildImagePrompt(cut, project);
    expect(prompt).not.toContain("reference");
  });

  it("브리핑 주제가 있으면 전 컷에 주제 앵커가 들어간다", () => {
    const withTopic = { ...project, briefing: { topic: "생딸기라떼 신메뉴" } };
    const cut = { idx: 0, scene_idx: 1, sentence: "한 잔 6,500원", source: "ai" }; // 제품이 문장에 없는 컷
    expect(buildImagePrompt(cut, withTopic)).toContain("생딸기라떼 신메뉴");
  });

  it("edit_instruction이 있으면 사용자 수정으로 강하게 반영된다", () => {
    const cut = { idx: 0, scene_idx: 0, sentence: "한 잔 6,500원", source: "ai", edit_instruction: "딸기라떼가 보이게, 컵을 더 작게" };
    const prompt = buildImagePrompt(cut, project);
    expect(prompt).toContain("딸기라떼가 보이게, 컵을 더 작게");
    expect(prompt).toMatch(/correction/i);
  });
});
