// 프로젝트 저장소 — 소유자를 **필수 인자**로 요구한다.
//
// 이관 때는 "공개 시그니처를 안 건드려 호출부가 그대로 살았다"가 장점이었다. 이번엔
// 일부러 깬다 — 그래야 호출부가 전부 드러나고, 새 라우트를 만드는 사람이 소유자 검사를
// 빠뜨리는 것이 구조적으로 불가능해진다. 각인(of)이 버전 번호를 버린 이유와 같다:
// 사람이 기억해야 하는 자리를 만들지 않는다.
import { randomUUID } from "crypto";
import { getStore } from "./store/index.js";

function requireOwner(ownerId) {
  if (!ownerId) {
    throw new Error(
      "소유자(ownerId)가 필요해요 — 라우트는 requireUser(req).id 를 넘겨야 합니다"
    );
  }
  return ownerId;
}

// 낙관적 락 재시도 상한.
//
// 왜 락이 아니라 재시도인가: supabase-js 는 트랜잭션을 열 수 없어 SELECT ... FOR UPDATE 를
// 쓸 수 없다. 대신 version 컬럼을 두고 "내가 읽은 버전이 아직 그대로일 때만 쓴다"로 간다.
// 진 쪽은 최신 문서를 다시 읽어 그 위에 다시 얹는다 — 그래서 갱신이 사라지지 않는다.
//
// patchFn 이 순수 함수라 재시도가 안전하다 — 그 안에서 fal 호출이나 파일 쓰기를 하는
// 곳은 없다.
//
// ⚠️ 다만 "호출부가 전부 `proj => ({...proj, ...})` 한 줄짜리"는 사실이 아니었다.
// regenCut·regenVoice·regenClip 셋은 patchFn 안에서 바깥 변수(exceeded)에 쓴다.
// 그런 자리는 **시도마다 그 변수를 초기화**해야 한다. 안 그러면 버려진 시도가 세운 값이
// 다음 시도까지 살아남아, 재시도가 성공했는데도 오류를 던진다(실제로 그랬다).
// patchFn 에 바깥 변수를 쓰는 것을 새로 만들 때 이 문단을 먼저 볼 것.
const MAX_ATTEMPTS = 5;

export async function createProject({ settings, material, ownerId }) {
  requireOwner(ownerId);
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
  await getStore().insertProject(project, ownerId);
  return project;
}

// 없으면 null, 그 밖의 오류는 던진다.
//
// 예전에는 모든 예외를 삼켜 null 로 만들었다. 그러면 DB 가 잠깐 끊긴 것도
// "프로젝트를 찾을 수 없어요"가 되어 사용자가 자기 작업물이 사라진 줄 안다.
//
// ownerId 가 없으면 던진다 — 남의 프로젝트가 조용히 안 보이는 것과 "깜빡하고 안 넘겼다"는
// 서로 다른 사고다. 뒤엣것은 개발자에게 시끄러워야 한다.
export async function getProject(id, ownerId) {
  requireOwner(ownerId);
  const row = await getStore().selectProject(id, ownerId);
  return row ? row.doc : null;
}

// 목록 — doc 통짜를 안 실어 보낸다(store 가 이미 요약해서 준다).
export async function listProjects(ownerId) {
  requireOwner(ownerId);
  return getStore().listProjects(ownerId);
}

// ── 같은 프로젝트의 저장을 이 프로세스 안에서만 줄 세운다 ─────────────────────
//
// ★ 이건 이관 때 걷어낸 그 in-memory 락의 부활이 아니다. 모양은 비슷하지만 역할이 다르다.
//
// 걷어낸 이유는 "서버가 여러 대면 무력해진다"였고 그 지적은 지금도 옳다. 그래서
// **정확성은 이 줄이 아니라 아래의 version(낙관적 락)이 지킨다.** 서버가 몇 대든,
// 이 Map 을 공유하지 않는 프로세스끼리도 갱신 유실은 없다 — 진 쪽이 다시 읽고 다시 얹으니까.
//
// 이 줄이 하는 일은 오직 **경합을 줄이는 최적화**다. 줄이 아예 없어도 결과는 정확하다.
// 다만 2026-07-31 실측에서 한 프로세스가 같은 프로젝트에 동시 갱신을 12개 던지면
// 재시도 5회를 다 쓰고 버려지는 것이 나왔다(n=12 에서 2건, n=16 에서 3건 유실).
// 버려지는 시점이 **AI 호출이 끝난 뒤**라 돈은 나가고 결과가 안 남는다.
// 한 프로세스 안의 12개가 서로 안 부딪히게만 해도 진 횟수가 0 으로 떨어진다.
//
// 왜 AI 호출까지 직렬화하지 않는가: 한 번이 17초라 컷 12개면 3분 24초가 된다.
// DB 쓰기는 25ms 라 12개를 줄 세워도 0.3초다. 그래서 **저장만** 줄을 선다.
//
// 프로젝트 id 별로 줄이 따로다 — 서로 다른 프로젝트는 계속 병렬로 간다.
const writeQueues = new Map();

// 옛 락의 결함 하나를 여기서 고친다: 그 Map 은 프로젝트 id 마다 엔트리가 쌓이고
// 절대 안 지워져 영구 누적이었다. 여기서는 **마지막 대기자가 끝나면 항목을 지운다**
// (내가 꼬리인지 확인하고 지운다 — 내 뒤에 누가 붙었으면 그 사람의 꼬리를 지우면 안 된다).
function enqueueWrite(id, task) {
  const prev = writeQueues.get(id) || Promise.resolve();
  // ⚠️ prev 는 항상 "성공으로 끝나는" 꼬리여야 한다. patchFn 이 던지거나 재시도가
  // 소진돼도 줄이 막히면 안 되기 때문이다 — 그래서 아래 tail 은 catch 로 삼킨 것을 넣는다.
  // 실제 오류는 run 을 통해 호출자에게 그대로 간다.
  const run = prev.then(task);
  const tail = run.catch(() => {});
  writeQueues.set(id, tail);
  tail.then(() => {
    if (writeQueues.get(id) === tail) writeQueues.delete(id);
  });
  return run;
}

// 테스트 전용 — 줄이 다 빠졌는지(=Map 이 비었는지) 보기 위한 창. 제품 코드는 쓰지 않는다.
export function _writeQueueSize() {
  return writeQueues.size;
}

export function updateProject(id, ownerId, patchFn) {
  // requireOwner 를 큐 밖에서 부르면 동기로 던져 `.rejects`로 못 받는다(await 전에
  // 예외가 난다). enqueueWrite 콜백 안에서 던지면 그 자리는 항상 Promise 로 감싸인다.
  return enqueueWrite(id, () => {
    requireOwner(ownerId);
    return updateProjectNow(id, ownerId, patchFn);
  });
}

async function updateProjectNow(id, ownerId, patchFn) {
  const store = getStore();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await store.selectProject(id, ownerId);
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
