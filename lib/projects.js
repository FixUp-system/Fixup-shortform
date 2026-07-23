// 프로젝트 파일 저장소 — 실험 단계용. 배포 시 Supabase 이관.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

function dataDir() {
  return process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data");
}
function projPath(id) {
  // path traversal 방지: id는 UUID 형식만 허용
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("잘못된 프로젝트 id");
  return path.join(dataDir(), "projects", `${id}.json`);
}

export async function createProject({ settings, material }) {
  const project = {
    id: randomUUID(),
    created_ts: Date.now(),
    status: "draft", // draft → script → cuts
    settings: settings || {},
    material: material || { text: "", photos: [] },
    script: null,
    cuts: [],
  };
  await fs.mkdir(path.dirname(projPath(project.id)), { recursive: true });
  await fs.writeFile(projPath(project.id), JSON.stringify(project, null, 2), "utf8");
  return project;
}

export async function getProject(id) {
  try {
    return JSON.parse(await fs.readFile(projPath(id), "utf8"));
  } catch {
    return null;
  }
}

// 프로젝트 파일은 read-modify-write 라 동시 갱신을 프로젝트별로 직렬화 (lost update·파일 깨짐 방지)
const locks = new Map();
function withProjectLock(projectId, fn) {
  const prev = locks.get(projectId) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    projectId,
    next.catch(() => {})
  );
  return next;
}

export async function updateProject(id, patchFn) {
  return withProjectLock(id, async () => {
    const proj = await getProject(id);
    if (!proj) throw new Error("프로젝트를 찾을 수 없어요");
    const next = patchFn(proj);
    await fs.writeFile(projPath(id), JSON.stringify(next, null, 2), "utf8");
    return next;
  });
}
