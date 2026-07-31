// 프로젝트 저장소 — 공개 함수 셋의 시그니처는 바꾸지 않는다.
// 라우트 13개와 lib/pipeline.js 호출 29곳이 이 문 하나만 본다.
import { randomUUID } from "crypto";
import { getStore } from "./store/index.js";

// 낙관적 락 재시도 상한.
//
// 왜 락이 아니라 재시도인가: supabase-js 는 트랜잭션을 열 수 없어 SELECT ... FOR UPDATE 를
// 쓸 수 없다. 대신 version 컬럼을 두고 "내가 읽은 버전이 아직 그대로일 때만 쓴다"로 간다.
// 진 쪽은 최신 문서를 다시 읽어 그 위에 다시 얹는다 — 그래서 갱신이 사라지지 않는다.
//
// patchFn 이 순수 함수라 재시도가 안전하다. 호출부 29곳이 전부
// `proj => ({...proj, ...})` 형태이고 그 안에서 fal 호출이나 파일 쓰기를 하는 곳은 없다.
const MAX_ATTEMPTS = 5;

export async function createProject({ settings, material }) {
  const project = {
    id: randomUUID(),
    created_ts: Date.now(),
    status: "draft", // draft → briefing → script → cuts → voice → images → video → done
    settings: settings || {},
    material: material || { text: "", photos: [] },
    briefing: null,
    synopsis: null,
    script: null,
    cuts: [],
  };
  await getStore().insertProject(project);
  return project;
}

// 없으면 null, 그 밖의 오류는 던진다.
//
// 예전에는 모든 예외를 삼켜 null 로 만들었다. 그러면 DB 가 잠깐 끊긴 것도
// "프로젝트를 찾을 수 없어요"가 되어 사용자가 자기 작업물이 사라진 줄 안다.
export async function getProject(id) {
  const row = await getStore().selectProject(id);
  return row ? row.doc : null;
}

export async function updateProject(id, patchFn) {
  const store = getStore();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await store.selectProject(id);
    if (!row) throw new Error("프로젝트를 찾을 수 없어요");
    const next = patchFn(row.doc);
    if (await store.updateProjectRow(id, row.version, next)) return next;
    // 졌다 — 아주 짧게 무작위로 쉬고 최신 문서를 다시 읽는다.
    // 무작위가 없으면 진 쪽들이 같은 순간에 다시 몰려 또 부딪힌다.
    await sleep(5 + Math.floor(Math.random() * 20) * (attempt + 1));
  }
  throw new Error("저장이 계속 충돌했어요 — 잠시 뒤 다시 시도해 주세요");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
