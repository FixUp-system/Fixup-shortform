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

const SCRIPT_TEXT = "매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다.";

async function projectWithScript() {
  const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
  return updateProject(p.id, (proj) => ({
    ...proj,
    status: "script",
    briefing: { topic: "주제", key_points: ["ㄱ"], asked: [], confirmed: true, version: 2 },
    script: { text: SCRIPT_TEXT, version: 1, briefing_version: 2 },
  }));
}

async function projectWithBriefing() {
  const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
  return updateProject(p.id, (proj) => ({
    ...proj,
    briefing: { topic: "주제", key_points: ["ㄱ"], asked: [], confirmed: true, version: 2 },
  }));
}

describe("POST /api/projects/[id]/cuts", () => {
  it("파이프라인보다 먼저 status:cuts·빈 cuts를 세운다(응답 시점에 이미지 단계가 열려 있다)", async () => {
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

  it("어느 원고에서 나온 컷인지 기록한다 — 원고를 다시 쓰면 컷이 낡는다", async () => {
    const p = await projectWithScript();
    await cutsPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id)).cuts_script_version).toBe(1);
  });

  it("컷 분할이 실패하면 cuts_error를 남긴다(화면이 5분을 기다리지 않게)", async () => {
    const p = await projectWithScript();
    pipelineMock.run.mockRejectedValue(new Error("컷 분할 실패"));
    await cutsPOST(patchReq({}), ctx(p.id));
    await new Promise((r) => setTimeout(r, 10));
    expect((await getProject(p.id)).cuts_error).toBe("컷 분할 실패");
  });

  it("이미 컷이 있으면 409로 막고 만든 컷을 지우지 않는다(재승인이 유료 컷을 날리지 않게)", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj,
      status: "cuts",
      cuts: [{ idx: 0, sentence: "이미 만든 컷", state: "done", image: { url: "http://img/1" } }],
    }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(409);
    const after = await getProject(p.id);
    expect(after.cuts).toHaveLength(1);
    expect(after.cuts[0].image.url).toBe("http://img/1");
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("컷이 비어 있으면(분할 실패 뒤 다시 시도) 다시 띄운다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({ ...proj, status: "cuts", cuts: [] }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalled();
  });

  it("보낸 화면 비율을 settings에 저장하고, 잘못된 값은 기본 9:16으로 둔다", async () => {
    const p = await projectWithScript();
    await cutsPOST(patchReq({ aspect_ratio: "1:1" }), ctx(p.id));
    expect((await getProject(p.id)).settings.aspect_ratio).toBe("1:1");

    const q = await projectWithScript();
    await cutsPOST(patchReq({ aspect_ratio: "4:5" }), ctx(q.id));
    expect((await getProject(q.id)).settings.aspect_ratio).toBe("9:16");
  });

  it("원고가 없으면 상태를 건드리지 않고 400", async () => {
    const p = await projectWithBriefing();
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id)).status).not.toBe("cuts");
  });

  it("구성 시절 대본(문단만 있는)도 400 — 원고를 다시 써야 자를 수 있다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({ ...proj, script: { paragraphs: [{ text: "옛 문단" }], version: 1 } }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/projects/[id] — 브리핑 버전은 내용 변경에 묶인다", () => {
  it("확정만 다시 눌러도 버전은 그대로다(거짓 stale 안내 방지)", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ briefing: { confirmed: true } }), ctx(p.id));
    expect((await getProject(p.id)).briefing.version).toBe(2);
  });

  it("내용을 고쳐 저장하면 버전이 오른다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ briefing: { topic: "새 주제" } }), ctx(p.id));
    expect((await getProject(p.id)).briefing.version).toBe(3);
  });

  it("질문에 답하면 내용이 바뀐 것으로 본다(답변은 대본 프롬프트에 들어간다)", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ briefing: { asked: [{ question: "가격은?", answer: "5천원", done: true }] } }), ctx(p.id));
    expect((await getProject(p.id)).briefing.version).toBe(3);
  });
});

describe("PATCH script_text — 원고 손편집", () => {
  it("원고를 고쳐 저장한다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ script_text: "손으로 고친 원고입니다." }), ctx(p.id));
    expect((await getProject(p.id)).script.text).toBe("손으로 고친 원고입니다.");
  });

  it("손편집은 version을 올리지 않는다 — 고친 것이 컷 낡음 경고를 띄우면 안 된다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ script_text: "손으로 고친 원고입니다." }), ctx(p.id));
    expect((await getProject(p.id)).script.version).toBe(1);
  });

  it("빈 문자열·공백·비문자열은 무시한다 — 원고를 실수로 지우지 않는다", async () => {
    const p = await projectWithScript();
    for (const bad of ["", "   ", 123, null]) {
      await PATCH(patchReq({ script_text: bad }), ctx(p.id));
      expect((await getProject(p.id)).script.text).toBe(SCRIPT_TEXT);
    }
  });

  it("원고가 아직 없으면 만들지 않는다", async () => {
    const p = await projectWithBriefing();
    await PATCH(patchReq({ script_text: "없던 원고" }), ctx(p.id));
    expect((await getProject(p.id)).script).toBeFalsy();
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
    expect(after.briefing.version).toBe(3); // 내용이 바뀌었으므로 오른다
  });

  it("내용이 그대로면 재추출해도 버전은 오르지 않는다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue({ topic: "주제", key_points: ["ㄱ"], questions: [] });
    await briefingPOST({}, ctx(p.id));
    expect((await getProject(p.id)).briefing.version).toBe(2);
  });

  it("kind:develop이면 브리핑을 다시 뽑지 않고 질문만 덧붙인다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj,
      settings: { ...proj.settings, target_seconds: 30 },
      briefing: { ...proj.briefing, asked: [{ question: "가격은?", answer: "5천원", done: true }] },
    }));
    llmMock.callJson.mockResolvedValue({ questions: [{ question: "왜 시작하셨어요?" }] });

    const res = await briefingPOST(patchReq({ kind: "develop" }), ctx(p.id));
    expect(res.status).toBe(200);
    const after = await getProject(p.id);
    expect(after.briefing.topic).toBe("주제");            // 정리된 내용을 다시 뽑지 않는다
    expect(after.briefing.asked).toHaveLength(2);          // 이미 받은 답을 지우지 않는다
    expect(after.briefing.asked[0].answer).toBe("5천원");
    expect(after.briefing.asked[1]).toMatchObject({ question: "왜 시작하셨어요?", kind: "develop", options: [] });
  });

  it("호출이 예외로 죽어도 원시 에러를 흘리지 않고 한국어 502를 준다", async () => {
    const p = await projectWithScript();
    const raw = 'LLM 호출 실패 (429) {"error":{"message":"You exceeded your current quota"}}';
    llmMock.callJson.mockRejectedValue(new Error(raw));
    const res = await briefingPOST({}, ctx(p.id));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("자료를 정리하지 못했어요. 직접 채우거나 다시 시도해 주세요.");
    expect(JSON.stringify(body)).not.toContain(raw);
    expect(llmMock.callJson).toHaveBeenCalledTimes(2); // 예외도 재시도한다
  });
});

describe("POST /api/projects/[id]/script — 원고", () => {
  // 목표 분량(사실 1개 → 60자) 안에 드는 길이로 둔다 — 짧으면 '분량 미달' 되돌리기가 끼어들어
  // 호출 순서가 밀린다(그 동작 자체는 아래 되돌리기 테스트에서 따로 본다)
  const cliche = { script: "특별한 라떼를 만나보세요. 지금 바로 오시면 매일 아침 직접 갈아 만든 생딸기를 경험해보세요. 오늘도 신선하게 준비했습니다." };
  const plain = { script: "시럽을 쓰지 않습니다. 매일 아침 딸기를 직접 갈아서 그날 쓸 만큼만 만듭니다. 하루 40잔이면 끝납니다. 오후 세 시면 대개 떨어집니다." };

  it("없는 프로젝트면 404", async () => {
    const res = await scriptPOST(patchReq({}), ctx("없는id"));
    expect(res.status).toBe(404);
  });

  it("브리핑이 확정되지 않았으면 400", async () => {
    const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
  });

  it("구성이 없어도 쓴다 — 원고가 곧 설계다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValue(plain);
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id)).script.text).toBe(plain.script);
  });

  it("초안→교정을 거쳐 교정본을 저장한다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValueOnce(plain);
    await scriptPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id)).script.text).toBe(plain.script);
    expect(llmMock.callJson).toHaveBeenCalledTimes(2); // 멀쩡한 초안에 되돌리기를 부르지 않는다
  });

  it("교정이 실패하면 초안으로 폴백한다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValue({}); // 교정 스키마 불일치
    await scriptPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id)).script.text).toBe(cliche.script);
  });

  it("교정본이 분량을 불려 놓으면 초안을 지킨다", async () => {
    const p = await projectWithBriefing();                    // 목표 60자
    const fit = { script: "가".repeat(70) };                  // 목표 안
    const bloated = { script: "나".repeat(140) };             // 교정이 두 배로 불림
    llmMock.callJson.mockResolvedValueOnce(fit).mockResolvedValue(bloated);
    await scriptPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id)).script.text).toBe(fit.script);
  });

  it("교정본이 분량을 흘리면 초안으로 폴백한다", async () => {
    const p = await projectWithBriefing();
    const long = { script: "가".repeat(70) };   // 목표 분량 안 — 되돌리기가 끼어들지 않는다
    const gutted = { script: "나".repeat(20) }; // 초안의 80% 미만
    llmMock.callJson.mockResolvedValueOnce(long).mockResolvedValue(gutted);
    await scriptPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id)).script.text).toBe(long.script);
  });

  it("되풀이가 있으면 한 번 다시 쓰게 부르고, 나아지면 받는다", async () => {
    const p = await projectWithBriefing();
    const 되풀이 = { script: "손님들이 운동화를 맡기기 위해 세탁소를 방문합니다. 최근 들어 많은 손님들이 운동화를 맡기고 있습니다." };
    // 고쳐 온 원고는 목표 분량(60자) 안에 들어와야 한다 — 짧으면 '분량 미달'로 또 돌아간다
    const 고침 = { script: "손님들이 운동화를 맡기러 옵니다. 흰 운동화는 하루면 다 마릅니다. 굽이 닳은 신발은 이틀 걸립니다. 밑창은 직접 손으로 솔질합니다." };
    llmMock.callJson
      .mockResolvedValueOnce(되풀이)   // 초안
      .mockResolvedValueOnce(고침)     // 되돌리기
      .mockResolvedValueOnce(고침);    // 교정
    await scriptPOST(patchReq({}), ctx(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(3);
    expect((await getProject(p.id)).script.text).toBe(고침.script);
  });

  it("되돌리기가 실패해도 초안을 안고 간다", async () => {
    const p = await projectWithBriefing();
    const 되풀이 = { script: "손님들이 운동화를 맡기기 위해 세탁소를 방문합니다. 최근 들어 많은 손님들이 운동화를 맡기고 있습니다." };
    llmMock.callJson
      .mockResolvedValueOnce(되풀이)
      .mockRejectedValueOnce(new Error("네트워크"))
      .mockResolvedValueOnce(되풀이);
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id)).script.text).toBe(되풀이.script);
  });

  it("version을 올리고 브리핑 버전을 붙여 저장한다", async () => {
    const p = await projectWithScript(); // 이미 version 1
    llmMock.callJson.mockResolvedValue(plain);
    await scriptPOST(patchReq({}), ctx(p.id));
    const after = await getProject(p.id);
    expect(after.script.version).toBe(2);
    expect(after.script.briefing_version).toBe(2);
    expect(after.status).toBe("script");
  });

  it("초안 호출이 예외로 죽어도 원시 에러를 흘리지 않고 한국어 502를 준다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockRejectedValue(new Error("네트워크"));
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("대본 생성에 실패했어요. 다시 시도해 주세요.");
    expect(llmMock.callJson).toHaveBeenCalledTimes(2); // 예외도 재시도한다
    expect((await getProject(p.id)).script.text).toBe(SCRIPT_TEXT); // 기존 원고를 덮지 않는다
  });

  it("두 번 다 스키마가 깨지면 502", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValue({ paragraphs: [{ text: "옛 형식" }] });
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(502);
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
  });

  it("수정 지시가 있으면 기존 원고와 함께 프롬프트에 실린다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue(plain);
    await scriptPOST(patchReq({ instruction: "더 짧게" }), ctx(p.id));
    const user = llmMock.callJson.mock.calls[0][0].messages[0].content;
    expect(user).toContain(SCRIPT_TEXT);
    expect(user).toContain("더 짧게");
  });
});
