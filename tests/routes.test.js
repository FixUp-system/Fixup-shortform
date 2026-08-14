import { describe, it, expect, beforeEach, vi } from "vitest";

// 라우트가 정적으로 물고 있는 저장소와 같은 인스턴스를 쓴다 —
// 정적 import 를 유지해야 라우트와 테스트가 **같은 store** 를 본다.
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, getProject, updateProject } from "../lib/projects.js";

// 라우트는 이제 신원 헤더(withUser)로 소유자를 정한다 — 아래 AUTH_HEADERS 가 이 값을 싣는다.
// ★ 일부러 0 이 아닌 UUID다 — 옛 TEMP_OWNER 자리표시자의 기본값
// ("00000000-0000-0000-0000-000000000000")과 우연히 같으면, 어느 라우트가 withUser 를 벗고
// 그 자리표시자로 되돌아가도 이 파일의 테스트가 계속 통과해 되돌림을 못 잡는다(리뷰 I1).
const OWNER = "33333333-3333-3333-3333-333333333333";
import { getStore } from "../lib/store/index.js";
import { chargeVideo } from "../lib/charges.js";
import { isAudioStale, isImageStale, isClipStale, isRenderStale, renderKey } from "../lib/steps.js";

// 시작 게이트가 붙은 뒤로, 영상 정가(30초 = 50 크레딧)가 없는 사용자는 유료 시작 라우트에서 402 다.
// 이 파일이 재는 것은 각 라우트의 가드·배선이므로, 유료 시작을 부르는 테스트는 충전해 두고
// 부른다 — 게이트를 끄는 것이 아니라 통과시켜 **그 뒤의** 판정을 본다.
// (게이트 자체는 tests/credits-gate.test.js 가 잰다.)
const grant = () =>
  getStore().insertGrant({
    user_id: OWNER, amount_credits: 500, reason: "충전",
    granted_by: "00000000-0000-4000-8000-0000000000ad",
  });
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

// 라우트가 withUser 로 감싸인 뒤로는 신원 헤더가 없으면 500 이다(Task 8) —
// 여기서 만드는 요청은 전부 이 헤더를 실어 보낸다.
const AUTH_HEADERS = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };

const pipelineMock = vi.hoisted(() => ({
  run: vi.fn(async () => {}),
  regen: vi.fn(async () => ({ idx: 0 })),
}));
// 자막 재굽기는 따로 센다 — 라우트가 **어느** 파이프라인을 불렀는지 구별해야 한다
const subtitleMock = vi.hoisted(() => ({ run: vi.fn(async () => ({})) }));
vi.mock("../lib/pipeline.js", () => ({
  runSplitPipeline: (...a) => pipelineMock.run(...a),
  runImagesPipeline: (...a) => pipelineMock.run(...a),
  runVoicePipeline: (...a) => pipelineMock.run(...a),
  runVideoPipeline: (...a) => pipelineMock.run(...a),
  runRenderPipeline: (...a) => pipelineMock.run(...a),
  runSubtitlePipeline: (...a) => subtitleMock.run(...a),
  regenCut: (...a) => pipelineMock.regen(...a),
  regenVoice: (...a) => pipelineMock.regen(...a),
  regenClip: (...a) => pipelineMock.regen(...a),
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
const { POST: cutRegenPOST } = await import("../app/api/projects/[id]/cuts/[idx]/regen/route.js");
const { POST: voiceRegenPOST } = await import("../app/api/projects/[id]/voice/[idx]/regen/route.js");
const { POST: voicePOST } = await import("../app/api/projects/[id]/voice/route.js");
const { POST: clipRegenPOST } = await import("../app/api/projects/[id]/clips/[idx]/regen/route.js");
const { POST: subtitlePOST } = await import("../app/api/projects/[id]/subtitle/route.js");

const ctx = (id) => ({ params: Promise.resolve({ id }) });
const idxCtx = (id, idx) => ({ params: Promise.resolve({ id, idx: String(idx) }) });
const patchReq = (body) => ({ json: async () => body, headers: new Headers(AUTH_HEADERS) });
// new Request(...) 로 만들던 자리 전부를 대신한다 — 신원 헤더를 함께 싣는다
const authReq = (url, init = {}) => new Request(url, { ...init, headers: { ...AUTH_HEADERS, ...(init.headers || {}) } });

beforeEach(async () => {
  resetMemoryStore();
  pipelineMock.run.mockReset().mockResolvedValue(undefined);
  pipelineMock.regen.mockReset().mockResolvedValue({ idx: 0 });
  subtitleMock.run.mockReset().mockResolvedValue({});
  llmMock.callJson.mockReset();
});

const SCRIPT_TEXT = "매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다.";

async function projectWithScript() {
  const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
  return updateProject(p.id, OWNER, (proj) => ({
    ...proj,
    status: "script",
    briefing: { topic: "주제", key_points: ["ㄱ"], asked: [], confirmed: true, version: 2 },
    script: { text: SCRIPT_TEXT, version: 1, briefing_version: 2 },
  }));
}

async function projectWithBriefing() {
  const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
  return updateProject(p.id, OWNER, (proj) => ({
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
    const after = await getProject(p.id, OWNER);
    expect(after.status).toBe("cuts");
    expect(after.cuts).toEqual([]);
    expect(after.cuts_error).toBeNull();
    expect(started).toBe(true);
  });

  it("어느 원고에서 나온 컷인지 기록한다 — 원고를 다시 쓰면 컷이 낡는다", async () => {
    const p = await projectWithScript();
    await cutsPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id, OWNER)).cuts_script_version).toBe(1);
  });

  it("컷 분할이 실패하면 cuts_error를 남긴다(화면이 5분을 기다리지 않게)", async () => {
    const p = await projectWithScript();
    pipelineMock.run.mockRejectedValue(new Error("컷 분할 실패"));
    await cutsPOST(patchReq({}), ctx(p.id));
    await new Promise((r) => setTimeout(r, 10));
    expect((await getProject(p.id, OWNER)).cuts_error).toBe("컷 분할 실패");
  });

  it("이미 컷이 있으면 409로 막고 만든 컷을 지우지 않는다(재승인이 유료 컷을 날리지 않게)", async () => {
    // 판정은 컷의 유무다 — status 로 보면 목소리·이미지 단계에서 컷이 통째로 지워질 수 있다
    const p = await projectWithScript();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      status: "cuts",
      cuts_script_version: 1, // 지금 원고에서 나온 컷 — 낡지 않았다
      cuts: [{ idx: 0, sentence: "이미 만든 컷", state: "done", image: { url: "http://img/1" } }],
    }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(409);
    const after = await getProject(p.id, OWNER);
    expect(after.cuts).toHaveLength(1);
    expect(after.cuts[0].image.url).toBe("http://img/1");
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("낡은 컷은 막지 않는다 — 대본을 다시 쓴 뒤에는 다시 나눠야 한다", async () => {
    // status 로 판정하면 이 자리가 막힌다. 새 흐름에서 status 는 목소리·이미지로 앞서 가므로
    // "컷이 있다"만 보면 원고를 고친 뒤 컷을 영영 다시 만들 수 없다.
    const p = await projectWithScript();
    await updateProject(p.id, OWNER, (proj) => ({
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
    await updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "cuts", cuts: [] }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalled();
  });

  it("보낸 화면 비율을 settings에 저장하고, 잘못된 값은 기본 9:16으로 둔다", async () => {
    const p = await projectWithScript();
    await cutsPOST(patchReq({ aspect_ratio: "1:1" }), ctx(p.id));
    expect((await getProject(p.id, OWNER)).settings.aspect_ratio).toBe("1:1");

    const q = await projectWithScript();
    await cutsPOST(patchReq({ aspect_ratio: "4:5" }), ctx(q.id));
    expect((await getProject(q.id, OWNER)).settings.aspect_ratio).toBe("9:16");
  });

  it("원고가 없으면 상태를 건드리지 않고 400", async () => {
    const p = await projectWithBriefing();
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id, OWNER)).status).not.toBe("cuts");
  });

  it("구성 시절 대본(문단만 있는)도 400 — 원고를 다시 써야 자를 수 있다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, OWNER, (proj) => ({ ...proj, script: { paragraphs: [{ text: "옛 문단" }], version: 1 } }));
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
    await updateProject(p.id, OWNER, (proj) => ({
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
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, audio: { url: "a" }, state: "done" }],
    }));
    await grant();
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalledWith(p.id, OWNER);
    expect((await getProject(p.id, OWNER)).cuts[0].state).toBe("pending");
  });

  it("이미 이미지가 있으면 409 — 컷당 두 장씩 다시 사지 않는다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "images",
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, audio: { url: "a" }, image: { url: "http://img/1" } }],
    }));
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(409);
    expect((await getProject(p.id, OWNER)).cuts[0].image.url).toBe("http://img/1");
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("이미지 생성이 실패하면 images_error를 남긴다(화면이 기다리지 않게)", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, audio: { url: "a" } }],
    }));
    pipelineMock.run.mockRejectedValue(new Error("이미지 생성 실패"));
    await grant();
    await imagesPOST(patchReq({}), ctx(p.id));
    await new Promise((r) => setTimeout(r, 10));
    expect((await getProject(p.id, OWNER)).images_error).toBe("이미지 생성 실패");
  });
});

describe("PATCH /api/projects/[id] — 브리핑 버전은 내용 변경에 묶인다", () => {
  it("확정만 다시 눌러도 버전은 그대로다(거짓 stale 안내 방지)", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ briefing: { confirmed: true } }), ctx(p.id));
    expect((await getProject(p.id, OWNER)).briefing.version).toBe(2);
  });

  it("내용을 고쳐 저장하면 버전이 오른다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ briefing: { topic: "새 주제" } }), ctx(p.id));
    expect((await getProject(p.id, OWNER)).briefing.version).toBe(3);
  });

  it("질문에 답하면 내용이 바뀐 것으로 본다(답변은 대본 프롬프트에 들어간다)", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ briefing: { asked: [{ question: "가격은?", answer: "5천원", done: true }] } }), ctx(p.id));
    expect((await getProject(p.id, OWNER)).briefing.version).toBe(3);
  });

  it("초점을 바꾸면 컷을 비운다 — 화면과 캐스팅이 함께 달라져야 한다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "cuts",
      briefing: { ...proj.briefing, focus: { mode: "사람", subject: "50대 남성 손님" } },
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, shows: "옛 화면" }],
      cast: [{ id: "c1", who: "손님", cuts: [0] }],
    }));
    const res = await PATCH(
      patchReq({ briefing: { focus: { mode: "물건", subject: "수선한 코트" } } }), ctx(p.id));
    expect(res.status).toBe(200);
    const saved = await getProject(p.id, OWNER);
    expect(saved.briefing.focus.mode).toBe("물건");
    expect(saved.cuts).toEqual([]);
  });

  it("초점이 그대로면 컷을 건드리지 않는다 — 다시 만들면 고쳐 둔 화면이 지워진다", async () => {
    const p = await projectWithScript();
    const focus = { mode: "사람", subject: "50대 남성 손님" };
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "cuts",
      briefing: { ...proj.briefing, focus },
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, shows: "고쳐 둔 화면" }],
    }));
    const res = await PATCH(patchReq({ briefing: { focus } }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id, OWNER)).cuts[0].shows).toBe("고쳐 둔 화면");
  });
});

describe("PATCH /api/projects/[id] — 자막 위치는 닫힌 목록이다", () => {
  it("자막 위치는 아는 값만 받는다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    const res = await PATCH(patchReq({ settings: { subtitle_position: "가운데" } }), ctx(p.id));
    expect(res.status).toBe(400);
  });

  it("아는 값이면 저장된다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    const res = await PATCH(patchReq({ settings: { subtitle_position: "top" } }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id, OWNER)).settings.subtitle_position).toBe("top");
  });
});

describe("PATCH script_text — 원고 손편집", () => {
  it("원고를 고쳐 저장한다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ script_text: "손으로 고친 원고입니다." }), ctx(p.id));
    expect((await getProject(p.id, OWNER)).script.text).toBe("손으로 고친 원고입니다.");
  });

  it("손편집은 version을 올리지 않는다 — 고친 것이 컷 낡음 경고를 띄우면 안 된다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ script_text: "손으로 고친 원고입니다." }), ctx(p.id));
    expect((await getProject(p.id, OWNER)).script.version).toBe(1);
  });

  it("빈 문자열·공백·비문자열은 무시한다 — 원고를 실수로 지우지 않는다", async () => {
    const p = await projectWithScript();
    for (const bad of ["", "   ", 123, null]) {
      await PATCH(patchReq({ script_text: bad }), ctx(p.id));
      expect((await getProject(p.id, OWNER)).script.text).toBe(SCRIPT_TEXT);
    }
  });

  it("원고가 아직 없으면 만들지 않는다", async () => {
    const p = await projectWithBriefing();
    await PATCH(patchReq({ script_text: "없던 원고" }), ctx(p.id));
    expect((await getProject(p.id, OWNER)).script).toBeFalsy();
  });
});

describe("POST /api/projects/[id]/briefing — 재추출", () => {
  it("이미 진행된 프로젝트의 status·confirmed를 되감지 않는다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "cuts", cuts: [{ idx: 0, sentence: "컷", state: "done" }] }));
    llmMock.callJson.mockResolvedValue({ topic: "새 주제", key_points: ["새 내용"], questions: [] });

    const res = await briefingPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    const after = await getProject(p.id, OWNER);
    expect(after.status).toBe("cuts"); // 되감기면 만든 이미지가 잠긴다
    expect(after.briefing.confirmed).toBe(true);
    expect(after.briefing.version).toBe(3); // 내용이 바뀌었으므로 오른다
  });

  it("내용이 그대로면 재추출해도 버전은 오르지 않는다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue({ topic: "주제", key_points: ["ㄱ"], questions: [] });
    await briefingPOST({}, ctx(p.id));
    expect((await getProject(p.id, OWNER)).briefing.version).toBe(2);
  });

  it("kind:develop이면 브리핑을 다시 뽑지 않고 질문만 덧붙인다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      settings: { ...proj.settings, target_seconds: 30 },
      briefing: { ...proj.briefing, asked: [{ question: "가격은?", answer: "5천원", done: true }] },
    }));
    llmMock.callJson.mockResolvedValue({ questions: [{ question: "왜 시작하셨어요?" }] });

    const res = await briefingPOST(patchReq({ kind: "develop" }), ctx(p.id));
    expect(res.status).toBe(200);
    const after = await getProject(p.id, OWNER);
    expect(after.briefing.topic).toBe("주제");            // 정리된 내용을 다시 뽑지 않는다
    expect(after.briefing.asked).toHaveLength(2);          // 이미 받은 답을 지우지 않는다
    expect(after.briefing.asked[0].answer).toBe("5천원");
    expect(after.briefing.asked[1]).toMatchObject({ question: "왜 시작하셨어요?", kind: "develop", options: [] });
  });

  it("호출이 예외로 죽어도 원시 에러를 흘리지 않고 한국어 502를 준다", async () => {
    const p = await projectWithScript();
    const raw = 'LLM 호출 실패 (429) {"error":{"message":"You exceeded your current quota"}}';
    llmMock.callJson.mockRejectedValue(new Error(raw));
    const res = await briefingPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("자료를 정리하지 못했어요. 직접 채우거나 다시 시도해 주세요.");
    expect(JSON.stringify(body)).not.toContain(raw);
    expect(llmMock.callJson).toHaveBeenCalledTimes(2); // 예외도 재시도한다
  });

  // ★ 리뷰 M1 — `typeof req?.json === "function" ? … : {}` 의 false 분기.
  // patchReq 를 전부 헤더 실은 버전으로 바꾸면서(Task 8) json() 있는 요청만 남아 이 분기를
  // 아무도 안 밟게 됐었다. 여기서 json 메서드가 없는(헤더만 있는) 요청으로 되살린다.
  it("json 메서드가 없는 요청도 받아넘긴다(본문 없이 부르는 자리가 있다)", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue({ topic: "주제", key_points: ["ㄱ"], questions: [] });
    const bare = { headers: new Headers(AUTH_HEADERS) }; // json 메서드가 없다
    const res = await briefingPOST(bare, ctx(p.id));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/projects/[id]/script — 원고", () => {
  // 목표 분량(사실 1개 → 밀도 반영 27자) 안에 드는 길이로 둔다 — 짧거나 길면 되돌리기가
  // 끼어들어 호출 순서가 밀린다(그 동작 자체는 아래 되돌리기 테스트에서 따로 본다)
  const cliche = { script: "특별한 라떼를 오늘 만나보세요. 지금 바로 오시면 좋습니다." };
  const plain = { script: "시럽을 쓰지 않습니다. 매일 아침 딸기를 갈아서 만듭니다." };

  it("없는 프로젝트면 404", async () => {
    const res = await scriptPOST(patchReq({}), ctx("없는id"));
    expect(res.status).toBe(404);
  });

  it("브리핑이 확정되지 않았으면 400", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
  });

  it("구성이 없어도 쓴다 — 원고가 곧 설계다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValue(plain);
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id, OWNER)).script.text).toBe(plain.script);
  });

  it("초안→교정을 거쳐 교정본을 저장한다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValueOnce(plain);
    await scriptPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id, OWNER)).script.text).toBe(plain.script);
    expect(llmMock.callJson).toHaveBeenCalledTimes(2); // 멀쩡한 초안에 되돌리기를 부르지 않는다
  });

  it("교정이 실패하면 초안으로 폴백한다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValue({}); // 교정 스키마 불일치
    await scriptPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id, OWNER)).script.text).toBe(cliche.script);
  });

  it("교정본이 분량을 불려 놓으면 초안을 지킨다", async () => {
    const p = await projectWithBriefing();                    // 목표(밀도 반영) 27자
    const fit = { script: "가".repeat(27) };                  // 목표 안, 결함 없음 — 되돌리기가 끼어들지 않는다
    const bloated = { script: "나".repeat(54) };              // 교정이 두 배로 불림(목표 27자를 넘긴다)
    llmMock.callJson.mockResolvedValueOnce(fit).mockResolvedValue(bloated);
    await scriptPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id, OWNER)).script.text).toBe(fit.script);
  });

  it("교정본이 분량을 흘리면 초안으로 폴백한다", async () => {
    const p = await projectWithBriefing();
    const long = { script: "가".repeat(27) };   // 목표(밀도 반영 27자) 안 — 되돌리기가 끼어들지 않는다
    const gutted = { script: "나".repeat(15) }; // 초안의 80% 미만
    llmMock.callJson.mockResolvedValueOnce(long).mockResolvedValue(gutted);
    await scriptPOST(patchReq({}), ctx(p.id));
    expect((await getProject(p.id, OWNER)).script.text).toBe(long.script);
  });

  // 초안은 겹치는 두 문장(같은 말 되풀이) 하나만 결함으로 걸리게 목표 분량(밀도 반영 27자) 안에 둔다 —
  // 밀도 계수 도입 전에는 60자 기준으로 여유가 있었지만, 27자에서는 조금만 길어도 '분량 초과'까지 겹쳐 걸린다.
  const 되풀이 = { script: "손님들이 신발을 맡기러 옵니다. 손님들이 신발을 자주 맡깁니다." };
  // 고쳐 온 원고는 목표 분량(27자) 안에 들어오고, 되풀이도 없어야 한다
  const 고침 = { script: "손님들이 신발을 맡기러 옵니다. 흰 신발은 하루 걸립니다." };

  it("되풀이가 있으면 한 번 다시 쓰게 부르고, 나아지면 받는다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson
      .mockResolvedValueOnce(되풀이)   // 초안
      .mockResolvedValueOnce(고침)     // 되돌리기
      .mockResolvedValueOnce(고침);    // 교정
    await scriptPOST(patchReq({}), ctx(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(3);
    expect((await getProject(p.id, OWNER)).script.text).toBe(고침.script);
  });

  it("되돌리기가 실패해도 초안을 안고 간다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson
      .mockResolvedValueOnce(되풀이)
      .mockRejectedValueOnce(new Error("네트워크"))
      .mockResolvedValueOnce(되풀이);
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id, OWNER)).script.text).toBe(되풀이.script);
  });

  // 스키마 거절 한 번은 그 라운드를 포기시키지 않는다 — 유료 호출이라 라운드당 한 번만
  // 다시 시도하고, 그것도 스키마를 못 지키면 그 라운드만 버리고 남은 라운드를 계속 돈다.
  it("되돌리기가 스키마를 거절하면 한 번 다시 시도하고, 그래도 안 되면 이 라운드만 버리고 다음 라운드를 돈다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson
      .mockResolvedValueOnce(되풀이) // 초안
      .mockResolvedValueOnce({})    // 되돌리기 1회차 시도1 — 스키마 거절
      .mockResolvedValueOnce({})    // 되돌리기 1회차 재시도 — 스키마 거절 → 1회차 버림
      .mockResolvedValueOnce(고침)  // 되돌리기 2회차 — 성공, 채택
      .mockResolvedValueOnce(고침); // 교정
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(llmMock.callJson).toHaveBeenCalledTimes(5);
    expect((await getProject(p.id, OWNER)).script.text).toBe(고침.script);
  });

  it("version을 올리고 브리핑 버전을 붙여 저장한다", async () => {
    const p = await projectWithScript(); // 이미 version 1
    llmMock.callJson.mockResolvedValue(plain);
    await scriptPOST(patchReq({}), ctx(p.id));
    const after = await getProject(p.id, OWNER);
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
    expect((await getProject(p.id, OWNER)).script.text).toBe(SCRIPT_TEXT); // 기존 원고를 덮지 않는다
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
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "x" } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "voice", cuts: [{ idx: 0, sentence: "문장", audio: { url: "a" } }],
    }));
    const res = await renderPOST(authReq("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/영상/);
  });

  it("클립이 있으면 시작한다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "x" } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "video",
      cuts: [{ idx: 0, sentence: "문장", video: { url: "v" }, audio: { url: "a" } }],
    }));
    const res = await renderPOST(authReq("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await res.json()).started).toBe(true);
  });
});

describe("POST /api/projects/[id]/subtitle — 자막만 다시 굽기", () => {
  it("원본이 없으면 400 이다 — 먼저 완성본을 만들어야 한다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, render: { url: "/api/renders/x.mp4", of: "..." },
    }));
    const res = await subtitlePOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect(subtitleMock.run).not.toHaveBeenCalled();
  });

  it("완성본이 아예 없어도 400 이다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    const res = await subtitlePOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
  });

  it("원본이 있으면 자막만 다시 굽는다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    await updateProject(p.id, OWNER, (proj) => ({
      // ★ camelCase 다 — 저장은 composeVideo 반환값을 그대로 스프레드한다(lib/pipeline.js).
      // `raw_url` 은 이 저장소에 없는 필드다.
      ...proj, render: { url: "/api/renders/x.mp4", rawUrl: "/api/renders/x-raw.mp4", of: "..." },
    }));
    const res = await subtitlePOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(subtitleMock.run).toHaveBeenCalledWith(p.id, OWNER);
  });

  it("없는 프로젝트는 404 다", async () => {
    const res = await subtitlePOST(patchReq({}), ctx("없는id"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH — 자막 설정", () => {
  it("모르는 값은 되돌려 저장한다 — 400 으로 막지 않는다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    const res = await PATCH(
      patchReq({ settings: { subtitle: { font: "코믹산스", size: 99, pos: [9, 9] } } }), ctx(p.id));
    expect(res.status).toBe(200);
    const after = await getProject(p.id, OWNER);
    expect(after.settings.subtitle.font).toBe("basic");
    expect(after.settings.subtitle.size).toBe(1.6);
    expect(after.settings.subtitle.pos).toEqual([0.94, 0.94]);
  });

  it("고른 값은 그대로 저장한다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    await PATCH(patchReq({ settings: { subtitle: { font: "impact", color: "#ff0000", size: 1.2, pos: [0.5, 0.7] } } }), ctx(p.id));
    const after = await getProject(p.id, OWNER);
    expect(after.settings.subtitle).toEqual({ font: "impact", color: "#FF0000", size: 1.2, pos: [0.5, 0.7] });
  });

  it("자막을 안 건드리는 저장은 자막 설정을 만들지 않는다", async () => {
    // 되돌리기가 무조건 돌면 기본값이 **명시로** 박혀 각인이 달라진다(lib/steps.js 주석) —
    // 픽셀이 같은 완성본을 다시 굽게 된다.
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    await PATCH(patchReq({ settings: { subtitle_position: "top" } }), ctx(p.id));
    const after = await getProject(p.id, OWNER);
    expect(after.settings.subtitle).toBeUndefined();
  });
});

describe("완성본 내려받기", () => {
  const nameCtx = (name) => ({ params: Promise.resolve({ name }) });

  it("경로 탈출을 막는다", async () => {
    // 파일명 정규식을 통과한 이름만 경로에 붙인다(Task 9 부터는 uuid 형태만)
    for (const bad of ["../../secret.json", "..%2Fx.mp4", "a/b.mp4", "x.json", "nothing-here.mp4"]) {
      const res = await renderFileGET(authReq("http://x"), nameCtx(bad));
      expect(res.status, bad).toBe(400);
    }
  });

  it("없는 파일은 404", async () => {
    // uuid 형태지만 그런 프로젝트가 없다
    const res = await renderFileGET(authReq("http://x"), nameCtx("00000000-0000-0000-0000-000000000000.mp4"));
    expect(res.status).toBe(404);
  });
});

describe("무효화 관통 — 고치면 낡고, 안 고친 것은 살아남는다", () => {
  async function projectWithCuts() {
    const p = await projectWithScript();
    return updateProject(p.id, OWNER, (proj) => ({
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
    const two = await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      status: "video",
      cuts: [
        { idx: 0, sentence: "매일 아침 딸기를 갈아 씁니다.", shows: "ㄱ", motion: "ㄴ", seconds: 4 },
        { idx: 1, sentence: "시럽은 쓰지 않습니다.", shows: "ㄷ", motion: "ㄹ", seconds: 3 },
      ],
    }));
    expect(two.cuts.map((c) => c.sentence).join(" ")).toBe(two.script.text); // 전제

    await PATCH(patchReq({ cut: { idx: 1, sentence: "설탕도 넣지 않습니다." } }), ctx(p.id));
    const saved = await getProject(p.id, OWNER);
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
    expect((await getProject(p.id, OWNER)).script.version).toBe(before);
  });

  it("화면·움직임만 고칠 때는 원고를 건드리지 않는다", async () => {
    const p = await projectWithCuts();
    await PATCH(patchReq({ cut: { idx: 0, shows: "손님이 코트를 든다" } }), ctx(p.id));
    expect((await getProject(p.id, OWNER)).script.text).toBe(p.script.text);
  });

  it("문장을 고치면 소리만 낡는다 — 그림은 살아남는다", async () => {
    const p = await projectWithCuts();
    const res = await PATCH(patchReq({ cut: { idx: 0, sentence: "고친 문장." } }), ctx(p.id));
    expect(res.status).toBe(200);
    const cut = (await getProject(p.id, OWNER)).cuts[0];
    expect(isAudioStale(cut)).toBe(true);
    expect(isImageStale(cut)).toBe(false);
    expect(isClipStale(cut)).toBe(false);
  });

  it("화면 설명을 고치면 그림만 낡는다", async () => {
    const p = await projectWithCuts();
    await PATCH(patchReq({ cut: { idx: 0, shows: "손님이 코트를 든다" } }), ctx(p.id));
    const cut = (await getProject(p.id, OWNER)).cuts[0];
    expect(isImageStale(cut)).toBe(true);
    expect(isAudioStale(cut)).toBe(false);
  });

  it("화풍을 바꾸면 그림만 낡는다 — 원고와 소리는 살아남는다", async () => {
    const p = await projectWithCuts();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => ({ ...c, image: { ...c.image, style_of: "photo|" } })),
    }));
    const res = await PATCH(patchReq({ settings: { style: { preset: "illust" } } }), ctx(p.id));
    expect(res.status ?? 200).toBe(200);
    const saved = await getProject(p.id, OWNER);
    expect(isImageStale(saved.cuts[0], saved)).toBe(true);
    expect(isAudioStale(saved.cuts[0])).toBe(false);
    // 컷도 원고도 비우지 않는다 — 화풍은 글이 아니라 그림의 근거다
    expect(saved.cuts.length).toBe(p.cuts.length);
    expect(saved.script.text).toBe(p.script.text);
  });

  it("속도를 고치면 저장되고 클립이 낡는다", async () => {
    const p = await projectWithCuts();
    const res = await PATCH(patchReq({ cut: { idx: 0, speed: "fast" } }), ctx(p.id));
    expect(res.status).toBe(200);
    const cut = (await getProject(p.id, OWNER)).cuts[0];
    expect(cut.speed).toBe("fast");
    // 속도가 클립 프롬프트에 실리므로 클립은 낡아야 한다
    expect(isClipStale(cut)).toBe(true);
    // 그림·소리는 속도와 무관하다
    expect(isImageStale(cut)).toBe(false);
    expect(isAudioStale(cut)).toBe(false);
  });

  it("목록 밖 속도는 무시한다 — 합성이 모르는 값이 저장되지 않게", async () => {
    const p = await projectWithCuts();
    await PATCH(patchReq({ cut: { idx: 0, speed: "아주느리게" } }), ctx(p.id));
    expect((await getProject(p.id, OWNER)).cuts[0].speed).toBeUndefined();
  });

  it("움직임을 고치면 클립이 낡는다", async () => {
    const p = await projectWithCuts();
    await PATCH(patchReq({ cut: { idx: 0, motion: "정지" } }), ctx(p.id));
    expect(isClipStale((await getProject(p.id, OWNER)).cuts[0])).toBe(true);
  });

  it("컷을 고치면 완성본이 낡는다", async () => {
    const p = await projectWithCuts();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "done",
      render: { url: "r.mp4", seconds: 6, of: renderKey({ cuts: proj.cuts }) },
    }));
    expect(isRenderStale(await getProject(p.id, OWNER))).toBe(false);
    await PATCH(patchReq({ cut: { idx: 0, sentence: "고친 문장." } }), ctx(p.id));
    expect(isRenderStale(await getProject(p.id, OWNER))).toBe(true);
  });
});

// 화면은 서버 env 를 볼 수 없다. 상한을 실어 보내지 않으면 ②대본 화면이 기본값(20초)으로
// 판정해, Kling(15초)에서 17초 컷에 경고를 띄우지 않는다 — 돈 쓰기 전에 잡을 유일한 자리다.
describe("GET /api/projects/[id] — 이 프로젝트 모델의 상한을 실어 보낸다", () => {
  it("모델이 없는 옛 프로젝트는 Kling 의 값이다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    const res = await GET(authReq("http://x"), { params: Promise.resolve({ id: p.id }) });
    const body = await res.json();
    expect(body.clip_limits).toEqual({ min: 3, max: 15 });
  });

  it("프로젝트가 고른 모델을 따라간다 — 저장된 프로젝트에는 남지 않는다", async () => {
    const p = await createProject({
      ownerId: OWNER, settings: { i2v_model: "seedance-2.0" }, material: { text: "자료", photos: [] },
    });
    const res = await GET(authReq("http://x"), { params: Promise.resolve({ id: p.id }) });
    expect((await res.json()).clip_limits).toEqual({ min: 4, max: 15 });
    // 저장된 문서에는 없어야 한다 — 요청마다 다시 푸는 값이다
    expect(await getProject(p.id, OWNER)).not.toHaveProperty("clip_limits");
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
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "video", cuts: [liveCut(0), bareCut(1)],
    }));
    await grant();
    const res = await clipsPOST(authReq("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await res.json()).started).toBe(true);
  });

  it("낡은 클립이 남아 있으면 시작한다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    const stale = { ...liveCut(0), video: { url: "v0", seconds: 3, truncated: false, of: "옛그림|3|" } };
    await updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "video", cuts: [stale] }));
    await grant();
    const res = await clipsPOST(authReq("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(200);
  });

  it("전부 살아 있으면 409 — 할 일이 없다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "video", cuts: [liveCut(0), liveCut(1)],
    }));
    const res = await clipsPOST(authReq("http://x", { method: "POST" }), ctx(p.id));
    expect(res.status).toBe(409);
  });
});

describe("POST /api/projects — 영상 컨셉", () => {
  // 자료를 넣는 화면에서 컨셉을 함께 고른다. 길이(target_seconds)와 달리 조용히 무시하지
  // 않는다 — 고른 컨셉과 그림에 실리는 컨셉이 달라지면 아무도 못 알아본다.
  it("고른 컨셉을 settings 에 담아 만든다", async () => {
    const res = await projectsPOST(patchReq({ material: { text: "자료" }, settings: { style: { preset: "anime", note: " 파스텔 " } } }));
    const p = await res.json();
    expect(p.settings.style).toEqual({ preset: "anime", note: "파스텔" });
  });

  it("모르는 컨셉은 400 이고 프로젝트를 만들지 않는다", async () => {
    const res = await projectsPOST(patchReq({ material: { text: "자료" }, settings: { style: { preset: "클레이애니" } } }));
    expect(res.status).toBe(400);
  });

  it("컨셉을 안 보내면 settings 에 넣지 않는다 — 기본값은 파생한다", async () => {
    const res = await projectsPOST(patchReq({ material: { text: "자료" } }));
    const p = await res.json();
    expect(p.settings.style).toBeUndefined();
    expect(p.settings.aspect_ratio).toBe("9:16");
  });
});

describe("PATCH /api/projects/[id] — 화풍", () => {
  const make = () => createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });

  it("고른 화풍과 보정을 settings 에 저장한다", async () => {
    const p = await make();
    const res = await PATCH(patchReq({ settings: { style: { preset: "illust", note: " 따뜻한 파스텔톤 " } } }), ctx(p.id));
    expect(res.status ?? 200).toBe(200);
    const saved = (await getProject(p.id, OWNER)).settings.style;
    expect(saved).toEqual({ preset: "illust", note: "따뜻한 파스텔톤" });
  });

  // settings 는 화이트리스트 없이 얕게 머지된다. 여기서 막지 않으면 아무 값이나 들어가고
  // 그 값으로 유료 호출이 나간다 — 닫힌 목록은 코드가 판정한다.
  it("모르는 화풍은 400 이고 아무것도 저장하지 않는다", async () => {
    const p = await make();
    const res = await PATCH(patchReq({ settings: { style: { preset: "클레이애니" } } }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id, OWNER)).settings.style).toBeUndefined();
  });

  it("상한을 넘는 보정은 400 이다 — 조용히 자르지 않는다", async () => {
    const p = await make();
    const res = await PATCH(patchReq({ settings: { style: { preset: "photo", note: "가".repeat(200) } } }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id, OWNER)).settings.style).toBeUndefined();
  });

  it("화풍을 바꿔도 비율 같은 다른 설정은 살아남는다", async () => {
    const p = await make();
    await PATCH(patchReq({ settings: { aspect_ratio: "1:1" } }), ctx(p.id));
    await PATCH(patchReq({ settings: { style: { preset: "anime" } } }), ctx(p.id));
    const s = (await getProject(p.id, OWNER)).settings;
    expect(s.aspect_ratio).toBe("1:1");
    expect(s.style.preset).toBe("anime");
  });

  it("화풍을 안 보내는 기존 PATCH 는 그대로 돈다", async () => {
    const p = await make();
    await PATCH(patchReq({ settings: { style: { preset: "scifi" } } }), ctx(p.id));
    await PATCH(patchReq({ settings: { aspect_ratio: "16:9" } }), ctx(p.id));
    // 화풍을 건드리지 않았으니 남아 있어야 한다
    expect((await getProject(p.id, OWNER)).settings.style.preset).toBe("scifi");
  });
});

// 영상 모델은 클립 값을 정한다 — 클립이 한 편에서 가장 비싸다(Seedance 컷당 $1.51).
// 그래서 닫힌 목록이고, 클립이 하나라도 생기면 잠근다.
describe("PATCH /api/projects/[id] — 영상 모델", () => {
  const make = (settings = {}) =>
    createProject({ ownerId: OWNER, settings, material: { text: "가", photos: [] } });

  it("영상 모델은 아는 값만 받는다", async () => {
    const p = await make();
    const res = await PATCH(patchReq({ settings: { i2v_model: "seedance-3" } }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id, OWNER)).settings.i2v_model).toBeUndefined();
  });

  it("만들 때 고른 값이 그대로 저장된다", async () => {
    const p = await make({ i2v_model: "seedance-2.0" });
    expect((await getProject(p.id, OWNER)).settings.i2v_model).toBe("seedance-2.0");
  });

  // ★★ 잠금은 **프로젝트를 만든 순간**이다 — 결제 여부가 아니다.
  //
  // 2026-08-13 사용자 결정: "처음에 선택하면 변경할 수 없는 걸로". 모델은 자료 화면에서
  // 한 번 고르고 만들 때 함께 저장된다(POST /api/projects). 그 뒤 PATCH 로는 못 바꾼다.
  //
  // 왜 결제 시점이 아니라 생성 시점인가: 모델이 정가를 정하는데(videoPrice(seconds, model))
  // 정가는 ③목소리·④이미지에서 걷힌다. "결제 전이면 바꿔도 된다"로 두면 ②대본에서 바꾼
  // 값과 ③에서 걷는 값이 서로 다른 창이 생기고, 만드는 중에 바뀌면 한 편에 두 모델이
  // 섞인다. 차액 정산은 만들지 않는다(청구 장부가 회차·멱등키 기반이라 차액 개념이 없다).
  it("만든 뒤에는 모델을 못 바꾼다 — 결제 전이어도 마찬가지다", async () => {
    const p = await make({ i2v_model: "seedance-2.0" });
    const res = await PATCH(patchReq({ settings: { i2v_model: "kling-v3" } }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id, OWNER)).settings.i2v_model).toBe("seedance-2.0");
  });

  it("정가를 낸 뒤에도 물론 못 바꾼다", async () => {
    await grant();
    const p = await make({ i2v_model: "seedance-2.0", target_seconds: 30 });
    await chargeVideo({ userId: OWNER, projectId: p.id, seconds: 30, model: "seedance-2.0" });
    const res = await PATCH(patchReq({ settings: { i2v_model: "kling-v3" } }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id, OWNER)).settings.i2v_model).toBe("seedance-2.0");
  });

  // 화면이 설정을 통째로 다시 보낼 때 같은 값이 실려 온다 — 그것까지 400 이면 안 된다.
  it("같은 값을 다시 보내는 것은 막지 않는다", async () => {
    const p = await make({ i2v_model: "seedance-2.0" });
    const res = await PATCH(patchReq({ settings: { i2v_model: "seedance-2.0" } }), ctx(p.id));
    expect(res.status ?? 200).toBe(200);
  });

  // 화면이 헛 PATCH 를 보내도 400 이 뜨면 안 된다 — 바꾸는 것이 아니라 같은 값이다.
  it("같은 값을 다시 보내는 것은 낸 뒤에도 통과한다", async () => {
    await grant();
    const p = await make({ i2v_model: "seedance-2.0", target_seconds: 30 });
    await chargeVideo({ userId: OWNER, projectId: p.id, seconds: 30, model: "seedance-2.0" });
    const res = await PATCH(patchReq({ settings: { i2v_model: "seedance-2.0" } }), ctx(p.id));
    expect(res.status ?? 200).toBe(200);
  });

  it("모델을 안 보내는 PATCH 는 클립이 있어도 통과한다", async () => {
    const p = await make();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, cuts: [{ idx: 0, video: { url: "https://x/v.mp4" } }],
    }));
    const res = await PATCH(patchReq({ settings: { aspect_ratio: "9:16" } }), ctx(p.id));
    expect(res.status ?? 200).toBe(200);
    expect((await getProject(p.id, OWNER)).settings.aspect_ratio).toBe("9:16");
  });
});

describe("POST /api/projects — 영상 모델", () => {
  // ★ createProject() 를 직접 부르면 라우트의 명시 저장을 안 거친다 — POST 라우트를 부른다.
  // 값이 없는 것은 "안 골랐다"가 아니라 "이 기능 전에 만들어졌다"는 뜻이어야 한다.
  it("새로 만드는 프로젝트는 기본 모델을 명시 저장한다", async () => {
    const res = await projectsPOST(patchReq({ material: { text: "가" }, settings: { aspect_ratio: "9:16", target_seconds: 30 } }));
    expect(res.status ?? 200).toBe(200);
    expect((await res.json()).settings.i2v_model).toBe("seedance-2.0");
  });

  it("고른 모델이 있으면 그것을 저장한다", async () => {
    const res = await projectsPOST(patchReq({ material: { text: "가" }, settings: { i2v_model: "kling-v3" } }));
    expect((await res.json()).settings.i2v_model).toBe("kling-v3");
  });

  // ★ 모르는 모델을 조용히 기본값으로 접지 않는다 — 길이(target_seconds)와 다르다.
  // 접히는 방향이 하필 **비싼 쪽**(Seedance)이라 오타 하나가 50 크레딧짜리를 160
  // 크레딧짜리로 만들고, 400 을 아무도 못 봤으니 알아챌 방법이 없다.
  // PATCH 는 같은 값에 이미 400 을 준다 — 두 입구가 같은 자를 써야 한다.
  it("모르는 모델은 400 이다 — 조용히 비싼 쪽으로 접지 않는다", async () => {
    const res0 = await projectsPOST(patchReq({ material: { text: "가" }, settings: { i2v_model: "seedance-3" } }));
    expect(res0.status).toBe(400);
    // 값을 아예 안 보내는 것은 정상이다 — 그때만 기본값으로 채운다
    const res = await projectsPOST(patchReq({ material: { text: "가" } }));
    expect((await res.json()).settings.i2v_model).toBe("seedance-2.0");
  });
});

// settings 는 생성 라우트에서 **명시 화이트리스트**다(PATCH 처럼 통짜 머지가 아니다) —
// 목록에 없는 키는 말없이 사라진다. 화질이 그 자리였다: 만들 때 골라 보내도 안 남고,
// 사장님은 720p 로 만들어진 것을 1080p 로 골랐다고 믿는다.
describe("POST /api/projects — 화질", () => {
  it("고른 화질을 settings 에 담아 만든다", async () => {
    const res = await projectsPOST(patchReq({ material: { text: "가" }, settings: { resolution: "1080p" } }));
    expect(res.status ?? 200).toBe(200);
    expect((await res.json()).settings.resolution).toBe("1080p");
  });

  // 검증 없이 통과시키면 모델에 없는 값이 저장되고, 그 값이 그대로 fal 유료 호출로 나가
  // 거절당한다. PATCH 와 같은 자(isResolutionFor)를 쓴다.
  it("모델에 없는 화질은 400 이다", async () => {
    const res = await projectsPOST(patchReq({ material: { text: "가" }, settings: { resolution: "2160p" } }));
    expect(res.status).toBe(400);
  });

  // Kling 에는 resolution 파라미터 자체가 없다 — 함께 보낸 화질은 "아는 값처럼 생긴 값"이다.
  it("화질을 안 여는 모델을 고르면서 화질을 보내면 400 이다", async () => {
    const res = await projectsPOST(patchReq({
      material: { text: "가" }, settings: { i2v_model: "kling-v3", resolution: "720p" },
    }));
    expect(res.status).toBe(400);
  });

  // ★ 안 보내면 아무것도 안 넣는다 — 기본값을 박으면 "미선택"과 "720p 명시"가 구분이 안 된다
  //   (각인이 그 차이를 본다, lib/steps.js).
  it("화질을 안 보내면 settings 에 넣지 않는다", async () => {
    const res = await projectsPOST(patchReq({ material: { text: "가" } }));
    expect((await res.json()).settings).not.toHaveProperty("resolution");
  });
});

// ★ regen 라우트 3개는 리뷰에서 실측으로 드러난 자리다 — pipeline.js 가
// regenCut(projectId, ownerId, idx, deps, instruction) 로 인자가 하나 늘었는데, 이 세
// 라우트는 안 고쳐진 채 옛 자리에 idx 를 넣고 있었다(ownerId 자리에 idx 숫자가 들어가고,
// idx 자리는 비었다). tests/routes.test.js 가 이 라우트들을 한 번도 안 불러 828 그린
// 뒤에도 안 잡혔다 — 여기서 최소 한 번씩 부른다.
describe("POST regen 라우트 — id·ownerId·idx 가 밀리지 않는다", () => {
  it("컷 재생성 — id·ownerId·idx·instruction 순서로 넘긴다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    await grant();
    const res = await cutRegenPOST(patchReq({ instruction: "더 밝게" }), idxCtx(p.id, 0));
    expect(res.status).toBe(200);
    expect(pipelineMock.regen).toHaveBeenCalledWith(p.id, OWNER, 0, undefined, "더 밝게");
  });

  it("목소리 재생성 — id·ownerId·idx 순서로 넘긴다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    await grant();
    const res = await voiceRegenPOST(patchReq({}), idxCtx(p.id, 1));
    expect(res.status).toBe(200);
    expect(pipelineMock.regen).toHaveBeenCalledWith(p.id, OWNER, 1);
  });

  // 말하는 모델에서는 목소리가 클립과 한 몸이라 따로 다시 만들 수 없다.
  // 그 말을 화면에 해 주는 자리가 여기다 — 눌러도 아무 일이 없으면 계속 누른다.
  it("말하는 프로젝트에서 목소리 재생성은 400 이다", async () => {
    const p = await createProject({
      ownerId: OWNER,
      settings: { i2v_model: "seedance-2.0" },
      material: { text: "가", photos: [] },
    });
    await grant();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cast: [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }],
      cuts: [{ idx: 0, sentence: "안녕하세요", seconds: 3 }],
    }));
    const res = await voiceRegenPOST(patchReq({}), idxCtx(p.id, 0));
    expect(res.status).toBe(400);
    expect(pipelineMock.regen).not.toHaveBeenCalled();
  });

  it("클립 재생성 — id·ownerId·idx 순서로 넘긴다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "자료", photos: [] } });
    await grant();
    const res = await clipRegenPOST(patchReq({}), idxCtx(p.id, 2));
    expect(res.status).toBe(200);
    expect(pipelineMock.regen).toHaveBeenCalledWith(p.id, OWNER, 2);
  });
});

// ③목소리 화면의 시작 버튼 — 말하는 프로젝트에서는 살 것이 없다.
// 단계 자체를 없애지는 않는다(Kling 경로가 그대로 쓴다). 여기서는 status 만 넘긴다.
describe("POST /voice — 말하는 프로젝트는 소리를 사지 않는다", () => {
  it("파이프라인을 부르지 않고 status 만 voice 로 넘긴다", async () => {
    const p = await createProject({
      ownerId: OWNER,
      settings: { i2v_model: "seedance-2.0" },
      material: { text: "가", photos: [] },
    });
    await grant();
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "cuts",
      cast: [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }],
      cuts: [{ idx: 0, sentence: "안녕하세요", seconds: 3 }],
    }));
    const res = await voicePOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(pipelineMock.run).not.toHaveBeenCalled();
    // 다음 화면(④이미지)이 열리는 유일한 신호다(lib/steps.js currentStepKey)
    expect((await getProject(p.id, OWNER)).status).toBe("voice");
  });
});

// 낭독이 있어야 컷 길이가 확정되므로 ④이미지·⑤클립은 소리를 먼저 요구한다.
// 말하는 모델에는 그 소리가 아예 없다(클립이 만든다) — 그 자리에서 흐름이 갇혔다.
describe("말하는 프로젝트는 목소리 없이도 다음 단계로 간다", () => {
  const CAST = [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }];
  const CUTS = [{ idx: 0, sentence: "안녕하세요", seconds: 3, state: "done" }];

  async function make(model, extra = {}) {
    const p = await createProject({
      ownerId: OWNER, settings: { i2v_model: model }, material: { text: "가", photos: [] },
    });
    await grant();
    return updateProject(p.id, OWNER, (proj) => ({
      ...proj, status: "voice", cast: CAST, cuts: CUTS, ...extra,
    }));
  }

  it("④이미지 — 말하는 프로젝트는 통과한다", async () => {
    const p = await make("seedance-2.0");
    expect((await imagesPOST(patchReq({}), ctx(p.id))).status).toBe(200);
  });

  // ★ Kling 은 그대로다 — 소리 없이 그림 값을 치르면 안 된다
  it("④이미지 — 말하지 않는 프로젝트는 여전히 400 이다", async () => {
    const p = await make("kling-v3");
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/목소리/);
  });

  it("⑤클립 — 말하는 프로젝트는 통과한다", async () => {
    const p = await make("seedance-2.0", {
      cuts: CUTS.map((c) => ({ ...c, image: { url: "http://img/1" } })),
    });
    expect((await clipsPOST(patchReq({}), ctx(p.id))).status).toBe(200);
  });

  it("⑤클립 — 말하지 않는 프로젝트는 여전히 400 이다", async () => {
    const p = await make("kling-v3", {
      cuts: CUTS.map((c) => ({ ...c, image: { url: "http://img/1" } })),
    });
    const res = await clipsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/목소리/);
  });
});
