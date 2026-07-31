import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { getStore } from "../lib/store/index.js";

let projects;

describe("projects store", () => {
  beforeEach(async () => {
    process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-"));
    // env 반영을 위해 매번 새로 import
    projects = await import("../lib/projects.js?t=" + Date.now());
  });

  it("createProject는 id·status·created_ts를 부여한다", async () => {
    const p = await projects.createProject({
      settings: { aspect_ratio: "9:16" },
      material: { text: "딸기라떼", photos: [] },
    });
    expect(p.id).toMatch(/^[a-z0-9-]+$/);
    expect(p.status).toBe("draft");
    expect(p.settings.aspect_ratio).toBe("9:16");
    expect(p.briefing).toBeNull();
  });

  it("getProject는 저장된 프로젝트를 돌려주고, 없으면 null", async () => {
    const p = await projects.createProject({ settings: {}, material: { text: "", photos: [] } });
    expect((await projects.getProject(p.id)).id).toBe(p.id);
    expect(await projects.getProject("없는-id")).toBeNull();
  });

  it("updateProject는 patchFn 결과를 저장한다", async () => {
    const p = await projects.createProject({ settings: {}, material: { text: "", photos: [] } });
    const upd = await projects.updateProject(p.id, (proj) => ({ ...proj, status: "script" }));
    expect(upd.status).toBe("script");
    expect((await projects.getProject(p.id)).status).toBe("script");
  });
});

describe("낙관적 락", () => {
  it("동시 갱신 둘이 모두 반영된다 — 하나가 사라지지 않는다", async () => {
    const p = await projects.createProject({ settings: {}, material: {} });
    await projects.updateProject(p.id, (proj) => ({ ...proj, cuts: [{ idx: 0 }, { idx: 1 }] }));

    // 컷 0 과 컷 1 을 동시에 갱신한다 — 파이프라인의 Promise.all 과 같은 모양이다
    await Promise.all([
      projects.updateProject(p.id, (proj) => ({
        ...proj,
        cuts: proj.cuts.map((c) => (c.idx === 0 ? { ...c, state: "done" } : c)),
      })),
      projects.updateProject(p.id, (proj) => ({
        ...proj,
        cuts: proj.cuts.map((c) => (c.idx === 1 ? { ...c, state: "done" } : c)),
      })),
    ]);

    const after = await projects.getProject(p.id);
    expect(after.cuts[0].state).toBe("done");
    expect(after.cuts[1].state).toBe("done"); // 덮어쓰기가 없었다
  });

  it("없는 프로젝트를 갱신하면 던진다", async () => {
    await expect(projects.updateProject("없는-id", (p) => p)).rejects.toThrow("찾을 수 없어요");
  });

  it("재시도를 소진하면 던진다 — 조용히 성공한 척하지 않는다", async () => {
    const p = await projects.createProject({ settings: {}, material: {} });
    const store = getStore();
    const real = store.updateProjectRow;
    store.updateProjectRow = async () => false; // 매번 진다
    try {
      await expect(projects.updateProject(p.id, (proj) => proj)).rejects.toThrow("충돌");
    } finally {
      store.updateProjectRow = real;
    }
  });

  it("저장소 오류는 '없음'으로 뭉개지 않는다 — 그대로 던진다", async () => {
    const store = getStore();
    const real = store.selectProject;
    store.selectProject = async () => { throw new Error("연결이 끊겼어요"); };
    try {
      await expect(projects.getProject("아무거나")).rejects.toThrow("연결이 끊겼어요");
    } finally {
      store.selectProject = real;
    }
  });
});
