// 예산 오류가 프레임워크 500 으로 새면 사장님은 "왜 안 되지"만 본다.
// withUser 한 곳에서 옮긴다 — 라우트마다 붙이면 새 라우트에서 또 빠뜨린다.
//
// 아랫절들은 **withUser 보다 안쪽에서 예산 오류를 삼키던 자리**를 못 박는다.
// 위의 그물만으로는 아무것도 안 잡혔다 — 오늘 BudgetExceeded 를 던지는 자리가 전부
// 안쪽 catch 뒤에 있었기 때문이다(재생성 3종의 400, 생성 라우트들의 502).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { withUser } from "../lib/auth/require-user.js";
import { BudgetExceeded } from "../lib/costs.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import * as projects from "../lib/projects.js";

// 재생성 3종은 파이프라인을 모킹한다 — 볼 것은 "던진 예산 오류가 어떤 코드로 나가는가"다.
const pipelineMock = vi.hoisted(() => ({ regen: vi.fn() }));
vi.mock("../lib/pipeline.js", () => ({
  regenCut: (...a) => pipelineMock.regen(...a),
  regenVoice: (...a) => pipelineMock.regen(...a),
  regenClip: (...a) => pipelineMock.regen(...a),
}));
// 시나리오 라우트는 llm 만 모킹한다 — 생성 루프(lib/scenario.js)는 **진짜**로 둔다.
const llmMock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../lib/llm.js", () => ({ callJson: (...a) => llmMock.call(...a) }));

const { POST: cutRegenPOST } = await import("../app/api/projects/[id]/cuts/[idx]/regen/route.js");
const { POST: voiceRegenPOST } = await import("../app/api/projects/[id]/voice/[idx]/regen/route.js");
const { POST: clipRegenPOST } = await import("../app/api/projects/[id]/clips/[idx]/regen/route.js");
const { POST: scenarioPOST } = await import("../app/api/projects/[id]/scenario/route.js");
const { POST: briefingPOST } = await import("../app/api/projects/[id]/briefing/route.js");

const req = () =>
  new Request("http://localhost/api/x", {
    headers: {
      [USER_HEADER]: "00000000-0000-4000-8000-00000000000a",
      [STATUS_HEADER]: "approved",
      [ROLE_HEADER]: "user",
    },
  });

const throwing = (scope) =>
  withUser(async () => { throw new BudgetExceeded(1, 2, scope); });

describe("withUser 가 예산 오류를 옮긴다", () => {
  it("체험 한도는 402 다 — 사장님이 할 일이 있다(크레딧 받기)", async () => {
    const res = await throwing("trial")(req(), {});
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/체험/);
  });

  it("잔액 부족도 402 다", async () => {
    expect((await throwing("user")(req(), {})).status).toBe(402);
  });

  // 전역 상한은 우리 안전핀이다 — 사장님 잘못이 아니니 402 로 말하면 안 된다.
  it("우리 안전핀은 503 이다", async () => {
    expect((await throwing("total")(req(), {})).status).toBe(503);
  });

  it("예산과 무관한 오류는 그대로 던진다 — 조용히 402 로 뭉개지 않는다", async () => {
    const boom = withUser(async () => { throw new Error("펑"); });
    await expect(boom(req(), {})).rejects.toThrow("펑");
  });

  it("정상 응답은 그대로 지나간다", async () => {
    const ok = withUser(async () => Response.json({ ok: true }));
    expect((await ok(req(), {})).status).toBe(200);
  });
});

// ── 여기부터: 안쪽 catch 가 예산 오류를 먼저 삼키던 자리 ─────────────────────────
const A = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const ORIG = { ...process.env };
const restore = (k) => {
  if (ORIG[k] === undefined) delete process.env[k];
  else process.env[k] = ORIG[k];
};
const headers = () => ({
  [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
  "content-type": "application/json",
});
const post = (url) => new Request(url, { method: "POST", headers: headers(), body: "{}" });
const idxCtx = (id) => ({ params: Promise.resolve({ id, idx: "0" }) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const grant = (n) =>
  getStore().insertGrant({ user_id: A, amount_credits: n, reason: "충전", granted_by: ADMIN });

describe("재생성 3종 — 예산 오류는 400 이 아니다", () => {
  beforeEach(() => {
    resetMemoryStore();
    vi.clearAllMocks();
    delete process.env.SHOTFORM_FAKE;
    delete process.env.SHOTFORM_FAKE_IMAGES;
  });
  afterEach(() => { restore("SHOTFORM_FAKE"); restore("SHOTFORM_FAKE_IMAGES"); });

  async function projectWithCut() {
    const p = await projects.createProject({
      ownerId: A,
      settings: { aspect_ratio: "9:16", target_seconds: 30 },
      material: { text: "자료", photos: [] },
    });
    await grant(500);
    return projects.updateProject(p.id, A, (proj) => ({
      ...proj, status: "clip",
      cuts: [{ idx: 0, text: "한 문장.", seconds: 3, audio: { url: "/a.mp3", seconds: 3 } }],
    }));
  }

  const routes = [
    ["컷 이미지", cutRegenPOST, "cuts/0/regen"],
    ["목소리", voiceRegenPOST, "voice/0/regen"],
    ["클립", clipRegenPOST, "clips/0/regen"],
  ];

  // 전역 상한은 우리 안전핀이다 — 400 "만들지 못했어요"로 나가면 사장님은
  // 몇 번이고 다시 누른다. withUser 까지 올라가 503 이 돼야 한다.
  for (const [name, POST, path] of routes) {
    it(`${name} 재생성 — 예산 오류는 503 이다`, async () => {
      const p = await projectWithCut();
      pipelineMock.regen.mockRejectedValue(new BudgetExceeded(301, 300, "total"));
      const res = await POST(post(`http://localhost/api/projects/${p.id}/${path}`), idxCtx(p.id));
      expect(res.status).toBe(503);
    });

    // 여기서 너무 넓게 열면 진짜 사고가 503 으로 뭉개진다 — 기존 400 계약은 그대로다.
    it(`${name} 재생성 — 예산과 무관한 실패는 여전히 400 이다`, async () => {
      const p = await projectWithCut();
      pipelineMock.regen.mockRejectedValue(new Error("만들지 못했어요"));
      const res = await POST(post(`http://localhost/api/projects/${p.id}/${path}`), idxCtx(p.id));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("만들지 못했어요");
    });
  }
});

// 시나리오 라우트는 실패를 통째 502 "시나리오를 만들지 못했어요"로 답한다.
// 그 catch 가 예산 오류까지 샯키면 체험 한도에 걸린 사장님은 이유를 모른 채 계속 다시 누른다.
// (2026-08-16 이전에는 같은 자리가 ②대본이었다 — lib/script-gen.js 의 세 catch.)
describe("시나리오 생성 — 예산 오류는 삼키지 않는다", () => {
  let project;

  beforeEach(async () => {
    resetMemoryStore();
    vi.clearAllMocks();
    project = await projects.createProject({
      ownerId: A,
      settings: { aspect_ratio: "9:16", target_seconds: 30 },
      material: { text: "성수동 수선집. 신메뉴 출시.", photos: [] },
    });
    await grant(500);
  });

  const budget = () => new BudgetExceeded(1, 1, "trial");

  it("라우트까지 보면 502 가 아니라 402 다", async () => {
    llmMock.call.mockImplementation(() => { throw budget(); });
    const res = await scenarioPOST(post(`http://localhost/api/projects/${project.id}/scenario`), ctx(project.id));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/체험/);
  });

  it("라우트의 502 계약은 예산과 무관한 실패에서 그대로다", async () => {
    llmMock.call.mockImplementation(() => { throw new Error("일시적 실패"); });
    const res = await scenarioPOST(post(`http://localhost/api/projects/${project.id}/scenario`), ctx(project.id));
    expect(res.status).toBe(502);
  });
});


// ★ 브리핑이 시나리오보다 **먼저**다 — 체험 사장님이 밟는 첫 LLM 호출이라, 여기서 502 가
// 나오면 한도 안내(402)를 **아무도 못 본다**. 추출 루프(lib/briefing-extract.js)와
// 소재 질문 루프(이 라우트 안)가 같은 모양의 삼키는 catch 였다.
describe("브리핑 — 예산 오류는 502 가 아니다", () => {
  const budget = () => new BudgetExceeded(1, 1, "trial");
  let project;

  beforeEach(async () => {
    resetMemoryStore();
    vi.clearAllMocks();
    project = await projects.createProject({
      ownerId: A,
      settings: { aspect_ratio: "9:16", target_seconds: 30 },
      material: { text: "성수동 수선집. 신메뉴 출시.", photos: [] },
    });
    await grant(500);
  });

  it("자료 정리에서 나면 402 다", async () => {
    llmMock.call.mockImplementation(() => { throw budget(); });
    const res = await briefingPOST(post(`http://localhost/api/projects/${project.id}/briefing`), ctx(project.id));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/체험/);
  });

  // (소재 질문 루프는 2026-08-16 에 사라졌다 — ①자료가 되묻지 않는다. 남은 삼키는 catch 는
  //  추출 루프 하나이고 위 테스트가 그것을 잰다)

  // 502 계약은 그대로 둔다 — 일시적 호출 실패까지 402 로 만들면 안 된다.
  it("예산과 무관한 실패는 여전히 502 다", async () => {
    llmMock.call.mockImplementation(() => { throw new Error("일시적 실패"); });
    const res = await briefingPOST(post(`http://localhost/api/projects/${project.id}/briefing`), ctx(project.id));
    expect(res.status).toBe(502);
  });
});
