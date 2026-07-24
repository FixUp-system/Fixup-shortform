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

const ctx = (id) => ({ params: Promise.resolve({ id }) });
const patchReq = (body) => ({ json: async () => body });

beforeEach(async () => {
  process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-"));
  pipelineMock.run.mockReset().mockResolvedValue(undefined);
  llmMock.callJson.mockReset();
});

async function projectWithScript() {
  const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
  return updateProject(p.id, (proj) => ({
    ...proj,
    status: "script",
    briefing: { topic: "주제", key_points: ["ㄱ"], asked: [], confirmed: true, version: 2 },
    script: { paragraphs: [{ tag: "훅", text: "안녕" }], coverage: [], version: 1, briefing_version: 2 },
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
});

describe("POST /api/projects/[id]/script (2단 생성)", () => {
  const cliche = { paragraphs: [{ tag: "여는말", text: "특별한 라떼를 만나보세요" }], coverage: ["시럽 안 씀"] };
  const plain = { paragraphs: [{ tag: "여는말", text: "시럽을 쓰지 않습니다" }], coverage: ["시럽 안 씀"] };

  it("초안을 교정본으로 다듬어 저장한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValueOnce(plain);
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs[0].text).toBe("시럽을 쓰지 않습니다");
  });

  it("교정이 실패하면 초안으로 폴백한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValue({}); // 교정 응답이 스키마 불일치
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs[0].text).toBe("특별한 라떼를 만나보세요");
  });
});
