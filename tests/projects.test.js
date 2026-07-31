import { describe, it, expect, beforeEach } from "vitest";
import { getStore } from "../lib/store/index.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import * as projects from "../lib/projects.js";

const OWNER = "11111111-1111-1111-1111-111111111111";

// 동적 import(`?t=` + timestamp)는 더 이상 필요 없다. 예전에는 모듈 스코프의 locks Map 을
// 새로 만들기 위한 것이었는데, 낙관적 락으로 바뀌며 그 Map 이 사라졌다.
beforeEach(() => {
  resetMemoryStore();
});

describe("projects store", () => {
  it("createProject는 id·status·created_ts를 부여한다", async () => {
    const p = await projects.createProject({ ownerId: OWNER,
      settings: { aspect_ratio: "9:16" },
      material: { text: "딸기라떼", photos: [] },
    });
    expect(p.id).toMatch(/^[a-z0-9-]+$/);
    expect(p.status).toBe("draft");
    expect(p.settings.aspect_ratio).toBe("9:16");
    expect(p.briefing).toBeNull();
  });

  it("getProject는 저장된 프로젝트를 돌려주고, 없으면 null", async () => {
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: { text: "", photos: [] } });
    expect((await projects.getProject(p.id, OWNER)).id).toBe(p.id);
    expect(await projects.getProject("없는-id", OWNER)).toBeNull();
  });

  it("updateProject는 patchFn 결과를 저장한다", async () => {
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: { text: "", photos: [] } });
    const upd = await projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "script" }));
    expect(upd.status).toBe("script");
    expect((await projects.getProject(p.id, OWNER)).status).toBe("script");
  });
});

describe("낙관적 락", () => {
  it("동시 갱신 둘이 모두 반영된다 — 하나가 사라지지 않는다", async () => {
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });
    await projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, cuts: [{ idx: 0 }, { idx: 1 }] }));

    // 컷 0 과 컷 1 을 동시에 갱신한다 — 파이프라인의 Promise.all 과 같은 모양이다
    await Promise.all([
      projects.updateProject(p.id, OWNER, (proj) => ({
        ...proj,
        cuts: proj.cuts.map((c) => (c.idx === 0 ? { ...c, state: "done" } : c)),
      })),
      projects.updateProject(p.id, OWNER, (proj) => ({
        ...proj,
        cuts: proj.cuts.map((c) => (c.idx === 1 ? { ...c, state: "done" } : c)),
      })),
    ]);

    const after = await projects.getProject(p.id, OWNER);
    expect(after.cuts[0].state).toBe("done");
    expect(after.cuts[1].state).toBe("done"); // 덮어쓰기가 없었다
  });

  it("없는 프로젝트를 갱신하면 던진다", async () => {
    await expect(projects.updateProject("없는-id", OWNER, (p) => p)).rejects.toThrow("찾을 수 없어요");
  });

  it("재시도를 소진하면 던진다 — 조용히 성공한 척하지 않는다", async () => {
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });
    const store = getStore();
    const real = store.updateProjectRow;
    store.updateProjectRow = async () => false; // 매번 진다
    try {
      await expect(projects.updateProject(p.id, OWNER, (proj) => proj)).rejects.toThrow("충돌");
    } finally {
      store.updateProjectRow = real;
    }
  });

  it("같은 프로젝트의 저장은 줄을 선다 — 겹치지 않으니 진 시도가 없다", async () => {
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });
    await projects.updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: Array.from({ length: 12 }, (_, i) => ({ idx: i })),
    }));

    const store = getStore();
    const real = store.updateProjectRow.bind(store);
    let calls = 0;
    store.updateProjectRow = async (...a) => { calls++; return real(...a); };
    try {
      await Promise.all(Array.from({ length: 12 }, (_, i) =>
        projects.updateProject(p.id, OWNER, (proj) => ({
          ...proj,
          cuts: proj.cuts.map((c) => (c.idx === i ? { ...c, state: "done" } : c)),
        })),
      ));
    } finally {
      store.updateProjectRow = real;
    }

    const after = await projects.getProject(p.id, OWNER);
    expect(after.cuts.filter((c) => c.state === "done")).toHaveLength(12);
    // 12번 시도해 12번 다 이겼다 — 재시도(=진 횟수)가 0이다.
    expect(calls).toBe(12);
  });

  it("서로 다른 프로젝트는 줄이 따로다 — 같이 흐른다", async () => {
    const a = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });
    const b = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });

    // a 의 저장을 붙잡아 둔 채로도 b 는 끝나야 한다 — 줄이 하나뿐이면 b 가 같이 멈춘다.
    const store = getStore();
    const real = store.updateProjectRow.bind(store);
    let releaseA;
    const heldA = new Promise((r) => { releaseA = r; });
    store.updateProjectRow = async (id, ...rest) => {
      if (id === a.id) await heldA;
      return real(id, ...rest);
    };
    try {
      const pendingA = projects.updateProject(a.id, OWNER, (proj) => ({ ...proj, status: "script" }));
      await projects.updateProject(b.id, OWNER, (proj) => ({ ...proj, status: "voice" }));
      expect((await projects.getProject(b.id, OWNER)).status).toBe("voice");
      releaseA();
      await pendingA;
    } finally {
      store.updateProjectRow = real;
    }
  });

  it("patchFn 이 던져도 줄이 막히지 않는다 — 다음 대기자가 들어간다", async () => {
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });
    const boom = projects.updateProject(p.id, OWNER, () => { throw new Error("펑"); });
    const next = projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "cuts" }));
    await expect(boom).rejects.toThrow("펑");
    await expect(next).resolves.toMatchObject({ status: "cuts" });
  });

  it("재시도가 소진돼도 줄이 막히지 않는다 — 다음 대기자가 들어간다", async () => {
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });
    const store = getStore();
    const real = store.updateProjectRow.bind(store);
    store.updateProjectRow = async () => false; // 앞사람은 5회를 다 쓰고 진다
    const doomed = projects.updateProject(p.id, OWNER, (proj) => proj);
    const next = projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "images" }));
    await expect(doomed).rejects.toThrow("충돌");
    // 여기서 되돌려도 뒷사람에게 통한다 — 뒷사람 task 는 이미 시작했지만,
    // updateProjectNow 가 await store.selectProject(...) 로 한 번 양보한 **뒤에야**
    // store.updateProjectRow 를 프로퍼티로 조회하기 때문이다. (결정적이라 플레이크는
    // 아니지만 구현 내부 순서에 기대고 있다 — 그 순서가 바뀌면 이 테스트부터 손봐야 한다.)
    store.updateProjectRow = real;
    await expect(next).resolves.toMatchObject({ status: "images" });
  });

  // ★ 이 테스트가 지키는 것은 writeQueues 의 **삭제 조건**(내가 꼬리일 때만 지운다)이다.
  // 무조건 삭제로 바꾸면 여기서만 빨간불이 된다:
  //   A·B 를 순서대로 넣는다 → A 완료(무조건 삭제면 이때 항목이 사라진다)
  //   → B 가 아직 도는 중에 C 를 넣는다 → C 의 prev 가 Promise.resolve() 가 되어
  //     B 와 C 가 동시에 나간다(줄이 끊겼다).
  // "12개 동시" 테스트는 12개가 같은 tick 에 한꺼번에 붙어 삭제가 끼어들 틈이 없고,
  // "Map 이 비워진다" 테스트는 늦게 붙는 대기자가 없어 둘 다 이 결함을 못 잡는다.
  it("앞이 끝난 뒤 늦게 붙는 대기자도 줄 뒤에 선다 — 동시에 두 개가 나가지 않는다", async () => {
    const p = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });
    const store = getStore();
    const real = store.updateProjectRow.bind(store);

    // 라벨(=doc.status)마다 문을 하나 둔다. "도착했다"와 "열어 준다"를 따로 잡아야
    // 늦게 붙는 C 를 정확히 "B 가 도는 중"인 순간에 끼워 넣을 수 있다.
    const gate = () => {
      let open, arrive;
      const opened = new Promise((r) => { open = r; });
      const arrived = new Promise((r) => { arrive = r; });
      return { opened, open, arrived, arrive };
    };
    const g = { A: gate(), B: gate(), C: gate() };

    let inFlight = 0;
    let maxInFlight = 0;
    store.updateProjectRow = async (id, version, doc) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      g[doc.status].arrive();
      await g[doc.status].opened;
      try {
        return await real(id, version, doc);
      } finally {
        inFlight--;
      }
    };

    try {
      const A = projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "A" }));
      const B = projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "B" }));

      g.A.open();
      await A;
      await new Promise((r) => setTimeout(r, 0)); // 정리 마이크로태스크가 돌 틈을 준다
      await g.B.arrived; // B 는 지금 문 앞에 잡혀 **도는 중**이다

      const C = projects.updateProject(p.id, OWNER, (proj) => ({ ...proj, status: "C" }));
      await new Promise((r) => setTimeout(r, 0)); // 줄이 끊겼다면 C 가 여기서 같이 나간다

      g.B.open();
      g.C.open();
      await Promise.all([B, C]);
      expect(maxInFlight).toBe(1);
      expect((await projects.getProject(p.id, OWNER)).status).toBe("C");
    } finally {
      store.updateProjectRow = real;
    }
  });

  it("줄이 다 빠지면 Map 이 비워진다 — 옛 락처럼 영구 누적되지 않는다", async () => {
    const a = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });
    const b = await projects.createProject({ ownerId: OWNER, settings: {}, material: {} });
    await Promise.all([
      projects.updateProject(a.id, OWNER, (proj) => ({ ...proj, status: "script" })),
      projects.updateProject(a.id, OWNER, (proj) => ({ ...proj, status: "cuts" })),
      projects.updateProject(b.id, OWNER, (proj) => ({ ...proj, status: "voice" })),
      projects.updateProject(b.id, OWNER, () => { throw new Error("펑"); }).catch(() => {}),
    ]);
    await new Promise((r) => setTimeout(r, 0)); // 마지막 정리 마이크로태스크를 흘려보낸다
    expect(projects._writeQueueSize()).toBe(0);
  });

  it("저장소 오류는 '없음'으로 뭉개지 않는다 — 그대로 던진다", async () => {
    const store = getStore();
    const real = store.selectProject;
    store.selectProject = async () => { throw new Error("연결이 끊겼어요"); };
    try {
      await expect(projects.getProject("아무거나", OWNER)).rejects.toThrow("연결이 끊겼어요");
    } finally {
      store.selectProject = real;
    }
  });
});
