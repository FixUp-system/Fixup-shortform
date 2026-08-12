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
  async insertProject(project, ownerId) {
    const { error } = await db().from("projects").insert({
      id: project.id,
      owner_id: ownerId,
      status: project.status,
      version: 0,
      doc: project,
    });
    if (error) raise(error, "프로젝트 저장");
    return project;
  },

  async selectProject(id, ownerId) {
    const { data, error } = await db()
      .from("projects")
      .select("version, doc")
      .eq("id", id)
      .eq("owner_id", ownerId)     // ★ 쿼리 자체가 남의 것을 안 돌려준다
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

  // ── 폴링용 부분 읽기 ────────────────────────────────────────────────────
  //
  // 진행 상태를 2초마다 묻는 화면이 다섯이다(②대본~⑥완성). 그것들이 selectProject 를
  // 쓰면 상태 한 글자를 보려고 doc 통짜를 읽는다 — 실측 13,236 bytes 다. 합성 대기는
  // 최대 10분(=300회)이라 한 편에 수 MB 를 읽는다.
  //
  // 그래서 폴링 자리마다 필요한 만큼만 읽는 함수를 따로 둔다. 실측(같은 프로젝트):
  //   selectProject          13,236 B
  //   selectProjectProgress      35 B   ← 1/378
  //   selectProjectRender     3,113 B   ← 1/4.3
  //   selectProjectCuts       9,417 B   ← 1/1.4 (cuts 가 doc 의 대부분이라 여기가 한계)
  //
  // ★ 셋 다 소유자 필터를 건다. selectProject 와 같은 이유로 쿼리가 남의 것을 안 준다.
  // ★ cuts 를 더 줄이려고 응답에서 각인(of)을 떼면 안 된다 — isImageStale·isClipStale
  //   이 그걸로 낡음을 판정하고, 화면이 setProject 로 cuts 를 통째로 덮어쓴다.
  //   각인이 사라지면 "각인 없음 = 안 낡음"이 되어 낡은 그림에 경고가 안 뜬다.

  // 상태와 단계별 오류만 — 컷이 생겼는지 기다리는 자리가 쓴다.
  async selectProjectProgress(id, ownerId) {
    const { data, error } = await db()
      .from("projects")
      .select(
        "status," +
          "cuts_error:doc->>cuts_error,voice_error:doc->>voice_error," +
          "images_error:doc->>images_error,video_error:doc->>video_error," +
          "render_error:doc->>render_error,cut_count:doc->cuts"
      )
      .eq("id", id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) raise(error, "진행 상태 조회");
    if (!data) return null;
    // cut_count 는 배열 자체가 오므로 길이만 남기고 버린다 — 개수만 있으면 되는 자리다.
    return {
      status: data.status,
      cuts_error: data.cuts_error || null,
      voice_error: data.voice_error || null,
      images_error: data.images_error || null,
      video_error: data.video_error || null,
      render_error: data.render_error || null,
      cut_count: Array.isArray(data.cut_count) ? data.cut_count.length : 0,
    };
  },

  async selectProjectRender(id, ownerId) {
    const { data, error } = await db()
      .from("projects")
      .select("status,render:doc->render,render_error:doc->>render_error")
      .eq("id", id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) raise(error, "합성 상태 조회");
    if (!data) return null;
    return { status: data.status, render: data.render || null, render_error: data.render_error || null };
  },

  async selectProjectCuts(id, ownerId) {
    const { data, error } = await db()
      .from("projects")
      .select(
        "status,cuts:doc->cuts," +
          "cuts_error:doc->>cuts_error,voice_error:doc->>voice_error," +
          "video_error:doc->>video_error"
      )
      .eq("id", id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) raise(error, "컷 상태 조회");
    if (!data) return null;
    return {
      status: data.status,
      cuts: data.cuts || [],
      cuts_error: data.cuts_error || null,
      voice_error: data.voice_error || null,
      video_error: data.video_error || null,
    };
  },

  // 목록은 doc 통짜를 안 실어 보낸다 — 화면은 id·상태·제목과 썸네일 URL 둘만 필요하다.
  //
  // ★ `doc->material->>text` 셀렉트가 PostgREST 에서 어떤 키로 오는지 라이브로 확인하지
  // 못했다(아직 DB 미배포). 애매하면 명시적으로 별칭을 붙이는 쪽이 안전하다 — 별칭 없이
  // `->>` 를 쓰면 PostgREST 가 마지막 경로 조각(`text`)을 열 이름으로 쓰는 것이 관례지만,
  // 문서로 못 박기 전에는 추정이다. `AS material_text` 로 명시해 추정에 기대지 않는다.
  // 썸네일 두 개도 같은 이유로 별칭을 붙였다(`url` 이 둘 다 마지막 조각이라 별칭이 없으면
  // 서로 덮어쓴다 — 여기서는 추정이 아니라 충돌이다).
  //
  // `doc->cuts->0->image->>url` 의 `0` 은 배열 첫 원소다. 컷이 없으면 null 이 온다.
  async listProjects(ownerId) {
    const { data, error } = await db()
      .from("projects")
      .select(
        "id, status, created_at, material_text:doc->material->>text," +
          "kind:doc->>kind," +
          "video_url:doc->render->>url,ad_video_url:doc->videos->0->>url," +
          "image_url:doc->cuts->0->image->>url"
      )
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) raise(error, "프로젝트 목록");
    return (data || []).map((r) => ({
      id: r.id,
      status: r.status,
      created_ts: new Date(r.created_at).getTime(),
      kind: r.kind ?? null,
      title: (r.material_text || "").slice(0, 40),
      video_url: r.video_url || r.ad_video_url || null,
      image_url: r.image_url || null,
    }));
  },

  // ★ listProjects 는 limit(100) 이라 그 길이를 세면 조용히 틀린다. 세는 것은 DB 가 한다.
  async countProjects(ownerId) {
    const { count, error } = await db()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);
    if (error) raise(error, "프로젝트 수");
    return count ?? 0;
  },

  // selectProject 가 이미 소유자를 걸러 주지만(그 사이 id 는 uuid 라 주인이 안 바뀐다),
  // store 인터페이스 자체에 소유자 없는 쓰기 문을 열어 두지 않는다 — "계약으로 만든다"는
  // 이 태스크의 취지와 같은 이유다.
  async updateProjectRow(id, ownerId, expectedVersion, doc) {
    const { data, error } = await db()
      .from("projects")
      .update({
        doc,
        version: expectedVersion + 1,
        status: doc.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_id", ownerId)
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

  // ── 크레딧 충전 장부 ────────────────────────────────────────
  async insertGrant(row) {
    const { error } = await db().from("credit_grants").insert(row);
    if (error) raise(error, "크레딧 충전");
  },

  // 합계는 SQL 함수가 낸다(db/schema.sql 의 sum_grants). sumCosts 와 같은 이유로
  // 숫자로 못 읽으면 던진다 — 조용히 0 을 돌려주면 잔액이 사라져 멀쩡한 사용자가 막히고,
  // 조용히 적게 세면 반대로 없는 크레딧이 생긴다.
  async sumGrants(userId) {
    const { data, error } = await db().rpc("sum_grants", { p_user_id: userId });
    if (error) raise(error, "크레딧 합계");
    const n = data == null ? NaN : Number(data);
    if (!Number.isFinite(n)) {
      throw new Error(
        "크레딧 합계 실패: 합계를 숫자로 읽지 못했어요 — db/schema.sql 의 sum_grants 함수가 올라갔는지 확인해 주세요"
      );
    }
    return n;
  },

  // 감사용 읽기 — 한 사람의 장부를 행 그대로 준다(최신이 위). 합계로는 "누가 왜"를
  // 확인할 수 없다. 한 사람 것이라 행 상한(기본 1000)에 닿을 일이 사실상 없지만,
  // 그래도 최신부터 자른다 — 넘칠 때 잘리는 쪽이 오래된 행이어야 한다.
  async listGrants(userId) {
    const { data, error } = await db()
      .from("credit_grants")
      .select("user_id, amount_credits, reason, granted_by, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) raise(error, "크레딧 장부");
    return data || [];
  },

  // 목록 화면용 — 행마다 sum_grants 를 부르면 사용자 수만큼 왕복한다.
  // 여기서는 행을 받아 JS 로 더하는데, 그래도 되는 이유는 **한 화면의 사용자들** 것만
  // 받기 때문이다. 다만 행 상한은 여전히 존재하므로 count 로 검산한다.
  async listGrantsFor(userIds) {
    const out = new Map();
    if (!userIds?.length) return out;
    const { data, error, count } = await db()
      .from("credit_grants")
      .select("user_id, amount_credits", { count: "exact" })
      .in("user_id", userIds);
    if (error) raise(error, "크레딧 목록");
    const rows = data || [];
    if (count != null && rows.length < count) {
      throw new Error(`크레딧 목록 실패: ${count}건 중 ${rows.length}건만 받았어요`);
    }
    for (const r of rows) {
      out.set(r.user_id, (out.get(r.user_id) || 0) + (Number(r.amount_credits) || 0));
    }
    return out;
  },

  // ── 크레딧 청구 장부 ────────────────────────────────────────
  // 이중 청구는 unique(idem_key) 가 막는다. 앱에서 먼저 조회해 판정하지 않는 이유는
  // 조회와 삽입 사이가 열려 있기 때문이다(동시 클릭). 충돌 코드를 받아 false 로 바꾼다.
  async insertCharge(row) {
    const { error } = await db().from("credit_charges").insert(row);
    if (error) {
      if (error.code === "23505") return false;   // unique violation = 이미 청구됨
      raise(error, "크레딧 청구");
    }
    return true;
  },
  async sumCharges(userId) {
    const { data, error } = await db().rpc("sum_charges", { p_user_id: userId });
    if (error) raise(error, "청구 합계");
    const n = data == null ? NaN : Number(data);
    if (!Number.isFinite(n)) {
      throw new Error("청구 합계 실패: 합계를 숫자로 읽지 못했어요 — db/schema.sql 의 sum_charges 함수가 올라갔는지 확인해 주세요");
    }
    return n;
  },
  async listCharges(userId) {
    const { data, error } = await db()
      .from("credit_charges").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) raise(error, "청구 목록");
    return data || [];
  },
  async findCharge(idemKey) {
    const { data, error } = await db()
      .from("credit_charges").select("*").eq("idem_key", idemKey).maybeSingle();
    if (error) raise(error, "청구 조회");
    return data || null;
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

  async insertUploadOwner(key, ownerId) {
    const { error } = await db()
      .from("upload_owners")
      .insert({ key, owner_id: ownerId });
    if (error) raise(error, "업로드 소유자 기록");
  },

  async findUploadOwner(key) {
    const { data, error } = await db()
      .from("upload_owners")
      .select("owner_id")
      .eq("key", key)
      .maybeSingle();
    if (error) raise(error, "업로드 소유자 조회");
    return data ? data.owner_id : null;
  },

  // ── 운영자 승인 ──────────────────────────────────────────────
  async insertProfile(p) {
    const { error } = await db().from("profiles").insert(p);
    if (error) raise(error, "프로필 저장");
  },
  async listProfiles() {
    const { data, error } = await db()
      .from("profiles")
      .select("id, email, status, role, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) raise(error, "프로필 목록");
    return data || [];
  },
  async updateProfile(id, patch) {
    const { error } = await db().from("profiles").update(patch).eq("id", id);
    if (error) raise(error, "프로필 갱신");
  },
  async findProfiles(ids) {
    if (!ids.length) return new Map();
    const { data, error } = await db()
      .from("profiles")
      .select("id, email, role, status, display_name, created_at")
      .in("id", ids);
    if (error) raise(error, "프로필 조회");
    return new Map((data || []).map((p) => [p.id, {
      email: p.email,
      role: p.role,
      status: p.status,
      display_name: p.display_name ?? null,
      created_at: p.created_at,
    }]));
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
