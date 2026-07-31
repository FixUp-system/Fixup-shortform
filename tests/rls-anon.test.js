// ★ service_role 로 도는 계약 테스트(store-supabase-contract.test.js 등)는 정책을
// **통과하는 게 아니라 무시한다.** 정책이 실제로 무는지 보려면 anon 키로 두드려야 한다.
// 이 테스트가 없으면 "정책 얹었고 테스트 그린"인데 아무것도 안 막는 상태가 될 수 있다.
//
// SUPABASE_URL·SUPABASE_ANON_KEY 가 .env.local 에 있어야 돈다(라이브 전용).
// 없으면 전부 건너뛴다 — 시작 시점 그린 카운트에 영향을 주지 않는다.
//
// ⚠️ 이 테스트는 읽기 시도와 "실패하는" insert 만 한다. 실제 데이터를 지우거나
// 바꾸는 동작은 하지 않는다 — 단, RLS 가 뚫려서 그 insert 가 "성공해 버리는" 실패
// 경로에서는 더미 행이 라이브 projects 에 남는다. afterAll 에서 그 정확한 id 만
// service_role 로 지워 정리한다(SUPABASE_SERVICE_ROLE_KEY 가 있을 때만).
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const live = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
const DUMMY_PROJECT_ID = "00000000-0000-0000-0000-0000000000ff";

describe.skipIf(!live)("RLS 는 anon 키를 막는다", () => {
  // ★ skipIf 는 개별 it 을 건너뛸 뿐 describe 본문은 항상 실행된다.
  // live 가 아닐 때도 이 줄이 돌므로 createClient 에 빈 URL 을 넘기면 안 된다.
  const anon = live
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      })
    : null;

  // ★ RLS 가 제대로 걸려 있으면 이 정리는 0건을 지우고 끝난다(insert 가 애초에
  // 실패했으므로). RLS 가 뚫려 있어서 더미 행이 실제로 들어간 경우에만 의미가 있다.
  // 반드시 **정확한 id 로만** 지운다 — 넓은 조건 삭제는 절대 안 쓴다.
  afterAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    await admin.from("projects").delete().eq("id", DUMMY_PROJECT_ID);
  });

  it("로그인 없이 projects 를 못 읽는다", async () => {
    const { data, error } = await anon.from("projects").select("id").limit(1);
    // 정책이 없으면 빈 배열, 있으면 오류 — 어느 쪽이든 **행이 나오면 안 된다**
    expect(error || (data || []).length === 0).toBeTruthy();
  });

  it("cost_records 도 못 읽는다", async () => {
    const { data, error } = await anon.from("cost_records").select("request_id").limit(1);
    expect(error || (data || []).length === 0).toBeTruthy();
  });

  it("upload_owners 도 못 읽는다", async () => {
    const { data, error } = await anon.from("upload_owners").select("key").limit(1);
    expect(error || (data || []).length === 0).toBeTruthy();
  });

  it("남의 프로젝트를 만들어 넣을 수 없다", async () => {
    // ★ 이 insert 는 성공하면 안 된다 — 실패를 검증하는 것이 테스트의 목적이다.
    const { error } = await anon.from("projects").insert({
      id: DUMMY_PROJECT_ID,
      owner_id: "00000000-0000-0000-0000-0000000000ee",
      status: "draft", version: 0, doc: {},
    });
    expect(error).toBeTruthy();
  });
});
