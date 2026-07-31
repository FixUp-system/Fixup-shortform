// 인메모리 저장소 — 테스트 전용.
//
// 프로덕션에서 절대 선택되면 안 된다(lib/store/index.js 가 명시적 env 로만 고른다).
// 저장이 되는 것처럼 보이다가 재시작하면 전부 사라지기 때문이다.
const projects = new Map(); // id → { version, owner_id, doc }
const costs = new Map();    // request_id → record
const objects = new Map();  // `${bucket}/${key}` → Buffer
const uploadOwners = new Map(); // key → owner_id
const profiles = new Map(); // id → { id, email, status, role, created_at }

export function resetMemoryStore() {
  projects.clear();
  costs.clear();
  objects.clear();
  uploadOwners.clear();
  profiles.clear();
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
  async selectProject(id, ownerId) {
    const row = projects.get(id);
    if (!row) return null;
    // 남의 것은 "없음"과 구별되지 않는다 — 존재 여부도 흘리지 않는다
    if (row.owner_id !== ownerId) return null;
    return { version: row.version, doc: clone(row.doc) };
  },
  async listProjects(ownerId) {
    return [...projects.values()]
      .filter((r) => r.owner_id === ownerId)
      .map((r) => ({
        id: r.doc.id,
        created_ts: r.doc.created_ts,
        status: r.doc.status,
        title: (r.doc.material?.text || "").slice(0, 40),
      }))
      .sort((a, b) => b.created_ts - a.created_ts);
  },
  async updateProjectRow(id, ownerId, expectedVersion, doc) {
    const row = projects.get(id);
    // selectProject 가 이미 소유자를 걸러 주지만, store 인터페이스 자체에 소유자 없는
    // 쓰기 문을 열어 두지 않는다 — 계약으로 만든다는 이 태스크의 취지와 같은 이유다.
    if (!row || row.owner_id !== ownerId || row.version !== expectedVersion) return false;
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
  async findProfiles(ids) {
    const out = new Map();
    for (const id of ids) {
      const p = profiles.get(id);
      if (p) out.set(id, { email: p.email, role: p.role, status: p.status });
    }
    return out;
  },
};
