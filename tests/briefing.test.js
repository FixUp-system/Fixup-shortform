import { describe, it, expect } from "vitest";
import { buildBriefingMessages, mergeAsked, briefingContentChanged } from "../lib/briefing.js";

const project = {
  material: {
    text: "성수동 카페 미영 신메뉴 생딸기라떼. 시럽은 쓰지 않음.",
    photos: [{ id: "p1", filename: "라떼.jpg" }],
  },
};

describe("buildBriefingMessages", () => {
  it("자료 텍스트와 사진 파일명을 담는다", () => {
    const { system, messages } = buildBriefingMessages(project);
    expect(system).toContain("JSON");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("라떼.jpg");
  });

  it("사진이 없으면 없음으로 표기한다", () => {
    const { messages } = buildBriefingMessages({ material: { text: "자료", photos: [] } });
    expect(messages[0].content).toContain("(없음)");
  });

  it("질문 상한과 질문 기준을 지시한다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("3개");
    expect(system).toContain("정보가 있어야만");
  });

  it("자료에 이미 있는 것은 되묻지 말라고 지시한다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("key_points");
    expect(system).toContain("버린다");
    expect(system).toContain("빈 배열이 정답");
  });

  it("영상 성격을 단정하지 않는다 — 훅·홍보를 전제하는 표현이 없다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).not.toContain("훅");
    expect(system).not.toContain("홍보");
  });

  // 후보 목록을 주자 모델이 자료를 대조하는 대신 목록을 채웠다 — 자료에 답이 있는
  // "손님 반응"·"차별점"을 그대로 물었다. 이야기 소재는 대본을 써 본 뒤에 따로 청한다.
  it("이야기 소재는 여기서 묻지 않는다 — 자료에 없는 사실만 묻는다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("자료에 없는 사실'만 묻는다");
    expect(system).toContain("길이가 모자랄 때 따로 청한다");
    expect(system).not.toContain("훅");
    expect(system).not.toContain("홍보");
    expect(system).toContain("빈 배열이 정답"); // 풍부하면 여전히 빈 배열
  });

  // 라이브에서 "유약 색상은?"에 보기 3개가 전부 창작으로 붙었다. 무심코 첫 보기를 고르면
  // 없는 사실이 facts를 타고 화면까지 간다 — 확인해야 할 사실에는 보기를 주면 안 된다.
  it("사실 확인 질문에는 보기를 지어내지 않는다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("보기를 지어내지 않는다");
  });

  it("이미 되물은 이력이 있으면 다시 묻지 말라고 지시한다", () => {
    const withAsked = {
      ...project,
      briefing: { asked: [{ question: "가격대는요?", options: [], answer: "5천원대", done: true }] },
    };
    const { messages } = buildBriefingMessages(withAsked);
    const user = messages[0].content;
    expect(user).toContain("가격대는요?");
    expect(user).toContain("5천원대");
    expect(user).toContain("추가 질문 없이");
  });

  it("초점을 뽑으라고 지시한다 — 갈래를 먼저 고르게 한다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("focus");
    for (const mode of ["사람", "물건", "정보"]) {
      expect(system).toContain(mode);
    }
  });

  it("사람이 중심이 아닌 영상에 사람을 만들지 말라고 못 박는다", () => {
    // 칸이 있으면 모델이 채운다 — 정보 전달 영상에 억지 주인공이 생기는 것을 막는다
    expect(buildBriefingMessages(project).system).toContain("억지로");
  });
});

describe("mergeAsked", () => {
  const fresh = [
    { question: "새 질문1", options: ["가"], answer: null, done: false },
    { question: "새 질문2", options: [], answer: null, done: false },
  ];

  it("이전 목록이 없으면 새 목록을 쓴다", () => {
    expect(mergeAsked(undefined, fresh)).toEqual(fresh);
    expect(mergeAsked(null, fresh)).toEqual(fresh);
    expect(mergeAsked([], fresh)).toEqual(fresh);
  });

  it("이전 목록이 전부 미답이면 새 목록을 쓴다", () => {
    const prev = [{ question: "옛 질문", options: [], answer: null, done: false }];
    expect(mergeAsked(prev, fresh)).toEqual(fresh);
  });

  it("이전 목록에 답한 항목이 있으면 이전 목록을 그대로 쓴다", () => {
    const prev = [
      { question: "가격대는요?", options: [], answer: "5천원대", done: true },
      { question: "안 답한 것", options: [], answer: null, done: false },
    ];
    expect(mergeAsked(prev, fresh)).toEqual(prev);
  });

  it("done 없이 answer만 있는 항목도 답한 것으로 본다", () => {
    const prev = [{ question: "가격대는요?", options: [], answer: "5천원대" }];
    expect(mergeAsked(prev, fresh)).toEqual(prev);
  });

  it("건너뛴 항목(answer 없이 done)도 답한 것으로 본다", () => {
    const prev = [{ question: "가격대는요?", options: [], answer: null, done: true }];
    expect(mergeAsked(prev, fresh)).toEqual(prev);
  });

  it("빈 문자열·공백뿐인 answer는 답한 것으로 보지 않는다", () => {
    const prev = [
      { question: "가격대는요?", options: [], answer: "   ", done: false },
      { question: "또?", options: [], answer: "", done: false },
    ];
    expect(mergeAsked(prev, fresh)).toEqual(fresh);
  });
});

describe("연출 바람이 브리핑의 일부다", () => {
  it("지문이 direction 을 요구한다 — 자료에서 연출을 뽑아 둔다", () => {
    const { system } = buildBriefingMessages({
      material: { text: "로우 앵글로 역동적으로 찍어주세요", photos: [] },
    });
    expect(system).toContain('"direction"');
    // 사실과 갈라야 하는 이유가 지문에 있어야 한다 — 없으면 모델이 key_points 에 섞는다
    expect(system).toContain("낭독");
  });

  // 연출 바람을 고치면 화면이 달라진다. 버전이 안 오르면 화면 설계가 옛 것으로 남는다.
  it("연출 바람이 바뀌면 브리핑이 바뀐 것으로 본다", () => {
    const a = { topic: "ㄱ", key_points: ["ㄴ"], direction: "로우 앵글" };
    const b = { topic: "ㄱ", key_points: ["ㄴ"], direction: "하이 앵글" };
    expect(briefingContentChanged(a, b)).toBe(true);
    expect(briefingContentChanged(a, { ...a })).toBe(false);
  });
});

describe("연출은 어느 순간에 쓸 것인지와 함께 뽑는다", () => {
  // ★ 낱말만 뽑았더니 엉뚱한 컷에 배정됐다(2026-07-30 실측):
  //   "마찰 먼지"는 크로스오버로 멈추는 순간의 것인데 착지 컷에 갔고,
  //   "역광 실루엣"은 체공 슛의 것인데 거의 정지한 필러 컷에 소모됐다.
  //   그리고 "선수가 신발을 신고 움직인다"는 피사체 정보가 아예 빠져 6컷 중 1컷만 사람이 나왔다.
  it("지문이 연출 — 어느 순간 쌍을 요구한다", () => {
    const { system } = buildBriefingMessages({
      material: { text: "로우 앵글로 역동적으로", photos: [] },
    });
    expect(system).toContain("어느 순간");
    // 피사체를 함께 적으라고 해야 사람이 화면에 남는다
    expect(system).toMatch(/누가|피사체/);
  });

  it("줄바꿈으로 여러 쌍을 적게 한다 — 쉼표로만 이으면 쌍 경계가 사라진다", () => {
    const { system } = buildBriefingMessages({ material: { text: "자료", photos: [] } });
    expect(system).toMatch(/한 줄에 하나|줄바꿈/);
  });
});
