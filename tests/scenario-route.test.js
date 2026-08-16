import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, getProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

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
  });

  it("★ 만들지 못하면 502 다", async () => {
    gen.run.mockResolvedValue({ scenario: null, problems: ["형식이 맞지 않았어요."], calls: 2 });
    expect((await POST(req(), { params: Promise.resolve({ id }) })).status).toBe(502);
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

  it("규칙을 지키면 확정된다", async () => {
    const res = await PATCH(patch({ scenario: good, confirmed: true }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await getProject(id, OWNER)).scenario.confirmed).toBe(true);
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
});
