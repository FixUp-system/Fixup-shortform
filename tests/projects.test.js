import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

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
