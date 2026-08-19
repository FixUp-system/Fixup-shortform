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
// patchFn 이 부작용 없이 값만 만들어야 재시도가 안전하다 — CAS 에 지면 **그대로 다시
// 불린다**. 그 안에서 fal 호출이나 파일 쓰기를 하는 곳은 없다.
//
// ⚠️ patchFn 은 이제 **await 된다**(updateProjectNow). 락 안에서 다른 테이블을 물어야 하는
// 판정(예: 결제 장부)을 여기서 할 수 있게 열어 둔 자리다. 다만 **대가가 있다**: 이 함수는
// 프로젝트 id 별 직렬 큐 안에서 돌기 때문에, patchFn 안의 왕복 시간만큼 **그 프로젝트의
// 모든 저장이 멈춘다.** 재시도가 걸리면 그 왕복이 시도 수만큼 반복된다.
// 그러니 patchFn 안에서는 **그 판정에 꼭 필요한 읽기 하나**만 한다 — 여러 번 물어야 하거나
// 외부 API(fal·LLM)를 부르는 것은 큐 **밖**에서 미리 하고 결과만 들고 들어온다.
// 안 지키면 파이프라인이 컷마다 저장하는 자리에서 한 편 전체가 그 왕복만큼 느려진다.
//
// ⚠️ 다만 "호출부가 전부 `proj => ({...proj, ...})` 한 줄짜리"는 사실이 아니었다.
// regenCut·regenVoice·regenClip 셋은 patchFn 안에서 바깥 변수(exceeded)에 쓴다.
// 그런 자리는 **시도마다 그 변수를 초기화**해야 한다. 안 그러면 버려진 시도가 세운 값이
// 다음 시도까지 살아남아, 재시도가 성공했는데도 오류를 던진다(실제로 그랬다).
// patchFn 에 바깥 변수를 쓰는 것을 새로 만들 때 이 문단을 먼저 볼 것.
const MAX_ATTEMPTS = 5;

// 문서 종류. **없으면 기존 종류다** — 옛 문서에는 이 필드가 아예 없다.
// 반대로 두면(없으면 ad) 기존 프로젝트 전체가 새 경로로 흘러간다.
const KINDS = ["ad", "film"];

export async function createProject({ settings, material, ownerId, kind }) {
  requireOwner(ownerId);
  if (kind !== undefined && !KINDS.includes(kind)) {
    throw new Error(`모르는 프로젝트 종류예요: ${kind}`);
  }
  const project = {
    id: randomUUID(),
    created_ts: Date.now(),
    // 광고 문서의 상태는 draft → scenario → rendering → done 이다(설계 참고).
    // 기존 종류의 전이표와 겹치는 것은 draft 뿐이고, 두 세계는 kind 로 갈린다.
    status: "draft", // draft → briefing → script → cuts → voice → images → video → done
    ...(kind ? { kind } : {}),
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

// ── 보기 전용 문 ────────────────────────────────────────────────────────────
//
// ⚠️ 이 함수는 **소유자를 검사하지 않는다.** 내부 팀이라 남이 만든 결과물을 서로 볼 수
// 있어야 해서 판 문이다(보관함 [전체]·상세 읽기·영상 파일).
//
// 왜 getProject 에 "검사 건너뛰기" 옵션을 안 달았는가: 그러면 위 파일 머리말의 보장이
// 통째로 사라진다. 옵션은 **안 넘기면 안전한 쪽**이 되지만, 사람은 옵션을 보고도
// 그 자리가 무슨 뜻인지 모른 채 복사한다. 이름을 따로 두면 호출부에서 "보기 전용"이
// 눈에 보이고, 쓰기 자리에 섞이면 tests/archive-shared.test.js 가 빨개진다.
//
// **읽기 자리에서만 부른다.** 여기서 받은 문서를 updateProject 로 되돌려 쓰면
// (updateProject 는 여전히 소유자를 요구하므로) 남의 것은 거기서 막히지만, 애초에
// 그 배선을 만들지 않는다.
//
// viewerId 는 판정에 쓰지 않는다 — 오직 mine(내가 만든 것인가)을 세우는 데만 쓴다.
// 화면은 그 값으로 쓰기 버튼(지우기·이어서 작업하기)을 그릴지 정한다.
// 없으면 null, 있으면 { doc, mine } — getProject 와 반환 모양이 다른 것도 일부러다.
export async function getProjectForViewing(id, viewerId) {
  const row = await getStore().selectProjectForViewing(id);
  if (!row) return null;
  return { doc: row.doc, mine: row.owner_id === viewerId };
}

// 보관함 [전체] 목록 — 소유자를 안 거른다.
//
// 만든 사람이 누구인지는 **안 흘린다**(이번 범위 밖이다). owner_id 는 여기서 mine 으로
// 접어서 버린다 — 화면까지 내보내면 지우기 어려운 신원 정보가 API 계약에 남는다.
export async function listAllProjects(viewerId) {
  const rows = await getStore().listAllProjects();
  return rows.map(({ owner_id, ...row }) => ({ ...row, mine: owner_id === viewerId }));
}

// ── 폴링용 부분 읽기 ────────────────────────────────────────────────────────
//
// 진행 상태를 2초마다 묻는 화면이 다섯이다. getProject 를 쓰면 상태 한 글자를 보려고
// doc 통짜(실측 13,236 bytes)를 읽는다 — 합성 대기는 최대 10분(=300회)이라 한 편에
// 수 MB 다. 자리마다 필요한 만큼만 읽는다(store 주석에 실측표가 있다).
//
// getProject 와 같은 규칙: ownerId 가 없으면 던진다.
export async function getProjectProgress(id, ownerId) {
  requireOwner(ownerId);
  return getStore().selectProjectProgress(id, ownerId);
}

export async function getProjectRender(id, ownerId) {
  requireOwner(ownerId);
  return getStore().selectProjectRender(id, ownerId);
}

export async function getProjectCuts(id, ownerId) {
  requireOwner(ownerId);
  return getStore().selectProjectCuts(id, ownerId);
}

// 목록 — doc 통짜를 안 실어 보낸다(store 가 이미 요약해서 준다).
export async function listProjects(ownerId) {
  requireOwner(ownerId);
  // mine 을 여기서 세운다 — [전체] 목록과 **같은 모양**이라야 카드가 탭마다 다르게
  // 판정하지 않는다. 이 목록은 정의상 전부 내 것이라 늘 true 다.
  return (await getStore().listProjects(ownerId)).map((row) => ({ ...row, mine: true }));
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

// async function 으로 선언한다 — requireOwner 가 동기로 던져도 async 함수 안에서는
// 자동으로 거부된 Promise 가 되어 `.rejects` 로 잡힌다(일반 함수였다면 호출자가 await
// 하기도 전에 동기로 던졌다). 큐(enqueueWrite) **밖**에서 검사하는 것도 이 순서 그대로
// 유지한다 — 소유자 없는 요청을 큐 안에 넣으면 남의 프로젝트 갱신이 끝날 때까지 인증
// 실패 응답이 줄을 서서 기다리게 된다. 검사는 항상 줄서기보다 먼저다.
export async function updateProject(id, ownerId, patchFn) {
  requireOwner(ownerId);
  return enqueueWrite(id, () => updateProjectNow(id, ownerId, patchFn));
}

async function updateProjectNow(id, ownerId, patchFn) {
  const store = getStore();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await store.selectProject(id, ownerId);
    if (!row) throw new Error("프로젝트를 찾을 수 없어요");
    // await 한다 — patchFn 이 **락 안에서** 물어야 하는 것이 있을 때(예: 결제 장부는
    // 다른 테이블이라 문서만 봐서는 알 수 없다) 비동기 판정을 여기서 하게 해 준다.
    // 동기 patchFn 은 그대로 통과한다(await 는 값을 그대로 돌려준다).
    // ⚠️ patchFn 은 여전히 **부작용이 없어야** 한다 — CAS 에 지면 다시 불린다.
    const next = await patchFn(row.doc);
    if (await store.updateProjectRow(id, ownerId, row.version, next)) return next;
    // 졌다 — 아주 짧게 무작위로 쉬고 최신 문서를 다시 읽는다.
    // 무작위가 없으면 진 쪽들이 같은 순간에 다시 몰려 또 부딪힌다.
    await sleep(5 + Math.floor(Math.random() * 20) * (attempt + 1));
  }
  throw new Error("저장이 계속 충돌했어요 — 잠시 뒤 다시 시도해 주세요");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
