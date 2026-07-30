import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// 라우트가 정적으로 물고 있는 저장소와 같은 인스턴스를 쓴다(데이터 디렉터리는 호출 시점 env를 읽는다)
import { createProject, getProject, updateProject } from "../lib/projects.js";
import { isAudioStale, isImageStale, isClipStale, isRenderStale, renderKey } from "../lib/steps.js";

const pipelineMock = vi.hoisted(() => ({ run: vi.fn(async () => {}) }));
vi.mock("../lib/pipeline.js", () => ({
  runSplitPipeline: (...a) => pipelineMock.run(...a),
  runImagesPipeline: (...a) => pipelineMock.run(...a),
  runVoicePipeline: (...a) => pipelineMock.run(...a),
  runVideoPipeline: (...a) => pipelineMock.run(...a),
  runRenderPipeline: (...a) => pipelineMock.run(...a),
}));

const llmMock = vi.hoisted(() => ({ callJson: vi.fn() }));
vi.mock("../lib/llm.js", () => ({ callJson: (...a) => llmMock.callJson(...a) }));

const { POST: cutsPOST } = await import("../app/api/projects/[id]/cuts/route.js");
const { POST: imagesPOST } = await import("../app/api/projects/[id]/images/route.js");
const { GET, PATCH } = await import("../app/api/projects/[id]/route.js");
const { POST: briefingPOST } = await import("../app/api/projects/[id]/briefing/route.js");
const { POST: scriptPOST } = await import("../app/api/projects/[id]/script/route.js");
const { POST: renderPOST } = await import("../app/api/projects/[id]/render/route.js");
const { POST: clipsPOST } = await import("../app/api/projects/[id]/clips/route.js");
const { GET: renderFileGET } = await import("../app/api/renders/[name]/route.js");
const { POST: projectsPOST } = await import("../app/api/projects/route.js");

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
  it("파이프라인보다 먼저 status:cuts·빈 cuts를 세운다(응답 시점에 목소리 단계가 열려 있다)", async () => {
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
    // 판정은 컷의 유무다 — status 로 보면 목소리·이미지 단계에서 컷이 통째로 지워질 수 있다
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj,
      status: "cuts",
      cuts_script_version: 1, // 지금 원고에서 나온 컷 — 낡지 않았다
      cuts: [{ idx: 0, sentence: "이미 만든 컷", state: "done", image: { url: "http://img/1" } }],
    }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(409);
    const after = await getProject(p.id);
    expect(after.cuts).toHaveLength(1);
    expect(after.cuts[0].image.url).toBe("http://img/1");
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("낡은 컷은 막지 않는다 — 대본을 다시 쓴 뒤에는 다시 나눠야 한다", async () => {
    // status 로 판정하면 이 자리가 막힌다. 새 흐름에서 status 는 목소리·이미지로 앞서 가므로
    // "컷이 있다"만 보면 원고를 고친 뒤 컷을 영영 다시 만들 수 없다.
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj,
      status: "voice",
      script: { ...proj.script, version: 2 },
      cuts_script_version: 1, // 버전 1 원고에서 나온 컷 — 낡았다
      cuts: [{ idx: 0, sentence: "옛 원고의 컷", state: "done", image: { url: "http://img/1" } }],
    }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalled();
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

describe("POST /api/projects/[id]/images", () => {
  it("컷이 없으면 400 — 대본 승인이 컷을 나눈다", async () => {
    const p = await projectWithScript();
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/대본/);
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("목소리가 없으면 400 — 길이를 모르는 채로 그림을 그리지 않는다", async () => {
    // 낭독 실측이 cut.seconds 를 덮기 전에 그리면, 10초 넘는 컷을 뒤늦게 알고 값을 두 번 치른다
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, state: "pending" }],
    }));
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/목소리/);
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("소리가 있으면 시작한다 — 컷을 pending 으로 되돌리고 파이프라인을 띄운다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, audio: { url: "a" }, state: "done" }],
    }));
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalledWith(p.id);
    expect((await getProject(p.id)).cuts[0].state).toBe("pending");
  });

  it("이미 이미지가 있으면 409 — 컷당 두 장씩 다시 사지 않는다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "images",
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, audio: { url: "a" }, image: { url: "http://img/1" } }],
    }));
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(409);
    expect((await getProject(p.id)).cuts[0].image.url).toBe("http://img/1");
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("이미지 생성이 실패하면 images_error를 남긴다(화면이 기다리지 않게)", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, audio: { url: "a" } }],
    }));
    pipelineMock.run.mockRejectedValue(new Error("이미지 생성 실패"));
    await imagesPOST(patchReq({}), ctx(p.id));
    await new Promise((r) => setTimeout(r, 10));
    expect((await getProject(p.id)).images_error).toBe("이미지 생성 실패");
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

  it("초점을 바꾸면 컷을 비운다 — 화면과 캐스팅이 함께 달라져야 한다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      briefing: { ...proj.briefing, focus: { mode: "사람", subject: "50대 남성 손님" } },
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, shows: "옛 화면" }],
      cast: [{ id: "c1", who: "손님", cuts: [0] }],
    }));
    const res = await PATCH(
      patchReq({ briefing: { focus: { mode: "물건", subject: "수선한 코트" } } }), ctx(p.id));
    expect(res.status).toBe(200);
    const saved = await getProject(p.id);
    expect(saved.briefing.focus.mode).toBe("물건");
    expect(saved.cuts).toEqual([]);
  });

  it("초점이 그대로면 컷을 건드리지 않는다 — 다시 만들면 고쳐 둔 화면이 지워진다", async () => {
    const p = await projectWithScript();
    const focus = { mode: "사람", subject: "50대 남성 손님" };
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      briefing: { ...proj.briefing, focus },
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, shows: "고쳐 둔 화면" }],
    }));
    const res = await PATCH(patchReq({ briefing: { focus } }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id)).cuts[0].shows).toBe("고쳐 둔 화면");
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

describe("완성 라우트", () => {
  it("클립이 없으면 합성을 시작하지 않는다", async () => {
    const p = await createProject({ settings: {}, material: { text: "x" } });
    await updateProject(p.id, (proj) => ({
      ...proj, status: "voice", cuts: [{ idx: 0, sentence: "문장", audio: { url: "a" } }],
    }));
    const res = await renderPOST(new Request("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/영상/);
  });

  it("클립이 있으면 시작한다", async () => {
    const p = await createProject({ settings: {}, material: { text: "x" } });
    await updateProject(p.id, (proj) => ({
      ...proj, status: "video",
      cuts: [{ idx: 0, sentence: "문장", video: { url: "v" }, audio: { url: "a" } }],
    }));
    const res = await renderPOST(new Request("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await res.json()).started).toBe(true);
  });
});

describe("완성본 내려받기", () => {
  const nameCtx = (name) => ({ params: Promise.resolve({ name }) });

  it("경로 탈출을 막는다", async () => {
    // 파일명 정규식을 통과한 이름만 경로에 붙인다
    for (const bad of ["../../secret.json", "..%2Fx.mp4", "a/b.mp4", "x.json"]) {
      const res = await renderFileGET(new Request("http://x"), nameCtx(bad));
      expect(res.status, bad).toBe(400);
    }
  });

  it("없는 파일은 404", async () => {
    const res = await renderFileGET(new Request("http://x"), nameCtx("nothing-here.mp4"));
    expect(res.status).toBe(404);
  });
});

describe("무효화 관통 — 고치면 낡고, 안 고친 것은 살아남는다", () => {
  async function projectWithCuts() {
    const p = await projectWithScript();
    return updateProject(p.id, (proj) => ({
      ...proj,
      status: "video",
      cuts: [
        {
          idx: 0, sentence: "첫 문장.", shows: "주인이 코트를 든다", motion: "천천히", seconds: 6,
          audio: { url: "a0", seconds: 6, of: "첫 문장." },
          image: { url: "i0", of: "주인이 코트를 든다" },
          video: { url: "v0", seconds: 6, of: "i0|6|천천히" },
        },
      ],
    }));
  }

  // ★ 손으로 고친 문장이 원고에도 반영돼야 한다.
  //
  // 컷은 원고를 잘라서 만들고 "이어붙이면 원고와 글자 그대로 같다"가 이 파이프라인의 유일한
  // 구조적 보장이다. 컷 문장만 고치고 원고를 그대로 두면 그 보장이 깨지고, 나중에 컷을 다시
  // 나누는 순간(POST /cuts 는 script.text 를 자른다) 사장님이 고친 문장이 조용히 사라진다.
  it("컷 문장을 고치면 원고도 함께 따라온다 — 이어붙이면 원고와 같다", async () => {
    const p = await projectWithScript();
    const two = await updateProject(p.id, (proj) => ({
      ...proj,
      status: "video",
      cuts: [
        { idx: 0, sentence: "매일 아침 딸기를 갈아 씁니다.", shows: "ㄱ", motion: "ㄴ", seconds: 4 },
        { idx: 1, sentence: "시럽은 쓰지 않습니다.", shows: "ㄷ", motion: "ㄹ", seconds: 3 },
      ],
    }));
    expect(two.cuts.map((c) => c.sentence).join(" ")).toBe(two.script.text); // 전제

    await PATCH(patchReq({ cut: { idx: 1, sentence: "설탕도 넣지 않습니다." } }), ctx(p.id));
    const saved = await getProject(p.id);
    expect(saved.cuts[1].sentence).toBe("설탕도 넣지 않습니다.");
    expect(saved.script.text).toBe("매일 아침 딸기를 갈아 씁니다. 설탕도 넣지 않습니다.");
    expect(saved.cuts.map((c) => c.sentence).join(" ")).toBe(saved.script.text);
  });

  // 버전을 올리면 ②대본에 "원고가 바뀌었어요" 거짓 경고가 뜨고, 그 안내의 버튼은 유료 호출이다.
  // 그리고 컷이 낡은 것으로 판정돼 자동 재분할이 돌아 방금 고친 문장이 덮인다.
  it("컷 문장을 고쳐도 원고 버전은 오르지 않는다", async () => {
    const p = await projectWithCuts();
    const before = p.script.version;
    await PATCH(patchReq({ cut: { idx: 0, sentence: "고친 문장." } }), ctx(p.id));
    expect((await getProject(p.id)).script.version).toBe(before);
  });

  it("화면·움직임만 고칠 때는 원고를 건드리지 않는다", async () => {
    const p = await projectWithCuts();
    await PATCH(patchReq({ cut: { idx: 0, shows: "손님이 코트를 든다" } }), ctx(p.id));
    expect((await getProject(p.id)).script.text).toBe(p.script.text);
  });

  it("문장을 고치면 소리만 낡는다 — 그림은 살아남는다", async () => {
    const p = await projectWithCuts();
    const res = await PATCH(patchReq({ cut: { idx: 0, sentence: "고친 문장." } }), ctx(p.id));
    expect(res.status).toBe(200);
    const cut = (await getProject(p.id)).cuts[0];
    expect(isAudioStale(cut)).toBe(true);
    expect(isImageStale(cut)).toBe(false);
    expect(isClipStale(cut)).toBe(false);
  });

  it("화면 설명을 고치면 그림만 낡는다", async () => {
    const p = await projectWithCuts();
    await PATCH(patchReq({ cut: { idx: 0, shows: "손님이 코트를 든다" } }), ctx(p.id));
    const cut = (await getProject(p.id)).cuts[0];
    expect(isImageStale(cut)).toBe(true);
    expect(isAudioStale(cut)).toBe(false);
  });

  it("화풍을 바꾸면 그림만 낡는다 — 원고와 소리는 살아남는다", async () => {
    const p = await projectWithCuts();
    await updateProject(p.id, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => ({ ...c, image: { ...c.image, style_of: "photo|" } })),
    }));
    const res = await PATCH(patchReq({ settings: { style: { preset: "illust" } } }), ctx(p.id));
    expect(res.status ?? 200).toBe(200);
    const saved = await getProject(p.id);
    expect(isImageStale(saved.cuts[0], saved)).toBe(true);
    expect(isAudioStale(saved.cuts[0])).toBe(false);
    // 컷도 원고도 비우지 않는다 — 화풍은 글이 아니라 그림의 근거다
    expect(saved.cuts.length).toBe(p.cuts.length);
    expect(saved.script.text).toBe(p.script.text);
  });

  it("움직임을 고치면 클립이 낡는다", async () => {
    const p = await projectWithCuts();
    await PATCH(patchReq({ cut: { idx: 0, motion: "정지" } }), ctx(p.id));
    expect(isClipStale((await getProject(p.id)).cuts[0])).toBe(true);
  });

  it("컷을 고치면 완성본이 낡는다", async () => {
    const p = await projectWithCuts();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "done",
      render: { url: "r.mp4", seconds: 6, of: renderKey({ cuts: proj.cuts }) },
    }));
    expect(isRenderStale(await getProject(p.id))).toBe(false);
    await PATCH(patchReq({ cut: { idx: 0, sentence: "고친 문장." } }), ctx(p.id));
    expect(isRenderStale(await getProject(p.id))).toBe(true);
  });
});

// 화면은 서버 env 를 볼 수 없다. 상한을 실어 보내지 않으면 ②대본 화면이 기본값(20초)으로
// 판정해, Kling(15초)에서 17초 컷에 경고를 띄우지 않는다 — 돈 쓰기 전에 잡을 유일한 자리다.
describe("GET /api/projects/[id] — 활성 모델의 상한을 실어 보낸다", () => {
  it("env 를 비우면 기본 프로필 값이다", async () => {
    const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: p.id }) });
    const body = await res.json();
    expect(body.clip_limits).toEqual({ min: 6, max: 20 });
  });

  it("env 를 바꾸면 따라 바뀐다 — 저장된 프로젝트에는 남지 않는다", async () => {
    const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
    process.env.FAL_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";
    try {
      const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: p.id }) });
      expect((await res.json()).clip_limits).toEqual({ min: 3, max: 15 });
      // 저장된 파일에는 없어야 한다 — 요청마다 다시 푸는 값이다
      const { getProject } = await import("../lib/projects.js");
      expect(await getProject(p.id)).not.toHaveProperty("clip_limits");
    } finally {
      delete process.env.FAL_I2V_ENDPOINT;
    }
  });
});

// 컷 하나만 클립이 있는 상태가 실제로 생겼다(A/B 로 미리 산 클립을 심었다). 그때 나머지를
// 만들 길이 없으면 안 된다 — 파이프라인은 살아 있는 클립을 건너뛰므로 다시 불러도 값이 없다.
describe("POST /api/projects/[id]/clips — 남은 것이 있으면 돈다", () => {
  const liveCut = (idx) => ({
    idx, sentence: "문장", seconds: 3,
    image: { url: `i${idx}` }, audio: { url: `a${idx}`, seconds: 3 },
    video: { url: `v${idx}`, seconds: 3, truncated: false, of: `i${idx}|3|` },
  });
  const bareCut = (idx) => ({
    idx, sentence: "문장", seconds: 3,
    image: { url: `i${idx}` }, audio: { url: `a${idx}`, seconds: 3 },
  });

  it("클립 없는 컷이 남아 있으면 시작한다 — status 가 video 여도", async () => {
    const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
    await updateProject(p.id, (proj) => ({
      ...proj, status: "video", cuts: [liveCut(0), bareCut(1)],
    }));
    const res = await clipsPOST(new Request("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await res.json()).started).toBe(true);
  });

  it("낡은 클립이 남아 있으면 시작한다", async () => {
    const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
    const stale = { ...liveCut(0), video: { url: "v0", seconds: 3, truncated: false, of: "옛그림|3|" } };
    await updateProject(p.id, (proj) => ({ ...proj, status: "video", cuts: [stale] }));
    const res = await clipsPOST(new Request("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(200);
  });

  it("전부 살아 있으면 409 — 할 일이 없다", async () => {
    const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
    await updateProject(p.id, (proj) => ({
      ...proj, status: "video", cuts: [liveCut(0), liveCut(1)],
    }));
    const res = await clipsPOST(new Request("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(409);
  });
});

describe("POST /api/projects — 영상 컨셉", () => {
  // 자료를 넣는 화면에서 컨셉을 함께 고른다. 길이(target_seconds)와 달리 조용히 무시하지
  // 않는다 — 고른 컨셉과 그림에 실리는 컨셉이 달라지면 아무도 못 알아본다.
  it("고른 컨셉을 settings 에 담아 만든다", async () => {
    const res = await projectsPOST({
      json: async () => ({ material: { text: "자료" }, settings: { style: { preset: "anime", note: " 파스텔 " } } }),
    });
    const p = await res.json();
    expect(p.settings.style).toEqual({ preset: "anime", note: "파스텔" });
  });

  it("모르는 컨셉은 400 이고 프로젝트를 만들지 않는다", async () => {
    const res = await projectsPOST({
      json: async () => ({ material: { text: "자료" }, settings: { style: { preset: "클레이애니" } } }),
    });
    expect(res.status).toBe(400);
  });

  it("컨셉을 안 보내면 settings 에 넣지 않는다 — 기본값은 파생한다", async () => {
    const res = await projectsPOST({ json: async () => ({ material: { text: "자료" } }) });
    const p = await res.json();
    expect(p.settings.style).toBeUndefined();
    expect(p.settings.aspect_ratio).toBe("9:16");
  });
});

describe("PATCH /api/projects/[id] — 화풍", () => {
  const make = () => createProject({ settings: {}, material: { text: "자료", photos: [] } });

  it("고른 화풍과 보정을 settings 에 저장한다", async () => {
    const p = await make();
    const res = await PATCH(patchReq({ settings: { style: { preset: "illust", note: " 따뜻한 파스텔톤 " } } }), ctx(p.id));
    expect(res.status ?? 200).toBe(200);
    const saved = (await getProject(p.id)).settings.style;
    expect(saved).toEqual({ preset: "illust", note: "따뜻한 파스텔톤" });
  });

  // settings 는 화이트리스트 없이 얕게 머지된다. 여기서 막지 않으면 아무 값이나 들어가고
  // 그 값으로 유료 호출이 나간다 — 닫힌 목록은 코드가 판정한다.
  it("모르는 화풍은 400 이고 아무것도 저장하지 않는다", async () => {
    const p = await make();
    const res = await PATCH(patchReq({ settings: { style: { preset: "클레이애니" } } }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id)).settings.style).toBeUndefined();
  });

  it("상한을 넘는 보정은 400 이다 — 조용히 자르지 않는다", async () => {
    const p = await make();
    const res = await PATCH(patchReq({ settings: { style: { preset: "photo", note: "가".repeat(200) } } }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id)).settings.style).toBeUndefined();
  });

  it("화풍을 바꿔도 비율 같은 다른 설정은 살아남는다", async () => {
    const p = await make();
    await PATCH(patchReq({ settings: { aspect_ratio: "1:1" } }), ctx(p.id));
    await PATCH(patchReq({ settings: { style: { preset: "anime" } } }), ctx(p.id));
    const s = (await getProject(p.id)).settings;
    expect(s.aspect_ratio).toBe("1:1");
    expect(s.style.preset).toBe("anime");
  });

  it("화풍을 안 보내는 기존 PATCH 는 그대로 돈다", async () => {
    const p = await make();
    await PATCH(patchReq({ settings: { style: { preset: "scifi" } } }), ctx(p.id));
    await PATCH(patchReq({ settings: { aspect_ratio: "16:9" } }), ctx(p.id));
    // 화풍을 건드리지 않았으니 남아 있어야 한다
    expect((await getProject(p.id)).settings.style.preset).toBe("scifi");
  });
});
