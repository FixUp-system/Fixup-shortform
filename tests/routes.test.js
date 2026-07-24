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
    const res = await cutsPOST({}, ctx(p.id));
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
    await cutsPOST({}, ctx(p.id));
    await new Promise((r) => setTimeout(r, 20));
    expect((await getProject(p.id)).cuts_error).toBe("컷 분할 실패");
  });

  it("대본이 없으면 상태를 건드리지 않고 400", async () => {
    const p = await createProject({ settings: {}, material: { text: "", photos: [] } });
    const res = await cutsPOST({}, ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id)).status).toBe("draft");
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/projects/[id] — 브리핑 확정 버전", () => {
  it("확정할 때마다 briefing.version이 오른다", async () => {
    const p = await projectWithScript();
    const r1 = await (await PATCH(patchReq({ briefing: { confirmed: true } }), ctx(p.id))).json();
    expect(r1.briefing.version).toBe(3);
    const r2 = await (await PATCH(patchReq({ briefing: { confirmed: true } }), ctx(p.id))).json();
    expect(r2.briefing.version).toBe(4);
  });

  it("확정이 아닌 편집 저장은 버전을 올리지 않는다", async () => {
    const p = await projectWithScript();
    const r = await (await PATCH(patchReq({ briefing: { topic: "바뀐 주제" } }), ctx(p.id))).json();
    expect(r.briefing.version).toBe(2);
    expect(r.briefing.topic).toBe("바뀐 주제");
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
    expect(after.briefing.version).toBe(2); // 버전은 확정할 때만 오른다
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
