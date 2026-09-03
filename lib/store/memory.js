import { filmModesOf, filmVideoUrlOf } from "../film/doc.js";
import { reelWholeVideoUrlOf } from "../reel/doc.js";
// 인메모리 저장소 — 테스트 전용.
//
// 프로덕션에서 절대 선택되면 안 된다(lib/store/index.js 가 명시적 env 로만 고른다).
// 저장이 되는 것처럼 보이다가 재시작하면 전부 사라지기 때문이다.
const projects = new Map(); // id → { version, owner_id, doc }
const costs = new Map();    // request_id → record
const objects = new Map();  // `${bucket}/${key}` → Buffer
const uploadOwners = new Map(); // key → owner_id
const profiles = new Map(); // id → { id, email, status, role, created_at }
const grants = []; // 크레딧 충전 장부 — { user_id, amount_credits, reason, granted_by, created_at }
const charges = []; // 크레딧 청구 장부 — { user_id, project_id, kind, credits, idem_key, created_at }

export function resetMemoryStore() {
  projects.clear();
  costs.clear();
  objects.clear();
  uploadOwners.clear();
  profiles.clear();
  grants.length = 0;
  // 여기를 빠뜨리면 청구 행이 테스트 사이를 넘어가 잔액이 남의 테스트에서 깎인다.
  charges.length = 0;
}

// 깊은 복사 — 바깥이 doc 을 들고 고쳐도 저장된 것이 안 바뀌게 한다.
// 파일 저장소는 JSON 왕복이라 자연히 격리됐는데, 메모리는 참조를 그대로 주면
// 저장 안 한 변경이 반영된 것처럼 보인다(테스트가 거짓으로 통과한다).
const clone = (v) => JSON.parse(JSON.stringify(v));

export const memoryStore = {
  async insertProject(project, ownerId) {
    projects.set(project.id, { version: 0, owner_id: ownerId, doc: clone(project) });
    return project;
  },
  // 지우기 — 소유자 확인은 여기서 한다. 남의 것이면 **아무 일도 안 하고** false 다
  // (없는 것과 구별되지 않는다 — selectProject 와 같은 규칙).
  // 내역 화면용 — 프로젝트 id 뭉치의 제목만 가져온다(목록 전체를 읽지 않는다).
  // 없는 id 는 **안 담는다**: 지운 영상과 남의 영상이 똑같이 "없음"으로 떨어져야 한다.
  async findProjectTitles(ids, ownerId) {
    const out = new Map();
    for (const id of ids) {
      const row = projects.get(id);
      if (!row || row.owner_id !== ownerId) continue;
      out.set(id, (row.doc?.material?.text || "").slice(0, 40));
    }
    return out;
  },
  // ★ ownerId 가 **null 이면 소유자를 안 가린다**(ANY_OWNER 규약, lib/projects.js).
  //   selectProject·updateProject 가 이미 그 규약이고, 지우기만 예외였다 —
  //   2026-09-03 에 운영자 지우기를 열면서 같은 규약으로 맞췄다.
  async deleteProject(id, ownerId) {
    const row = projects.get(id);
    if (!row) return false;
    if (ownerId !== null && row.owner_id !== ownerId) return false;
    projects.delete(id);
    return true;
  },
  // 버킷에서 파일 하나를 지운다. 이미 없으면 조용히 지나간다 — 지우기는 멱등이라야 한다.
  async deleteObject(bucket, key) {
    objects.delete(`${bucket}/${key}`);
  },
  async selectProject(id, ownerId) {
    const row = projects.get(id);
    if (!row) return null;
  // ★ ownerId 가 null 이면 **소유자 필터를 안 건다**(2026-08-27) — 운영자가 남의
  //   프로젝트를 고칠 때다. 그 판정은 lib/projects.js 의 ownerScope 하나가 하고,
  //   여기는 그 결과를 따를 뿐이다(저장소가 스스로 권한을 판단하지 않는다).
    // 남의 것은 "없음"과 구별되지 않는다 — 존재 여부도 흘리지 않는다
    if (ownerId !== null && row.owner_id !== ownerId) return null;
    return { version: row.version, doc: clone(row.doc) };
  },
  // ── 폴링용 부분 읽기 ────────────────────────────────────────────────────
  // supabase.js 와 같은 계약이어야 한다. 인메모리는 어차피 doc 전체가 메모리에 있어
  // 읽기량이 줄지 않지만, **모양이 다르면 여기서 통과한 코드가 프로덕션에서 깨진다**
  // (putObject 가 contentType 을 안 받아 같은 함정을 만들 뻔했다).
  async selectProjectProgress(id, ownerId) {
    const row = projects.get(id);
    if (!row || (ownerId !== null && row.owner_id !== ownerId)) return null;
    const d = row.doc;
    return {
      status: d.status,
      // 종류 — 기존 라우트가 광고 문서(kind:"ad")를 걸러내는 데 쓴다. status 폴링 라우트는
      // doc 통짜를 안 읽으므로 이 좁은 셀렉터가 실어 줘야 가드를 걸 수 있다(Task 7).
      // 옛 문서는 없으므로 null.
      kind: d.kind ?? null,
      cuts_error: d.cuts_error || null,
      voice_error: d.voice_error || null,
      images_error: d.images_error || null,
      video_error: d.video_error || null,
      render_error: d.render_error || null,
      cut_count: (d.cuts || []).length,
      // 심장박동 — 파이프라인이 마지막으로 살아 있던 시각·단계·진척.
      // 옛 문서에는 없다. **null 과 0 은 다르다**: null 은 "판정 불가"이지 "멈춤"이 아니다.
      progress: d.progress ? clone(d.progress) : null,
    };
  },
  async selectProjectRender(id, ownerId) {
    const row = projects.get(id);
    if (!row || (ownerId !== null && row.owner_id !== ownerId)) return null;
    return {
      status: row.doc.status,
      kind: row.doc.kind ?? null,
      render: clone(row.doc.render || null),
      render_error: row.doc.render_error || null,
      progress: row.doc.progress ? clone(row.doc.progress) : null,
    };
  },
  async selectProjectCuts(id, ownerId) {
    const row = projects.get(id);
    if (!row || (ownerId !== null && row.owner_id !== ownerId)) return null;
    const d = row.doc;
    return {
      status: d.status,
      kind: d.kind ?? null,
      cuts: clone(d.cuts || []),
      cuts_error: d.cuts_error || null,
      voice_error: d.voice_error || null,
      video_error: d.video_error || null,
      // ★ 2026-08-14 — 여기가 빠져 있어서 이미지 생성 실패가 화면까지 영영 못 갔다.
      //   ④이미지 화면이 2초마다 두드리는 것이 이 함수다(GET /cuts/status).
      images_error: d.images_error || null,
      progress: d.progress ? clone(d.progress) : null,
    };
  },
  // ── 보기 전용 문 ────────────────────────────────────────────────────────
  //
  // 소유자를 안 받는다 — 안 받는 것이 이 함수의 **전부**다. 그래서 이름에 ForViewing 을
  // 박아 두고, 쓰기 자리에서 쓰이면 tests/archive-shared.test.js 가 빨개진다.
  // owner_id 를 함께 돌려준다: 화면이 "내 것인가"로 쓰기 버튼을 지우는 근거다.
  async selectProjectForViewing(id) {
    const row = projects.get(id);
    return row ? { owner_id: row.owner_id, doc: clone(row.doc) } : null;
  },

  // 보관함 [전체] — 소유자 필터가 없다. version 은 안 준다(고칠 수 없는 문이라 필요 없다).
  async listAllProjects() {
    return [...projects.values()]
      .map((r) => ({
        owner_id: r.owner_id,
        id: r.doc.id,
        created_ts: r.doc.created_ts,
        status: r.doc.status,
        kind: r.doc.kind ?? null,
        title: (r.doc.material?.text || "").slice(0, 40),
        video_url: r.doc.render?.url || r.doc.videos?.[0]?.url || r.doc.reel?.video?.url
          || reelWholeVideoUrlOf(r.doc) || filmVideoUrlOf(r.doc),
        image_url: r.doc.cuts?.[0]?.image?.url || null,
        film_modes: filmModesOf(r.doc),
      }))
      .sort((a, b) => b.created_ts - a.created_ts);
  },

  async listProjects(ownerId) {
    return [...projects.values()]
      .filter((r) => r.owner_id === ownerId)
      .map((r) => ({
        id: r.doc.id,
        created_ts: r.doc.created_ts,
        status: r.doc.status,
        // 종류. 옛 문서에는 없으므로 null 이다 — 화면이 "없으면 기존"으로 읽는다.
        kind: r.doc.kind ?? null,
        title: (r.doc.material?.text || "").slice(0, 40),
        // 보관함 카드의 썸네일 — doc 통짜가 아니라 URL 두 개만 뽑는다.
        // 완성본이 있으면 영상을, 없으면 첫 컷 그림을 보여준다.
        // 완성본 자리가 종류마다 다르다: 기존은 render.url, 광고는 videos[0].url,
        // film 은 films[방식].video.url.
        // ★★ 2026-09-01 — **단계별 통짜가 하나 더 있다.** 합성("이대로 완성하기")은
        //   수동이라 굽기만 하면 render 가 안 채워진다. 통짜 결과는 그 한 편이 곧
        //   완성본이므로 cuts[0].video 를 본다(reelWholeVideoUrlOf). 컷별 조각은
        //   안 뜬다 — 아직 안 이어 붙인 편을 다 된 것처럼 말하면 안 된다.
        video_url: r.doc.render?.url || r.doc.videos?.[0]?.url || r.doc.reel?.video?.url
          || reelWholeVideoUrlOf(r.doc) || filmVideoUrlOf(r.doc),
        image_url: r.doc.cuts?.[0]?.image?.url || null,
        film_modes: filmModesOf(r.doc),
      }))
      .sort((a, b) => b.created_ts - a.created_ts);
  },
  async countProjects(ownerId) {
    return [...projects.values()].filter((r) => r.owner_id === ownerId).length;
  },
  async updateProjectRow(id, ownerId, expectedVersion, doc) {
    const row = projects.get(id);
    // selectProject 가 이미 소유자를 걸러 주지만, store 인터페이스 자체에 소유자 없는
    // 쓰기 문을 열어 두지 않는다 — 계약으로 만든다는 이 태스크의 취지와 같은 이유다.
    if (!row || (ownerId !== null && row.owner_id !== ownerId) || row.version !== expectedVersion) return false;
    // owner_id 를 보존한다 — 여기서 새 행을 통째로 만들면서 빠뜨리면 그다음 selectProject
    // 가 "주인이 없다"로 보고 방금 쓴 갱신이 조용히 안 보이게 된다(실제로 그랬다).
    projects.set(id, { version: row.version + 1, owner_id: row.owner_id, doc: clone(doc) });
    return true;
  },
  async insertCost(record) {
    // ★ supabase.js 와 같은 매핑이어야 한다 — 호출부 7곳은 전부 `actor` 가 아니라
    // `user: costActor()` 로 적는다. 여기서 받아주지 않으면 sumCosts({actor}) 가
    // 라우트를 거쳐 실제로 기록된 비용을 하나도 못 잡는다(actor 필드가 항상 undefined).
    if (!costs.has(record.request_id)) {
      const withActor = { ...record, actor: record.actor ?? record.user ?? "local" };
      costs.set(record.request_id, clone(withActor));
    }
    return record;
  },
  async patchCost(requestId, patch) {
    const cur = costs.get(requestId);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    costs.set(requestId, next);
    return clone(next);
  },
  async findCost(requestId) {
    const r = costs.get(requestId);
    return r ? clone(r) : null;
  },
  // 원장 한 창 — supabase 와 **같은 계약**이다(기간으로 자르고 최신부터 limit 만큼).
  async listCosts({ from, to, limit = 2000 } = {}) {
    return [...costs.values()]
      .map(clone)
      .filter((r) => (typeof from !== "number" || r.ts >= from) && (typeof to !== "number" || r.ts <= to))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0) || String(b.request_id).localeCompare(String(a.request_id)))
      .slice(0, limit);
  },
  async allCosts() {
    return [...costs.values()].map(clone);
  },
  async sumCosts({ projectId, actor } = {}) {
    let total = 0;
    for (const r of costs.values()) {
      if (projectId && r.project_id !== projectId) continue;
      if (actor && r.actor !== actor) continue;
      total += Number(r.est_cost_usd) || 0;
    }
    return total;
  },
  // ── 크레딧 충전 장부 ────────────────────────────────────────
  async insertGrant(row) {
    grants.push({ created_at: new Date().toISOString(), ...clone(row) });
  },
  async sumGrants(userId) {
    return grants.reduce((s, g) => (g.user_id === userId ? s + (Number(g.amount_credits) || 0) : s), 0);
  },
  // 감사용 읽기 — 한 사람의 장부를 행 그대로 준다(최신이 위). 합계(sumGrants)로는
  // "누가 왜 넣었는지"를 확인할 수 없다: granted_by 를 빠뜨려도 합계는 같기 때문이다.
  async listGrants(userId) {
    return grants
      .filter((g) => g.user_id === userId)
      .map(clone)
      .reverse();
  },
  async listGrantsFor(userIds) {
    const want = new Set(userIds);
    const out = new Map();
    for (const g of grants) {
      if (!want.has(g.user_id)) continue;
      out.set(g.user_id, (out.get(g.user_id) || 0) + (Number(g.amount_credits) || 0));
    }
    return out;
  },
  // ── 크레딧 청구 장부 ────────────────────────────────────────
  async insertCharge(row) {
    if (charges.some((c) => c.idem_key === row.idem_key)) return false;  // 이중 청구 방어
    charges.push({ created_at: new Date().toISOString(), ...clone(row) });
    return true;
  },
  async sumCharges(userId) {
    return charges.reduce((s, c) => (c.user_id === userId ? s + (Number(c.credits) || 0) : s), 0);
  },
  // 여러 사람의 청구 합계를 **한 번에**. listGrantsFor 와 같은 모양이다 —
  // 두 장부가 다른 모양이면 부르는 쪽이 한쪽만 묶음으로 받는 지금 같은 상태가 된다.
  // ★ 청구가 없는 사람은 **칸을 안 만든다**(부르는 쪽이 0 으로 읽는다) — 저쪽과 같은 규약.
  async listChargesFor(userIds) {
    const want = new Set(userIds);
    const out = new Map();
    for (const c of charges) {
      if (!want.has(c.user_id)) continue;
      out.set(c.user_id, (out.get(c.user_id) || 0) + (Number(c.credits) || 0));
    }
    return out;
  },
  async listCharges(userId) {
    return charges.filter((c) => c.user_id === userId).map(clone).reverse();
  },
  async findCharge(idemKey) {
    const c = charges.find((x) => x.idem_key === idemKey);
    return c ? clone(c) : null;
  },
  // contentType 은 받되 쓰지 않는다 — 메모리에는 흘려줄 헤더가 없다.
  // 그래도 시그니처를 맞춰 둔다. 인메모리가 인자를 안 받으면 호출부가 안 넘겨도
  // 테스트가 통과해 버리고, 그 누락은 Supabase 에서만(=프로덕션에서만) 드러난다.
  async putObject(bucket, key, bytes, contentType) {  // eslint-disable-line no-unused-vars
    objects.set(`${bucket}/${key}`, Buffer.from(bytes));
  },
  async getObject(bucket, key) {
    const buf = objects.get(`${bucket}/${key}`);
    if (!buf) throw new Error(`객체를 찾을 수 없어요: ${bucket}/${key}`);
    return buf;
  },
  async insertUploadOwner(key, ownerId) {
    uploadOwners.set(key, ownerId);
  },
  async findUploadOwner(key) {
    return uploadOwners.get(key) ?? null;
  },
  // ── 운영자 승인 ──────────────────────────────────────────────
  async insertProfile(p) {
    profiles.set(p.id, { created_at: new Date().toISOString(), ...clone(p) });
  },
  async listProfiles() {
    return [...profiles.values()].map(clone);
  },
  async updateProfile(id, patch) {
    const cur = profiles.get(id);
    if (!cur) return;
    profiles.set(id, { ...cur, ...patch });
  },
  // 원장 한 줄이 **어느 흐름**의 것인가 — 종류는 문서 안에 산다(doc.kind).
  // ★ 원장에 종류를 복사해 두지 않는 이유: 두 벌이 되면 갈린다. 필요할 때 묶음으로 판다.
  async findProjectKinds(ids) {
    const out = new Map();
    for (const id of ids || []) {
      const row = projects.get(id);
      if (row) out.set(id, row.doc?.kind ?? null);
    }
    return out;
  },
  async findProfiles(ids) {
    const out = new Map();
    for (const id of ids) {
      const p = profiles.get(id);
      if (p) out.set(id, {
        email: p.email,
        role: p.role,
        status: p.status,
        // ★ Supabase 쪽(lib/store/supabase.js)의 findProfiles 와 **같은 모양**이어야 한다.
        //   한쪽만 열을 빠뜨리면 시험은 그린인데 실제로는 기본 등급으로 떨어진다(또는 반대).
        tier: p.tier ?? null,
        display_name: p.display_name ?? null,
        created_at: p.created_at,
      });
    }
    return out;
  },
};
