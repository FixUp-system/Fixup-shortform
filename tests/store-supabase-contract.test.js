import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

// 접속 정보가 없으면 통째로 건너뛴다 — CI·새 클론에서 빨간불이 뜨면 안 된다.
const live = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── 테스트가 만든 것을 테스트가 치운다 ─────────────────────────────────────────
//
// 왜 필요한가: 이 파일만 유일하게 **실제 Supabase** 에 붙는다(나머지는 vitest.setup.js 가
// 인메모리에 가둔다). 그래서 여기서 만든 행은 그대로 실제 원장에 남는다 — 실제로 한 번
// 남겼다: projects 2행, cost_records 1건($0.25), Storage 객체 1개.
// est_cost_usd 는 예산 가드(assertBudget)가 세는 값이고 동시에 **제품 원가를 계산한
// 근거 데이터**라, 가짜 $0.25 한 줄이 상한을 갉아먹고 원가 숫자를 흐린다.
// (vitest.setup.js 주석에 같은 부류의 사고가 두 번 기록돼 있다.)
//
// ★ 지우는 범위를 "이 실행이 만든 정확한 id/키"로 못 박는다.
// `actor=eq.test` 같은 넓은 조건이나 접두사(`t-`, `test-`) 삭제는 쓰지 않는다 —
// 실제 기록이 우연히 그 조건에 걸리면 원장을 날린다. 정리 코드가 데이터를 잃는
// 사고로 바뀌는 것이 오염보다 더 나쁘다.
const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const made = { projects: [], costs: [], objects: [] };

// 만들기 **전에** 목록에 적는다. insert 가 도중에 실패해도(행은 들어갔는데 응답에서
// 터지는 경우가 있다) 이름을 이미 쥐고 있어야 지울 수 있다.
function newProjectId() {
  const id = randomUUID();
  made.projects.push(id);
  return id;
}
function newCostId() {
  const rid = `t-${randomUUID()}`;
  made.costs.push(rid);
  return rid;
}
function newObjectKey() {
  const key = `test-${randomUUID()}.jpg`;
  made.objects.push(key);
  return key;
}

describe.skipIf(!live)("Supabase store 계약", () => {
  let store;
  beforeAll(async () => {
    delete process.env.SHOTFORM_STORE;
    store = (await import("../lib/store/supabase.js")).supabaseStore;
  });

  // afterAll 이라야 **테스트가 실패해도** 돈다. 성공 경로(각 it 의 끝)에 정리를 두면
  // expect 가 던지는 순간 건너뛰어져 실패할 때마다 찌꺼기가 쌓인다.
  //
  // store 인터페이스에 delete* 를 추가하지 않고 여기서 클라이언트를 직접 만든다 —
  // 프로덕션이 쓰지 않는 메서드를 계약에 넣으면 구현 둘(memory·supabase)을 다 늘려야 하고,
  // 그 메서드는 아무 호출부도 지켜주지 않는 죽은 계약이 된다.
  afterAll(async () => {
    if (!live) return;
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 정리가 실패해도 테스트를 깨뜨리지 않는다 — 정리하다 죽으면 진짜 원인(테스트 실패)이
    // 가려진다. 대신 **조용히 넘기지도 않는다**: 무엇이 남았는지 이름째로 남긴다.
    // 남은 이름이 있으면 그걸로 손삭제할 수 있어야 한다.
    async function sweep(what, names, run) {
      if (!names.length) return;
      try {
        const left = await run(names);
        if (left.length) console.warn(`[정리 실패] ${what} 가 안 지워졌어요: ${left.join(", ")}`);
      } catch (e) {
        console.warn(`[정리 실패] ${what} (${names.join(", ")}): ${e.message}`);
      }
    }

    await sweep("projects", made.projects, async (ids) => {
      // select() 로 실제로 지워진 것을 되받아 대조한다. delete 는 "한 행도 안 맞았다"를
      // 오류로 알려주지 않아서, 안 세면 못 지운 것을 못 지운 줄 모른다.
      const { data, error } = await admin.from("projects").delete().in("id", ids).select("id");
      if (error) throw new Error(error.message);
      const gone = new Set((data || []).map((r) => r.id));
      return ids.filter((id) => !gone.has(id));
    });

    await sweep("cost_records", made.costs, async (rids) => {
      const { data, error } = await admin
        .from("cost_records")
        .delete()
        .in("request_id", rids)
        .select("request_id");
      if (error) throw new Error(error.message);
      const gone = new Set((data || []).map((r) => r.request_id));
      return rids.filter((rid) => !gone.has(rid));
    });

    await sweep("uploads 객체", made.objects, async (keys) => {
      const { data, error } = await admin.storage.from("uploads").remove(keys);
      if (error) throw new Error(error.message);
      const gone = new Set((data || []).map((o) => o.name));
      return keys.filter((k) => !gone.has(k));
    });
  });

  it("넣고 꺼내면 버전이 0이다", async () => {
    const id = newProjectId();
    await store.insertProject({ id, status: "draft", cuts: [] }, OWNER);
    const row = await store.selectProject(id, OWNER);
    expect(row.version).toBe(0);
    // 타입까지 본다. Postgres bigint 는 PostgREST 를 거치며 문자열로 올 수 있고,
    // 그러면 updateProjectRow 의 expectedVersion + 1 이 "0"+1="01" 이 된다.
    // 라이브에서 이 위험이 드러나야 한다.
    expect(typeof row.version).toBe("number");
    expect(row.doc.status).toBe("draft");
  });

  // ★ 이 자리가 supabase.js 의 `.eq("owner_id", ownerId)` 를 실제로 무는 유일한 계약
  // 테스트다. 라이브가 아니면 skip 되어 CI 에서는 못 잡지만, 이 파일이 라이브로 도는
  // 순간(Task 13) 그 필터가 빠지면 여기서 바로 드러난다.
  it("남의 owner 로는 못 읽는다 — 없는 것과 구별되지 않는다", async () => {
    const id = newProjectId();
    await store.insertProject({ id, status: "draft", cuts: [] }, OWNER);
    expect(await store.selectProject(id, OTHER)).toBeNull();
  });

  it("낡은 버전으로는 갱신되지 않는다", async () => {
    const id = newProjectId();
    await store.insertProject({ id, status: "draft" }, OWNER);
    expect(await store.updateProjectRow(id, OWNER, 0, { id, status: "script" })).toBe(true);
    expect(await store.updateProjectRow(id, OWNER, 0, { id, status: "cuts" })).toBe(false);
    expect((await store.selectProject(id, OWNER)).doc.status).toBe("script");
  });

  it("없는 프로젝트는 null 이다", async () => {
    // 여기만 추적하지 않는다 — 일부러 **만들지 않은** id 라서 지울 것도 없다.
    expect(await store.selectProject(randomUUID(), OWNER)).toBeNull();
  });

  it("같은 request_id 를 두 번 넣어도 한 건이다", async () => {
    const rid = newCostId();
    const rec = { request_id: rid, ts: Date.now(), endpoint: "x", actor: "test", est_cost_usd: 0.25 };
    await store.insertCost(rec);
    await store.insertCost(rec);
    expect(await store.findCost(rid)).toBeTruthy();
    // 합계가 두 배가 되지 않는다
    const all = (await store.allCosts()).filter((r) => r.request_id === rid);
    expect(all).toHaveLength(1);
  });

  it("객체를 넣고 꺼낸다", async () => {
    const key = newObjectKey();
    await store.putObject("uploads", key, Buffer.from("hello"), "image/jpeg");
    expect((await store.getObject("uploads", key)).toString()).toBe("hello");
  });
});
