// 인메모리 저장소 — 테스트 전용.
//
// 프로덕션에서 절대 선택되면 안 된다(lib/store/index.js 가 명시적 env 로만 고른다).
// 저장이 되는 것처럼 보이다가 재시작하면 전부 사라지기 때문이다.
const projects = new Map(); // id → { version, owner_id, doc }
const costs = new Map();    // request_id → record
const objects = new Map();  // `${bucket}/${key}` → Buffer

export function resetMemoryStore() {
  projects.clear();
  costs.clear();
  objects.clear();
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
  async updateProjectRow(id, expectedVersion, doc) {
    const row = projects.get(id);
    if (!row || row.version !== expectedVersion) return false;
    // owner_id 를 보존한다 — 여기서 새 행을 통째로 만들면서 빠뜨리면 그다음 selectProject
    // 가 "주인이 없다"로 보고 방금 쓴 갱신이 조용히 안 보이게 된다(실제로 그랬다).
    projects.set(id, { version: row.version + 1, owner_id: row.owner_id, doc: clone(doc) });
    return true;
  },
  async insertCost(record) {
    if (!costs.has(record.request_id)) costs.set(record.request_id, clone(record));
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
};
