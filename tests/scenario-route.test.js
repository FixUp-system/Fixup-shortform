import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, getProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { BudgetExceeded } from "../lib/costs.js";

const OWNER = "44444444-4444-4444-4444-444444444444";
const AUTH = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };

const gen = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../lib/scenario.js", async (orig) => ({
  ...(await orig()),
  generateScenario: (...a) => gen.run(...a),
}));

const { POST, PATCH } = await import("../app/api/projects/[id]/scenario/route.js");

const shot = (seconds, line = "오늘도 문을 엽니다.") => ({ beat: "문을 연다", line, speaker: "20대 여성 바리스타", seconds });
const good = { topic: "카페", focus: { mode: "물건", subject: "커피" }, angle: "아침", shots: [shot(8), shot(8), shot(8), shot(6)] };

const req = (body) => new Request("http://x", {
  method: "POST", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify(body || {}),
});

let id;
beforeEach(async () => {
  resetMemoryStore();
  gen.run.mockReset();
  const p = await createProject({
    settings: { i2v_model: "seedance-2.0", target_seconds: 30 },
    material: { text: "동네 카페 소개", photos: [] },
    ownerId: OWNER,
  });
  id = p.id;
});

describe("POST /scenario", () => {
  it("시나리오를 만들어 저장한다", async () => {
    gen.run.mockResolvedValue({ scenario: good, problems: [], calls: 1 });
    const res = await POST(req(), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scenario.shots).toHaveLength(4);
    expect(body.problems).toEqual([]);
    expect((await getProject(id, OWNER)).scenario.confirmed).toBe(false);
  });

  it("★ 규칙에 걸린 시나리오도 저장하고 problems 를 함께 준다", async () => {
    const bad = { ...good, shots: [shot(8), shot(8), shot(5), shot(4)] };
    gen.run.mockResolvedValue({ scenario: bad, problems: ["장면 초의 합이 25초예요 — 30초에 맞춰 주세요."], calls: 2 });
    const res = await POST(req(), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).problems[0]).toContain("25");
    // 사유만 돌려주고 저장은 안 하면 사장님은 고칠 것을 화면에서 못 연다 — 저장까지가 계약이다
    expect((await getProject(id, OWNER)).scenario.shots).toHaveLength(4);
  });

  it("★ 만들지 못하면 502 다 — 그리고 아무것도 안 쓴다", async () => {
    gen.run.mockResolvedValue({ scenario: null, problems: ["형식이 맞지 않았어요."], calls: 2 });
    expect((await POST(req(), { params: Promise.resolve({ id }) })).status).toBe(502);
    // 실패한 회차가 문서에 무엇이든 남기면 다음 단계가 그것을 시나리오로 읽는다
    expect((await getProject(id, OWNER)).scenario).toBeFalsy();
  });

  // ★ 사진 판정값(2026-08-18) — generateScenario 가 사진을 읽었으면 그 값을 문서에 남긴다.
  //   안 남기면 다시 쓸 때마다 같은 사진을 또 읽어 사진당 값이 또 든다(gpt-4o 비전 호출).
  it("★ 읽은 사진값(vision)을 문서에 남긴다", async () => {
    const vision = { person: false, what: "가방에 달린 보라색 토끼 인형", who: null, lettering: "" };
    gen.run.mockResolvedValue({
      scenario: good, problems: [], calls: 1,
      photos: [{ id: "p1", filename: "bunny.jpg", url: "/api/uploads/b.jpg", vision }],
    });
    await POST(req(), { params: Promise.resolve({ id }) });
    expect((await getProject(id, OWNER)).material.photos[0].vision).toEqual(vision);
  });

  it("읽은 사진이 없으면 material 을 건드리지 않는다", async () => {
    gen.run.mockResolvedValue({ scenario: good, problems: [], calls: 1 });
    await POST(req(), { params: Promise.resolve({ id }) });
    const saved = await getProject(id, OWNER);
    expect(saved.material.photos).toEqual([]);
    expect(saved.material.text).toBe("동네 카페 소개");
  });

  it("★ LLM 이 던지면 502 다 — 프레임워크 500 이 아니라 사장님 말로 답한다", async () => {
    gen.run.mockRejectedValue(new Error("fetch failed"));
    const res = await POST(req(), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("다시 시도해");
  });

  it("★ 예산 오류는 삼키지 않는다 — withUser 가 402 로 바꿔야 한다", async () => {
    gen.run.mockRejectedValue(new BudgetExceeded(1, 1, "user"));
    expect((await POST(req(), { params: Promise.resolve({ id }) })).status).toBe(402);
  });

  it("자료가 없으면 400 이다", async () => {
    const p = await createProject({ settings: {}, material: { text: "  ", photos: [] }, ownerId: OWNER });
    expect((await POST(req(), { params: Promise.resolve({ id: p.id }) })).status).toBe(400);
  });
});

describe("PATCH /scenario", () => {
  const patch = (body) => new Request("http://x", {
    method: "PATCH", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify(body),
  });

  it("★ 규칙에 걸려도 저장한다 — 고치는 중일 수 있다", async () => {
    const bad = { ...good, shots: [shot(8), shot(8), shot(5), shot(4)] };
    const res = await PATCH(patch({ scenario: bad }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).problems.length).toBeGreaterThan(0);
    expect((await getProject(id, OWNER)).scenario.shots).toHaveLength(4);
  });

  it("★ 확정은 규칙을 지켜야 한다 — 걸리면 400", async () => {
    const bad = { ...good, shots: [shot(8), shot(8), shot(5), shot(4)] };
    const res = await PATCH(patch({ scenario: bad, confirmed: true }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(400);
    expect((await getProject(id, OWNER)).scenario?.confirmed).toBeFalsy();
  });

  it("★ 길이를 안 고른 프로젝트는 확정할 수 없다 — ok:true 가 안전과 같지 않다", async () => {
    const p = await createProject({ settings: { i2v_model: "seedance-2.0" }, material: { text: "동네 카페 소개", photos: [] }, ownerId: OWNER });
    // checkScenario 는 목표가 없으면 합·개수를 안 재므로 ok:true 다 — 그래도 막혀야 한다
    const res = await PATCH(patch({ scenario: good, confirmed: true }), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("길이");
    expect((await getProject(p.id, OWNER)).scenario?.confirmed).toBeFalsy();
  });

  it("시나리오 모양이 아니면 400 이다", async () => {
    const res = await PATCH(patch({ scenario: { shots: "여덟" } }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(400);
    expect((await getProject(id, OWNER)).scenario).toBeFalsy();
  });

  it("규칙을 지키면 확정된다", async () => {
    const res = await PATCH(patch({ scenario: good, confirmed: true }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await getProject(id, OWNER)).scenario.confirmed).toBe(true);
  });

  // ★ 고치면 확정이 풀려야 한다 — 안 풀면 사장님이 통과한 시나리오를 확정한 뒤 깨진 것으로
  //   갈아끼울 수 있고, 그 깨진 것이 확정된 채 돈 나가는 단계로 흘러간다
  it("★ 확정한 뒤 다시 고치면 확정이 풀린다", async () => {
    await PATCH(patch({ scenario: good, confirmed: true }), { params: Promise.resolve({ id }) });
    expect((await getProject(id, OWNER)).scenario.confirmed).toBe(true);
    const bad = { ...good, shots: [shot(8), shot(8), shot(5), shot(4)] };
    const res = await PATCH(patch({ scenario: bad }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await getProject(id, OWNER)).scenario.confirmed).toBe(false);
  });

  // ★ "고칠 수 있는 척하는 칸"을 막는다 — 화면에 칸이 있는데 라우트가 그 필드를 버리면
  //   사장님은 고쳤다고 믿고 다음 단계에서 돈을 낸다
  it("★ 사장님이 고친 네 필드가 전부 저장된다", async () => {
    const edited = {
      ...good,
      angle: "저녁의 마감으로 바꾼다",
      shots: [{ beat: "불을 끈다", line: "하루를 닫습니다.", speaker: "40대 남성 사장", seconds: 30 }],
    };
    await PATCH(patch({ scenario: edited }), { params: Promise.resolve({ id }) });
    const saved = (await getProject(id, OWNER)).scenario;
    expect(saved.angle).toBe("저녁의 마감으로 바꾼다");
    expect(saved.shots[0].beat).toBe("불을 끈다");
    expect(saved.shots[0].line).toBe("하루를 닫습니다.");
    expect(saved.shots[0].speaker).toBe("40대 남성 사장");
    expect(saved.shots[0].seconds).toBe(30);
  });

  // ★★ 2026-08-17 — 화면에 칸을 하나 더 놓았다(내레이터 목소리). 같은 함정을 다시 파지
  //    않으려면 **왕복**을 여기서 못 박아야 한다: 화면이 보낸 값이 문서에 남고, 그 값이
  //    클립 프롬프트까지 간다(lib/cuts.js speechFor). 라우트가 버리면 사장님은 목소리를
  //    고쳤다고 믿고 ⑤에서 컷마다 다른 사람이 읽는 영상을 산다.
  it("★ 내레이터 목소리도 왕복한다", async () => {
    const narrated = {
      ...good,
      narrator_voice: "차분한 30대 남성, 낮고 단단한 톤",
      shots: [{ beat: "문을 연다", line: "하루를 엽니다.", speaker: "내레이션", seconds: 30 }],
    };
    const res = await PATCH(patch({ scenario: narrated }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).scenario.narrator_voice).toBe("차분한 30대 남성, 낮고 단단한 톤");
    expect((await getProject(id, OWNER)).scenario.narrator_voice).toBe("차분한 30대 남성, 낮고 단단한 톤");
  });

  // ★ 내레이션이 있는데 목소리가 비면 **확정**이 막힌다(저장은 된다 — 고치는 도중이니까).
  it("★ 내레이터 목소리가 비면 확정할 수 없다", async () => {
    const narrated = {
      ...good,
      narrator_voice: "",
      shots: [{ beat: "문을 연다", line: "하루를 엽니다.", speaker: "내레이션", seconds: 30 }],
    };
    const blocked = await PATCH(patch({ scenario: narrated, confirmed: true }), { params: Promise.resolve({ id }) });
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error).toContain("내레이터 목소리");
    // 임시저장은 된다 — 한 자리에서 다 맞추지 못해도 고친 것이 남아야 한다
    expect((await PATCH(patch({ scenario: narrated }), { params: Promise.resolve({ id }) })).status).toBe(200);
  });
});
