import { describe, it, expect } from "vitest";
import { validateScript, validateCuts, validateBriefing, validateSynopsis } from "../lib/validate.js";

describe("validateScript", () => {
  const ok = { paragraphs: [{ text: "첫 문장" }, { text: "둘째 문장" }] };

  it("장면 수와 문단 수가 같으면 통과한다", () => {
    const s = validateScript(ok, 2);
    expect(s.paragraphs).toHaveLength(2);
    expect(s.paragraphs[0]).toEqual({ text: "첫 문장" });
  });

  it("tag를 요구하지 않고, 있어도 버린다 — 역할은 장면이 갖는다", () => {
    const s = validateScript({ paragraphs: [{ tag: "훅", text: "문장" }] }, 1);
    expect(s.paragraphs[0]).toEqual({ text: "문장" });
  });

  it("coverage를 반환하지 않는다 — 사실 추적은 scene.facts가 한다", () => {
    const s = validateScript({ paragraphs: [{ text: "문장" }], coverage: ["ㄱ"] }, 1);
    expect(s.coverage).toBeUndefined();
  });

  it("문단 수가 장면 수와 다르면 null — 1:1 종속을 지키는 유일한 장치다", () => {
    expect(validateScript(ok, 3)).toBeNull();
    expect(validateScript(ok, 1)).toBeNull();
  });

  it("sceneCount를 안 주면 null — 조용히 검사를 건너뛰지 않는다", () => {
    expect(validateScript(ok)).toBeNull();
    expect(validateScript(ok, 0)).toBeNull();
  });

  it("빈 문장이 있으면 null", () => {
    expect(validateScript({ paragraphs: [{ text: "  " }] }, 1)).toBeNull();
  });

  it("paragraphs가 없으면 null", () => {
    expect(validateScript({}, 1)).toBeNull();
    expect(validateScript(null, 1)).toBeNull();
  });
});

describe("validateCuts", () => {
  const scenes = [
    { role: "여는말", shows: "클로즈업", says: "가", seconds: 3, facts: [], ref_photo_id: "p1" },
    { role: "마감", shows: "시점 샷", says: "나", seconds: 4, facts: [] },
  ];
  it("모든 컷을 ai로 만들고 idx를 재부여한다", () => {
    const cuts = validateCuts(
      { cuts: [
        { sentence: "문장1", seconds: 6, scene_idx: 0 },
        { sentence: "문장2", seconds: 8, scene_idx: 1 },
      ]},
      scenes
    );
    expect(cuts).toHaveLength(2);
    expect(cuts[0].idx).toBe(0);
    expect(cuts.every((c) => c.source === "ai")).toBe(true);
  });
  it("photo 소스로 와도 ai로 바꾸고 photo_id는 남기지 않는다", () => {
    const cuts = validateCuts({ cuts: [{ sentence: "s", seconds: 5, source: "photo", photo_id: "p2", scene_idx: 1 }] }, scenes);
    expect(cuts[0].source).toBe("ai");
    expect(cuts[0].photo_id).toBeUndefined();
  });
  it("장면에 ref_photo_id가 있으면 그 장면의 모든 컷이 물려받는다", () => {
    const cuts = validateCuts(
      { cuts: [
        { sentence: "s1", seconds: 5, scene_idx: 0 },
        { sentence: "s2", seconds: 5, scene_idx: 0 },
      ]},
      scenes
    );
    expect(cuts[0].ref_photo_id).toBe("p1");
    expect(cuts[1].ref_photo_id).toBe("p1");
  });
  it("장면에 ref_photo_id가 없으면 컷에도 없다 — LLM이 고른 값은 무시한다", () => {
    const cuts = validateCuts({ cuts: [{ sentence: "s", seconds: 5, scene_idx: 1, ref_photo_id: "p1" }] }, scenes);
    expect(cuts[0].ref_photo_id).toBeUndefined();
  });
  it("scene_idx가 범위 밖이면 null", () => {
    const obj = { cuts: [{ sentence: "가", seconds: 3, scene_idx: 5 }] };
    expect(validateCuts(obj, scenes)).toBeNull();
  });
  it("scene_idx가 없으면 null — 컷은 반드시 어느 장면의 것인지 밝힌다", () => {
    const obj = { cuts: [{ sentence: "가", seconds: 3 }] };
    expect(validateCuts(obj, scenes)).toBeNull();
  });
  it("scene_idx가 숫자가 아니면 null — 강제변환으로 장면 0에 붙지 않는다", () => {
    for (const bad of [null, "", [], true, "1"]) {
      const obj = { cuts: [{ sentence: "가", seconds: 3, scene_idx: bad }] };
      expect(validateCuts(obj, scenes)).toBeNull();
    }
  });
  it("scene_idx가 정수가 아닌 숫자여도 null", () => {
    const obj = { cuts: [{ sentence: "가", seconds: 3, scene_idx: 1.5 }] };
    expect(validateCuts(obj, scenes)).toBeNull();
  });
  it("scene_idx를 컷에 남긴다", () => {
    const obj = { cuts: [{ sentence: "가", seconds: 3, scene_idx: 1 }] };
    expect(validateCuts(obj, scenes)[0].scene_idx).toBe(1);
  });
  it("장면이 없으면 null — 컷은 구성 없이는 만들 수 없다", () => {
    const obj = { cuts: [{ sentence: "가", seconds: 3, scene_idx: 0 }] };
    expect(validateCuts(obj, [])).toBeNull();
    expect(validateCuts(obj, undefined)).toBeNull();
  });
});

describe("validateBriefing", () => {
  const ok = {
    topic: "생딸기라떼 신메뉴",
    key_points: ["매일 아침 직접 갈아", "시럽 안 씀"],
    audience: "동네 주민",
    takeaway: "매장에 와보고 싶어지기",
    questions: [{ question: "가격대는요?", options: ["5천원대", "6천원대"] }],
  };

  it("정상 응답을 정규화한다", () => {
    const b = validateBriefing(ok);
    expect(b.topic).toBe("생딸기라떼 신메뉴");
    expect(b.key_points).toEqual(["매일 아침 직접 갈아", "시럽 안 씀"]);
    expect(b.asked).toEqual([
      { question: "가격대는요?", options: ["5천원대", "6천원대"], answer: null, done: false },
    ]);
  });

  it("주제나 핵심내용이 비면 실패", () => {
    expect(validateBriefing({ ...ok, topic: "  " })).toBeNull();
    expect(validateBriefing({ ...ok, key_points: [] })).toBeNull();
    expect(validateBriefing({ ...ok, key_points: "문자열" })).toBeNull();
    expect(validateBriefing(null)).toBeNull();
  });

  it("선택 항목이 없으면 빈 문자열", () => {
    const b = validateBriefing({ topic: "주제", key_points: ["가"] });
    expect(b.audience).toBe("");
    expect(b.takeaway).toBe("");
    expect(b.asked).toEqual([]);
  });

  it("질문은 3개까지, 보기는 4개까지", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      question: `질문${i}`,
      options: ["가", "나", "다", "라", "마"],
    }));
    const b = validateBriefing({ ...ok, questions: many });
    expect(b.asked).toHaveLength(3);
    expect(b.asked[0].options).toHaveLength(4);
  });

  it("망가진 질문은 조용히 버린다", () => {
    const b = validateBriefing({ ...ok, questions: [{ question: "" }, { question: "정상?" }] });
    expect(b.asked).toHaveLength(1);
    expect(b.asked[0].question).toBe("정상?");
    expect(b.asked[0].options).toEqual([]);
  });
});

describe("validateSynopsis", () => {
  const scene = () => ({
    role: "여는말",
    shows: "유리잔 속 딸기 과육이 우유와 섞이는 클로즈업",
    says: "오늘 이 한 잔은 어제와 맛이 다르다",
    seconds: 3,
    facts: ["논산 설향"],
  });
  const ok = (over = {}) => ({ angle: "매일 맛이 다른 라떼", scenes: [scene(), scene(), scene()], ...over });

  it("정상 응답을 통과시킨다", () => {
    const s = validateSynopsis(ok(), []);
    expect(s.angle).toBe("매일 맛이 다른 라떼");
    expect(s.scenes).toHaveLength(3);
    expect(s.scenes[0].shows).toContain("클로즈업");
    expect(s.scenes[0].seconds).toBe(3);
  });

  it("angle이 없으면 null", () => {
    expect(validateSynopsis({ scenes: [scene()] }, [])).toBeNull();
  });

  it("role이 없거나 공백이면 null", () => {
    const missing = ok();
    delete missing.scenes[1].role;
    expect(validateSynopsis(missing, [])).toBeNull();
    const blank = ok();
    blank.scenes[1].role = "   ";
    expect(validateSynopsis(blank, [])).toBeNull();
  });

  it("scenes가 배열이 아니면 null", () => {
    expect(validateSynopsis(ok({ scenes: "여는말" }), [])).toBeNull();
  });

  it("obj가 null이면 null", () => {
    expect(validateSynopsis(null, [])).toBeNull();
  });

  it("shows가 없으면 null — 화면 근거가 이 필드 하나뿐이다", () => {
    const bad = ok();
    delete bad.scenes[1].shows;
    expect(validateSynopsis(bad, [])).toBeNull();
  });

  it("says가 없으면 null", () => {
    const bad = ok();
    bad.scenes[1].says = "   ";
    expect(validateSynopsis(bad, [])).toBeNull();
  });

  it("seconds가 범위 밖이면 null", () => {
    expect(validateSynopsis(ok({ scenes: [{ ...scene(), seconds: 1 }] }), [])).toBeNull();
    expect(validateSynopsis(ok({ scenes: [{ ...scene(), seconds: 16 }] }), [])).toBeNull();
    expect(validateSynopsis(ok({ scenes: [{ ...scene(), seconds: "셋" }] }), [])).toBeNull();
  });

  it("장면이 없거나 8개를 넘으면 null", () => {
    expect(validateSynopsis(ok({ scenes: [] }), [])).toBeNull();
    expect(validateSynopsis(ok({ scenes: Array.from({ length: 9 }, scene) }), [])).toBeNull();
  });

  it("장면이 2개여도 통과한다 — 하한은 프롬프트가 지시하고 검증기는 막지 않는다", () => {
    expect(validateSynopsis(ok({ scenes: [scene(), scene()] }), [])).not.toBeNull();
  });

  it("없는 ref_photo_id는 조용히 제거한다", () => {
    const s = validateSynopsis(ok({ scenes: [{ ...scene(), ref_photo_id: "없는id" }] }), ["p1"]);
    expect(s.scenes[0].ref_photo_id).toBeUndefined();
  });

  it("있는 ref_photo_id는 남긴다", () => {
    const s = validateSynopsis(ok({ scenes: [{ ...scene(), ref_photo_id: "p1" }] }), ["p1"]);
    expect(s.scenes[0].ref_photo_id).toBe("p1");
  });

  it("facts가 없으면 빈 배열로 채운다", () => {
    const s = validateSynopsis(ok({ scenes: [{ ...scene(), facts: undefined }] }), []);
    expect(s.scenes[0].facts).toEqual([]);
  });
});
