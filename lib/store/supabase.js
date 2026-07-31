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
  // service role 키를 쓴다 — 서버에서만 부른다.
  // db/schema.sql 이 projects·cost_records 에 RLS 를 켜두고 정책은 하나도 두지 않았다
  // (= anon·authenticated 는 전부 거부). 아직 인증이 없어 "누구의 것"인지 적을 수 없는데
  // 문을 열어두면 익명 키 하나로 남의 프로젝트를 읽는 상태가 되기 때문이다.
  // service_role 은 RLS 를 우회하므로 서버인 이 코드만 통과한다 — 그래서 이 키를 쓴다.
  //
  // 인증이 붙으면 두 가지가 같이 바뀐다: 여기서 **사용자 토큰 클라이언트**로 갈아타고
  // (그러면 더 이상 우회하지 않는다), 그때 비로소 소유자 정책(owner_id = auth.uid())을
  // 넣는다. 정책을 먼저 넣는 것이 아니라 이 순서라야 중간에 구멍이 생기지 않는다.
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
          // ★ 호출부는 `actor` 가 아니라 `user` 로 쓴다 — lib/llm.js·imagegen.js·i2v.js·
          // tts.js·vlm.js·compose.js 일곱 자리가 전부 `user: costActor()` 다(실측: 옛 원장
          // 54건 모두 user 키, actor 0건). 여기서 받아주지 않으면 actor 컬럼에 언제나
          // "local" 이 박히고 진짜 값은 meta 로 흘러가, cost_records_actor_ts_idx 가
          // 상수 컬럼을 색인하고 인증이 붙어도 사용자별 집계가 전부 "local" 로 쌓인다.
          // 이름을 store 에서 받아주는 쪽이 호출부 일곱을 안 건드려 안전하다.
          actor: actor ?? meta.user ?? "local",
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
    // 컬럼과 meta 를 이름으로 갈라 낸다.
    //
    // 예전에는 status 만 컬럼으로 보고 나머지를 전부 meta 로 밀어 넣었다. 그러면
    // est_cost_usd·stage·project_id 를 패치했을 때 값이 meta 안에만 들어가고 컬럼은
    // 옛날 값 그대로 남는다 — flatten 이 meta 를 펼쳐 주니 읽기는 멀쩡해 보이는데
    // 컬럼으로 재는 sumCosts(=예산 가드)만 혼자 다른 값을 본다. 조용히 어긋나는 모양이다.
    const { fields, rest } = splitCostPatch(patch);
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
    // 고칠 것이 하나도 없으면 빈 update 를 보내지 않는다(PostgREST 가 거절한다).
    // this 를 안 쓴다 — 호출부가 메서드를 떼어 쓰면 this 가 사라진다.
    if (!Object.keys(fields).length) {
      const row = await findCostRow(requestId);
      return row ? flatten(row) : null;
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

  // 원장 전체. ★ PostgREST 는 한 응답의 행 수에 상한을 건다(Supabase 기본 1000).
  // 그냥 select("*") 하면 원장이 1000행을 넘는 순간 **말없이 앞의 1000건만** 온다.
  // 그래서 총건수(count)를 함께 받아 다 받을 때까지 페이지를 넘기고,
  // 그래도 모자라면 던진다 — 원장 화면이 조용히 일부만 보여주면 안 된다.
  //
  // 페이지 크기를 상수로 못 박지 않는 이유: 서버 상한이 우리가 요청한 크기보다 작을 수
  // 있고(그러면 "적게 왔으니 끝"으로 오해한다), count 와 대조하면 그 오해가 안 생긴다.
  async allCosts() {
    const rows = [];
    for (let page = 0; page < 100; page++) {
      const { data, error, count } = await db()
        .from("cost_records")
        .select("*", { count: "exact" })
        // 정렬이 없으면 페이지 경계에서 같은 행이 겹치거나 빠진다. request_id 는 PK 라
        // 동점이 없어 순서가 완전히 결정된다.
        .order("ts", { ascending: false })
        .order("request_id", { ascending: false })
        .range(rows.length, rows.length + 999);
      if (error) raise(error, "비용 목록");
      rows.push(...(data || []));
      if (!data?.length) break;
      if (count != null && rows.length >= count) {
        return rows.map(flatten);
      }
    }
    // 여기까지 왔다는 것은 다 못 받았다는 뜻이다(count 를 못 받았거나 100페이지를 넘었다).
    // 마지막으로 한 번 더 세어 확인한다.
    const { count, error } = await db()
      .from("cost_records")
      .select("request_id", { count: "exact", head: true });
    if (error) raise(error, "비용 목록");
    if (count != null && rows.length < count) {
      throw new Error(`비용 목록 실패: ${count}건 중 ${rows.length}건만 받았어요`);
    }
    return rows.map(flatten);
  },

  // 합계는 DB 가 낸다(db/schema.sql 의 sum_costs 함수).
  //
  // ★ 예전에는 est_cost_usd 열을 전부 받아 JS 에서 더했다. 그런데 PostgREST 의 행 상한
  // (기본 1000) 때문에 원장이 1000행을 넘으면 **임의의 1000건 합계**가 돌아오고,
  // 그러면 assertBudget 의 `total > limitTotal()` 이 영원히 거짓이 되어 $20 총액 상한이
  // 조용히 사라진다. 인메모리에는 상한이 없어 테스트로는 절대 안 잡히는 종류의 결함이다.
  //
  // 그래서 "조용히 적게 세는 길"을 아예 없앤다 — 합계를 숫자로 못 읽으면 던진다.
  // lib/fake.js 가 "모르는 값은 안전한 쪽(=돈이 나가는 쪽)으로" 보는 것과 같은 규칙이다.
  async sumCosts({ projectId, actor } = {}) {
    const { data, error } = await db().rpc("sum_costs", {
      p_project_id: projectId ?? null,
      p_actor: actor ?? null,
    });
    if (error) raise(error, "비용 합계");
    // null 을 Number() 에 넣으면 0 이 된다 — "합계가 0" 과 "합계를 못 받았다"가 같아진다.
    // 원장이 비어 있으면 함수가 coalesce 로 0 을 준다. 즉 null 은 언제나 사고다.
    const n = data == null ? NaN : Number(data);
    if (!Number.isFinite(n)) {
      throw new Error(
        "비용 합계 실패: 합계를 숫자로 읽지 못했어요 — db/schema.sql 의 sum_costs 함수가 올라갔는지 확인해 주세요"
      );
    }
    return n;
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

// 패치를 컬럼과 meta 로 가른다. 이름이 컬럼이면 컬럼으로, 아니면 meta 로.
// request_id 는 기본키라 못 바꾼다(바꾸면 멱등키가 흔들린다) — 조용히 무시한다.
const COST_COLUMNS = new Set(["endpoint", "stage", "actor", "project_id", "est_cost_usd", "status"]);

function splitCostPatch(patch) {
  const fields = {};
  const rest = {};
  for (const [k, v] of Object.entries(patch || {})) {
    // ts 는 컬럼이지만 바깥은 epoch 숫자로 다룬다(flatten 이 그렇게 돌려준다).
    // 그대로 넣으면 timestamptz 에 숫자가 가서 거절되거나 엉뚱한 시각이 된다.
    if (k === "request_id") continue;
    if (k === "ts") fields.ts = new Date(v).toISOString();
    else if (COST_COLUMNS.has(k)) fields[k] = v;
    else {
      rest[k] = v;
      // insertCost 와 같은 규칙 — 호출부가 쓰는 이름은 user 이고 컬럼 이름은 actor 다.
      // meta 에도 남겨 둔다(읽는 쪽이 계속 user 로 본다).
      if (k === "user" && patch.actor === undefined) fields.actor = v;
    }
  }
  return { fields, rest };
}

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
