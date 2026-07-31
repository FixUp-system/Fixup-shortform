// Supabase 구현.
//
// supabase-js 는 PostgREST(HTTP)를 거쳐 호출 하나하나가 각각 독립된 트랜잭션이다.
// BEGIN 을 걸어놓고 그 안에서 JS 를 돌린 뒤 COMMIT 하는 것이 불가능하므로
// SELECT ... FOR UPDATE 를 쓸 수 없다. 그래서 version 컬럼으로 낙관적 락을 건다
// (updateProjectRow 가 expectedVersion 을 WHERE 에 넣는다).
import { createClient } from "@supabase/supabase-js";

const UPLOADS_BUCKET = "uploads";

// 클라이언트 생성만 지연시킨다 — 이 모듈은 lib/store/index.js 가 정적 import 로 끌어오므로
// (getStore() 를 동기로 유지하려면 그래야 한다) import 시점에 env 를 읽으면
// SHOTFORM_STORE=memory 인 테스트에서도 죽는다.
let client = null;
function db() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  // service role 키를 쓴다 — 서버에서만 부르고, 아직 RLS 가 없다.
  // 인증이 붙으면 사용자 토큰 클라이언트로 갈아탄다.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요해요 (테스트는 SHOTFORM_STORE=memory)"
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// 오류와 "없음"을 구분한다 — 이 구분이 없으면 DB 가 잠깐 끊긴 것도
// "프로젝트를 찾을 수 없어요"가 되어 사용자가 작업물이 사라진 줄 안다.
function raise(error, what) {
  throw new Error(`${what} 실패: ${error.message}`);
}

export const supabaseStore = {
  async insertProject(project) {
    const { error } = await db().from("projects").insert({
      id: project.id,
      status: project.status,
      version: 0,
      doc: project,
    });
    if (error) raise(error, "프로젝트 저장");
    return project;
  },

  async selectProject(id) {
    const { data, error } = await db()
      .from("projects")
      .select("version, doc")
      .eq("id", id)
      .maybeSingle();
    if (error) raise(error, "프로젝트 조회");
    // version 을 Number 로 강제한다. Postgres bigint 는 PostgREST 를 거치며 JSON
    // **문자열**로 직렬화될 수 있는데(자바스크립트 안전 정수를 넘길 수 있어서),
    // 그러면 updateProjectRow 의 `expectedVersion + 1` 이 덧셈이 아니라 문자열
    // 이어붙이기가 된다("0" + 1 = "01"). Postgres 가 "01" 을 1 로 강제 변환해
    // 우연히 굴러갈 수는 있지만, 낙관적 락의 핵심 계산이 우연에 기대면 안 된다.
    // 라이브로 확인하기 전이라 여기서 방어한다.
    return data ? { version: Number(data.version), doc: data.doc } : null;
  },

  async updateProjectRow(id, expectedVersion, doc) {
    const { data, error } = await db()
      .from("projects")
      .update({
        doc,
        version: expectedVersion + 1,
        status: doc.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("version", expectedVersion)   // 그 사이 아무도 안 바꿨을 때만
      .select("id");
    if (error) raise(error, "프로젝트 갱신");
    return (data || []).length > 0;
  },

  async insertCost(record) {
    const { request_id, ts, endpoint, stage, actor, project_id, est_cost_usd, status, ...meta } = record;
    const { error } = await db()
      .from("cost_records")
      .upsert(
        {
          request_id,
          ts: new Date(ts).toISOString(),
          endpoint,
          stage: stage ?? null,
          actor: actor ?? "local",
          project_id: project_id ?? null,
          est_cost_usd: est_cost_usd ?? 0,
          status: status ?? null,
          meta,
        },
        { onConflict: "request_id", ignoreDuplicates: true }
      );
    if (error) raise(error, "비용 기록");
    return record;
  },

  async patchCost(requestId, patch) {
    const { status, ...rest } = patch;
    const fields = {};
    if (status !== undefined) fields.status = status;
    // meta 는 통째로 덮지 않고 병합한다 — 지금 호출부는 status 만 고치지만,
    // 부분 갱신이 남은 필드를 지우면 조용히 정보가 사라진다.
    if (Object.keys(rest).length) {
      // 여기서는 flatten 된 findCost 가 아니라 **원시 행**이 필요하다 —
      // 평평한 레코드에는 meta 키가 없고(펼쳐져 있다) meta 아닌 컬럼까지 섞여 있어
      // 그걸 다시 meta 로 밀어 넣으면 컬럼이 meta 안에 복제된다.
      const cur = await findCostRow(requestId);
      if (!cur) return null;
      fields.meta = { ...(cur.meta || {}), ...rest };
    }
    const { data, error } = await db()
      .from("cost_records")
      .update(fields)
      .eq("request_id", requestId)
      .select();
    if (error) raise(error, "비용 갱신");
    return (data || [])[0] ? flatten((data || [])[0]) : null;
  },

  // 인메모리 구현과 **같은 모양**을 준다(평평한 레코드, ts 는 epoch 숫자).
  // 여기만 DB 원시 행을 흘리면 인메모리로 통과한 호출부가 Supabase 에서만 깨진다 —
  // meta 가 중첩이고 ts 가 문자열이라서. 정확히 피하려던 실패 방식이다.
  async findCost(requestId) {
    const row = await findCostRow(requestId);
    return row ? flatten(row) : null;
  },

  async allCosts() {
    const { data, error } = await db().from("cost_records").select("*");
    if (error) raise(error, "비용 목록");
    return (data || []).map(flatten);
  },

  async sumCosts({ projectId } = {}) {
    // 예전에는 원장 전체를 읽어 JS 에서 더했다(O(n), 매 유료 호출마다).
    // 여기서는 필요한 열 하나만 가져와 더한다 — 인덱스가 걸린 필터를 탄다.
    let q = db().from("cost_records").select("est_cost_usd");
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) raise(error, "비용 합계");
    return (data || []).reduce((s, r) => s + (Number(r.est_cost_usd) || 0), 0);
  },

  // contentType 을 반드시 받아서 넘긴다 — 안 주면 Storage 가 octet-stream 으로 저장하고,
  // /api/uploads/<name> 이 흘려줄 때 브라우저가 이미지를 내려받기로 받는다.
  async putObject(bucket, key, bytes, contentType) {
    const { error } = await db()
      .storage.from(bucket)
      .upload(key, bytes, { contentType, upsert: true });
    if (error) raise(error, "파일 저장");
  },

  async getObject(bucket, key) {
    const { data, error } = await db().storage.from(bucket).download(key);
    if (error) raise(error, "파일 조회");
    return Buffer.from(await data.arrayBuffer());
  },
};

// 원시 행 조회. export 하지 않는다 — 밖으로 나가는 모양은 언제나 flatten 된 것 하나뿐이고,
// 이 함수는 meta 를 병합해야 하는 patchCost 내부용이다.
async function findCostRow(requestId) {
  const { data, error } = await db()
    .from("cost_records")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) raise(error, "비용 조회");
  return data || null;
}

// DB 행을 지금까지 쓰던 평평한 레코드 모양으로 되돌린다 —
// listRecords 를 소비하는 화면(app/costs)이 meta 안을 들여다보지 않게 한다.
function flatten(row) {
  const { meta, ts, ...rest } = row;
  return { ...rest, ts: new Date(ts).getTime(), ...(meta || {}) };
}

export const UPLOADS = UPLOADS_BUCKET;
