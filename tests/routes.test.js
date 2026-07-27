import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// 라우트가 정적으로 물고 있는 저장소와 같은 인스턴스를 쓴다(데이터 디렉터리는 호출 시점 env를 읽는다)
import { createProject, getProject, updateProject } from "../lib/projects.js";

const pipelineMock = vi.hoisted(() => ({ run: vi.fn(async () => {}) }));
vi.mock("../lib/pipeline.js", () => ({ runCutsPipeline: (...a) => pipelineMock.run(...a) }));

const llmMock = vi.hoisted(() => ({ callJson: vi.fn() }));
vi.mock("../lib/llm.js", () => ({ callJson: (...a) => llmMock.callJson(...a) }));

const { POST: cutsPOST } = await import("../app/api/projects/[id]/cuts/route.js");
const { PATCH } = await import("../app/api/projects/[id]/route.js");
const { POST: briefingPOST } = await import("../app/api/projects/[id]/briefing/route.js");
const { POST: scriptPOST } = await import("../app/api/projects/[id]/script/route.js");
const { POST: synopsisPOST } = await import("../app/api/projects/[id]/synopsis/route.js");

const ctx = (id) => ({ params: Promise.resolve({ id }) });
const patchReq = (body) => ({ json: async () => body });

beforeEach(async () => {
  process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-"));
  pipelineMock.run.mockReset().mockResolvedValue(undefined);
  llmMock.callJson.mockReset();
});

const SYN = {
  angle: "앵글",
  scenes: [{ role: "여는말", shows: "화면", says: "요지", seconds: 3, facts: [] }],
  version: 1,
  briefing_version: 2,
};

async function projectWithScript() {
  const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
  return updateProject(p.id, (proj) => ({
    ...proj,
    status: "script",
    briefing: { topic: "주제", key_points: ["ㄱ"], asked: [], confirmed: true, version: 2 },
    synopsis: SYN,
    script: { paragraphs: [{ text: "안녕" }], version: 1, synopsis_version: 1 },
  }));
}

async function projectWithBriefing() {
  const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
  return updateProject(p.id, (proj) => ({
    ...proj,
    briefing: { topic: "주제", key_points: ["ㄱ"], asked: [], confirmed: true, version: 2 },
  }));
}

async function projectWith2Scenes() {
  const p = await projectWithScript();
  return updateProject(p.id, (proj) => ({
    ...proj,
    synopsis: { ...SYN, scenes: [SYN.scenes[0], { role: "가격", shows: "가격표", says: "6500원", seconds: 3, facts: [] }] },
  }));
}

describe("POST /api/projects/[id]/cuts", () => {
  it("파이프라인보다 먼저 status:cuts·빈 cuts를 세운다(응답 시점에 ④가 열려 있다)", async () => {
    const p = await projectWithScript();
    let started = false;
    pipelineMock.run.mockImplementation(() => { started = true; return new Promise(() => {}); }); // 안 끝나는 파이프라인
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    const after = await getProject(p.id);
    expect(after.status).toBe("cuts");
    expect(after.cuts).toEqual([]);
    expect(after.cuts_error).toBeNull();
    expect(started).toBe(true);
  });

  it("컷 분할이 실패하면 cuts_error를 남긴다(화면이 5분을 기다리지 않게)", async () => {
    const p = await projectWithScript();
    pipelineMock.run.mockRejectedValue(new Error("컷 분할 실패"));
    await cutsPOST(patchReq({}), ctx(p.id));
    await new Promise((r) => setTimeout(r, 20));
    expect((await getProject(p.id)).cuts_error).toBe("컷 분할 실패");
  });

  it("이미 컷이 있으면 409로 막고 만든 컷을 지우지 않는다(재승인이 유료 컷을 날리지 않게)", async () => {
    const p = await projectWithScript();
    const cuts = [
      { idx: 0, sentence: "컷1", state: "done", image: { url: "/a.png" } },
      { idx: 1, sentence: "컷2", state: "generating" },
    ];
    await updateProject(p.id, (proj) => ({ ...proj, status: "cuts", cuts, cuts_error: null }));

    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(409);
    const after = await getProject(p.id);
    expect(after.cuts).toEqual(cuts); // 그대로
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("컷이 비어 있으면(분할 실패 뒤 다시 시도) 다시 띄운다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({ ...proj, status: "cuts", cuts: [], cuts_error: "컷 분할 실패" }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalledTimes(1);
    expect((await getProject(p.id)).cuts_error).toBeNull();
  });

  it("보낸 화면 비율을 settings에 저장한다", async () => {
    const p = await projectWithScript();
    pipelineMock.run.mockImplementation(() => new Promise(() => {}));
    await cutsPOST(patchReq({ aspect_ratio: "1:1" }), ctx(p.id));
    expect((await getProject(p.id)).settings.aspect_ratio).toBe("1:1");
  });

  it("잘못된 비율은 무시하고 기본 9:16으로 저장한다", async () => {
    const p = await projectWithScript();
    pipelineMock.run.mockImplementation(() => new Promise(() => {}));
    await cutsPOST(patchReq({ aspect_ratio: "999" }), ctx(p.id));
    expect((await getProject(p.id)).settings.aspect_ratio).toBe("9:16");
  });

  it("대본 문단 수와 장면 수가 다르면 상태를 건드리지 않고 400", async () => {
    const p = await projectWith2Scenes(); // 장면 2 · 대본 문단 1
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("대본을 다시 써");
    expect((await getProject(p.id)).status).toBe("script");
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("대본이 없으면 상태를 건드리지 않고 400", async () => {
    const p = await createProject({ settings: {}, material: { text: "", photos: [] } });
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id)).status).toBe("draft");
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/projects/[id] — 브리핑 버전은 내용 변경에 묶인다", () => {
  it("확정만 다시 눌러도 버전은 그대로다(거짓 stale 안내 방지)", async () => {
    const p = await projectWithScript();
    const r1 = await (await PATCH(patchReq({ briefing: { confirmed: true } }), ctx(p.id))).json();
    expect(r1.briefing.version).toBe(2);
    const r2 = await (await PATCH(patchReq({ briefing: { confirmed: true } }), ctx(p.id))).json();
    expect(r2.briefing.version).toBe(2);
  });

  it("내용을 고쳐 저장하면 버전이 오른다", async () => {
    const p = await projectWithScript();
    const r = await (await PATCH(patchReq({ briefing: { topic: "바뀐 주제" } }), ctx(p.id))).json();
    expect(r.briefing.version).toBe(3);
    expect(r.briefing.topic).toBe("바뀐 주제");
  });

  it("같은 값으로 다시 저장하면 버전은 그대로다", async () => {
    const p = await projectWithScript();
    const r = await (await PATCH(patchReq({ briefing: { topic: "주제", key_points: ["ㄱ"] } }), ctx(p.id))).json();
    expect(r.briefing.version).toBe(2);
  });

  it("질문에 답하면 내용이 바뀐 것으로 본다(답변은 대본 프롬프트에 들어간다)", async () => {
    const p = await projectWithScript();
    const asked = [{ question: "언제?", options: [], answer: "어제", done: true }];
    const r = await (await PATCH(patchReq({ briefing: { asked } }), ctx(p.id))).json();
    expect(r.briefing.version).toBe(3);
  });
});

describe("PATCH synopsis_scene", () => {
  it("장면의 shows·says를 고친다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 0, shows: "고친화면", says: "고친요지" } }), ctx(p.id));
    const s = (await getProject(p.id)).synopsis.scenes[0];
    expect(s.shows).toBe("고친화면");
    expect(s.says).toBe("고친요지");
    expect(s.role).toBe("여는말"); // 나머지 필드는 건드리지 않는다
  });

  it("직접 편집은 version을 올리지 않는다 — 사장님이 고친 것이 stale 경고를 띄우면 안 된다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 0, shows: "고친화면" } }), ctx(p.id));
    const after = (await getProject(p.id)).synopsis;
    expect(after.scenes[0].shows).toBe("고친화면"); // 편집이 실제로 먹었는지 — 기능이 없어도 version은 1이다
    expect(after.version).toBe(1);
  });

  it("범위 밖 idx는 아무것도 바꾸지 않는다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 9, shows: "엉뚱" } }), ctx(p.id));
    expect((await getProject(p.id)).synopsis.scenes[0].shows).toBe("화면");
  });

  it("빈 문자열 shows는 무시한다 — 비어있지 않은 문자열 불변식을 깨지 않는다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 0, shows: "" } }), ctx(p.id));
    expect((await getProject(p.id)).synopsis.scenes[0].shows).toBe("화면");
  });

  it("공백뿐인 says는 무시한다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 0, says: "   " } }), ctx(p.id));
    expect((await getProject(p.id)).synopsis.scenes[0].says).toBe("요지");
  });

  it("비문자열 shows는 무시한다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 0, shows: 123 } }), ctx(p.id));
    expect((await getProject(p.id)).synopsis.scenes[0].shows).toBe("화면");
  });

  it("says만 보내면 shows는 그대로다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 0, says: "고친요지" } }), ctx(p.id));
    const s = (await getProject(p.id)).synopsis.scenes[0];
    expect(s.shows).toBe("화면");
    expect(s.says).toBe("고친요지");
  });
});

describe("POST /api/projects/[id]/briefing — 재추출", () => {
  it("이미 진행된 프로젝트의 status·confirmed를 되감지 않는다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({ ...proj, status: "cuts", cuts: [{ idx: 0, sentence: "컷", state: "done" }] }));
    llmMock.callJson.mockResolvedValue({ topic: "새 주제", key_points: ["새 내용"], questions: [] });

    const res = await briefingPOST({}, ctx(p.id));
    expect(res.status).toBe(200);
    const after = await getProject(p.id);
    expect(after.status).toBe("cuts"); // 되감기면 만든 이미지가 잠긴다
    expect(after.briefing.confirmed).toBe(true);
    expect(after.briefing.topic).toBe("새 주제");
    expect(after.briefing.version).toBe(3); // 내용이 바뀌었으므로 오른다 — 대본 화면이 stale을 알아채게
  });

  it("내용이 그대로면 재추출해도 버전은 오르지 않는다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue({ topic: "주제", key_points: ["ㄱ"], questions: [] });
    await briefingPOST({}, ctx(p.id));
    expect((await getProject(p.id)).briefing.version).toBe(2);
  });

  it("답 없는 질문만 갈려도 버전은 오르지 않는다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue({
      topic: "주제", key_points: ["ㄱ"],
      questions: [{ question: "언제 찍었나요?", options: ["어제"] }],
    });
    await briefingPOST({}, ctx(p.id));
    const after = await getProject(p.id);
    expect(after.briefing.asked.length).toBe(1);
    expect(after.briefing.version).toBe(2);
  });

  it("아직 draft면 briefing 단계로 올린다", async () => {
    const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
    llmMock.callJson.mockResolvedValue({ topic: "주제", key_points: ["ㄱ"], questions: [] });
    await briefingPOST({}, ctx(p.id));
    const after = await getProject(p.id);
    expect(after.status).toBe("briefing");
    expect(after.briefing.confirmed).toBe(false);
    expect(after.briefing.version).toBe(1);
  });

  it("호출이 예외로 죽어도 원시 에러를 흘리지 않고 한국어 502를 준다", async () => {
    const p = await projectWithScript();
    const raw = 'LLM 호출 실패 (429) {"error":{"message":"You exceeded your current quota"}}';
    llmMock.callJson.mockRejectedValue(new Error(raw));
    const res = await briefingPOST({}, ctx(p.id));
    expect(res.status).toBe(502);
    const body = await res.json();
    // lib/llm.js가 응답 본문을 메시지에 담으므로 e.message를 그대로 돌려주면 벤더 에러가 사장님 화면에 뜬다
    expect(body.error).toBe("자료를 정리하지 못했어요. 직접 채우거나 다시 시도해 주세요.");
    expect(JSON.stringify(body)).not.toContain(raw);
    // 일시적 오류 하나가 요청 전체를 날리지 않게 — 예외도 재시도한다(상한 2회)
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/projects/[id]/synopsis — 장면 예산", () => {
  const scene = (says) => ({ role: "여는말", shows: "화면", says, seconds: 3, facts: [] });

  it("자료가 가진 사실보다 장면이 많으면 한 번 줄여 오라고 되돌린다", async () => {
    const p = await projectWithBriefing(); // 핵심 내용 1개 → 예산 2장면
    const 넘침 = { angle: "앵글", scenes: [scene("ㄱ"), scene("ㄴ"), scene("ㄷ"), scene("ㄹ")] };
    const 맞음 = { angle: "앵글", scenes: [scene("ㄱ"), scene("ㄴ")] };
    llmMock.callJson.mockResolvedValueOnce(넘침).mockResolvedValueOnce(맞음);
    await synopsisPOST(patchReq({}), ctx(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
    // 되돌릴 때는 몇 개를 냈고 몇 개까지인지 알려줘야 같은 개수로 돌아오지 않는다
    expect(llmMock.callJson.mock.calls[1][0].messages[0].content).toContain("2개 이하로 줄여");
    expect((await getProject(p.id)).synopsis.scenes).toHaveLength(2);
  });

  it("두 번째도 넘치면 그대로 안고 간다 — 구성을 아예 못 주는 것보다 낫다", async () => {
    const p = await projectWithBriefing();
    const 넘침 = { angle: "앵글", scenes: [scene("ㄱ"), scene("ㄴ"), scene("ㄷ")] };
    llmMock.callJson.mockResolvedValue(넘침);
    const res = await synopsisPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id)).synopsis.scenes).toHaveLength(3);
  });

  it("예산 안에 들면 되돌리지 않는다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValue({ angle: "앵글", scenes: [scene("ㄱ"), scene("ㄴ")] });
    await synopsisPOST(patchReq({}), ctx(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/projects/[id]/script (초안→교정)", () => {
  const cliche = { paragraphs: [{ text: "특별한 라떼를 만나보세요" }] };
  const plain = { paragraphs: [{ text: "시럽을 쓰지 않습니다" }] };

  it("초안→교정을 거쳐 교정본을 저장한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValueOnce(plain);
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs[0].text).toBe("시럽을 쓰지 않습니다");
  });

  it("교정이 실패하면 초안으로 폴백한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValue({}); // 교정 스키마 불일치
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs[0].text).toBe("특별한 라떼를 만나보세요");
  });

  it("교정본이 문단을 흘리면(스키마는 맞아도) 초안으로 폴백한다", async () => {
    const p = await projectWith2Scenes(); // 장면 2개 — 초안도 문단 2개다
    const draft2 = { paragraphs: [{ text: "특별한 라떼" }, { text: "6500원입니다" }] };
    const shortEdit = { paragraphs: [{ text: "라떼입니다" }] };
    llmMock.callJson.mockResolvedValueOnce(draft2).mockResolvedValueOnce(shortEdit).mockResolvedValue({});
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs).toHaveLength(2);
    expect(saved.paragraphs[1].text).toBe("6500원입니다");
  });

  // 판정은 여덟 자 이상인 '할 말'에만 걸린다(짧은 원본은 우연히 겹친다) — 실제 길이의 장면으로 세운다
  async function projectWithLongSays() {
    const p = await projectWithScript();
    return updateProject(p.id, (proj) => ({
      ...proj,
      synopsis: { ...SYN, scenes: [{ ...SYN.scenes[0], says: "시럽을 쓰지 않고 매일 아침 직접 간다" }] },
    }));
  }
  const 전사 = { paragraphs: [{ text: "시럽을 쓰지 않고 매일 아침 직접 갑니다." }] }; // 조사만 바꾼 복사
  const 다시쓴 = { paragraphs: [{ text: "아침마다 딸기를 갈아 그날 치만 만듭니다." }] };

  it("초안이 장면의 할 말을 전사하면 그 문단만 다시 쓰게 한 번 더 부른다", async () => {
    const p = await projectWithLongSays();
    llmMock.callJson
      .mockResolvedValueOnce(전사)      // 초안
      .mockResolvedValueOnce(다시쓴)    // 되돌리기
      .mockResolvedValueOnce(다시쓴);   // 교정
    await scriptPOST(patchReq({}), ctx(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(3); // 초안·되돌리기·교정
    expect((await getProject(p.id)).script.paragraphs[0].text).toBe("아침마다 딸기를 갈아 그날 치만 만듭니다.");
  });

  it("전사가 아니면 되돌리기를 부르지 않는다 — 멀쩡한 초안에 돈을 더 쓰지 않는다", async () => {
    const p = await projectWithLongSays();
    llmMock.callJson.mockResolvedValue(다시쓴);
    await scriptPOST(patchReq({}), ctx(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(2); // 초안·교정뿐
  });

  it("되돌리기가 실패해도 초안을 안고 간다", async () => {
    const p = await projectWithLongSays();
    llmMock.callJson
      .mockResolvedValueOnce(전사)
      .mockRejectedValueOnce(new Error("네트워크")) // 되돌리기 실패
      .mockResolvedValueOnce(전사);                 // 교정
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id)).script.paragraphs[0].text).toBe("시럽을 쓰지 않고 매일 아침 직접 갑니다.");
  });

  it("대본을 저장하면 장면의 초를 문장 길이에 맞추되 구성 버전은 올리지 않는다", async () => {
    const p = await projectWithScript(); // 장면 seconds 3, 구성 version 1
    const 긴문장 = { paragraphs: [{ text: "가".repeat(55) }] }; // 55자 → 10초
    llmMock.callJson.mockResolvedValue(긴문장);
    await scriptPOST(patchReq({}), ctx(p.id));
    const after = await getProject(p.id);
    expect(after.synopsis.scenes[0].seconds).toBe(10);
    // 버전이 오르면 대본 화면에 "구성이 바뀌었어요" 거짓 경고와 유료 재생성 버튼이 뜬다
    expect(after.synopsis.version).toBe(1);
    expect(after.script.synopsis_version).toBe(1);
  });

  it("초안 호출이 예외로 죽어도 원시 에러를 흘리지 않고 한국어 502를 준다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockRejectedValue(new Error("네트워크"));
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(502);
    // lib/llm.js가 응답 본문을 메시지에 담으므로 e.message를 그대로 돌려주면 내부 정보가 샌다
    expect((await res.json()).error).toBe("대본 생성에 실패했어요. 다시 시도해 주세요.");
    // 일시적 네트워크 오류 하나가 요청 전체를 날리지 않게 — 예외도 재시도한다(상한 2회)
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
    expect((await getProject(p.id)).script.version).toBe(1); // 기존 대본을 덮지 않는다
  });

  it("교정 호출이 예외로 죽으면 초안이 그대로 저장된다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockRejectedValue(new Error("네트워크"));
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id)).script.paragraphs[0].text).toBe("특별한 라떼를 만나보세요");
    // 초안 1회 + 교정 2회 — 교정 루프도 예외에 재시도한다(그래도 502가 아니라 초안 폴백)
    expect(llmMock.callJson).toHaveBeenCalledTimes(3);
  });
});

const synOut = (n = 1) => ({
  angle: "매일 맛이 다른 라떼",
  scenes: Array.from({ length: n }, (_, i) => ({
    role: `역할${i}`, shows: `화면${i}`, says: `요지${i}`, seconds: 3, facts: [],
  })),
});

describe("POST /api/projects/[id]/synopsis", () => {
  it("브리핑이 확정되지 않았으면 400", async () => {
    const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
    const res = await synopsisPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
  });

  it("없는 프로젝트면 404", async () => {
    const res = await synopsisPOST(patchReq({}), ctx("없는id"));
    expect(res.status).toBe(404);
    expect(llmMock.callJson).not.toHaveBeenCalled();
  });

  it("구성을 저장하고 version을 올린다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValueOnce(synOut(3));
    const res = await synopsisPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    const saved = (await getProject(p.id)).synopsis;
    expect(saved.scenes).toHaveLength(3);
    expect(saved.version).toBe(1);
    expect(saved.briefing_version).toBe(2);
    expect((await getProject(p.id)).status).toBe("synopsis"); // 뒤 단계 문턱이 이 값에 걸린다
  });

  it("다시 만들면 version이 오른다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValue(synOut(3));
    await synopsisPOST(patchReq({}), ctx(p.id));
    await synopsisPOST(patchReq({ instruction: "더 짧게" }), ctx(p.id));
    expect((await getProject(p.id)).synopsis.version).toBe(2);
  });

  it("두 번 다 스키마가 깨지면 502", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValue({ angle: "", scenes: [] });
    const res = await synopsisPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(502);
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
  });

  it("호출이 예외로 죽어도 재시도하고, 계속 죽으면 한국어 502를 준다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockRejectedValue(new Error("네트워크"));
    const res = await synopsisPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("구성 만들기에 실패했어요. 다시 시도해 주세요.");
    // 일시적 네트워크 오류 하나가 요청 전체를 날리지 않게 — 예외도 재시도한다(상한 2회)
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/projects/[id]/script — 구성 종속", () => {
  it("없는 프로젝트면 404", async () => {
    const res = await scriptPOST(patchReq({}), ctx("없는id"));
    expect(res.status).toBe(404);
    expect(llmMock.callJson).not.toHaveBeenCalled();
  });

  it("구성이 없으면 400", async () => {
    const p = await projectWithBriefing();
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect(llmMock.callJson).not.toHaveBeenCalled();
  });

  it("기획을 새로 짜지 않는다 — 초안·교정 두 번만 부른다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue({ paragraphs: [{ text: "문장" }] });
    await scriptPOST(patchReq({ instruction: "더 짧게" }), ctx(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
  });

  it("문단 수가 장면 수와 다르면 재시도하고, 계속 다르면 502", async () => {
    const p = await projectWithScript(); // 장면 1개
    llmMock.callJson.mockResolvedValue({ paragraphs: [{ text: "가" }, { text: "나" }] });
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(502);
    expect(llmMock.callJson).toHaveBeenCalledTimes(2); // 이름의 "재시도"가 실제로 일어났는지
  });

  it("synopsis_version을 붙여 저장한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue({ paragraphs: [{ text: "문장" }] });
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.synopsis_version).toBe(1);
    expect(saved.version).toBe(2);
  });
});
