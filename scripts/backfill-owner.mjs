// owner_id 가 비어 있는 옛 프로젝트와 업로드를 한 사람에게 몰아준다.
//
// 사용법: node scripts/backfill-owner.mjs <owner-uuid>
// 두 번 돌려도 안전하다 — 프로젝트는 is("owner_id", null)로 이미 주인이 있는 행을
// 건드리지 않고, 업로드는 upsert(ignoreDuplicates)로 이미 있는 키를 건드리지 않는다.
// 즉 프로젝트 단계는 됐는데 업로드 단계에서 실패해도(네트워크 등) 그냥 다시 돌리면
// 이미 끝난 부분은 건너뛰고 나머지만 이어서 채운다 — 손으로 되돌릴 것이 없다.
//
// ★ cost_records.actor 의 "local" 은 건드리지 않는다. 과거 지출을 특정 사용자
// 앞으로 옮기면 사용자별 상한(assertBudget)이 첫날부터 잘못 물린다.
import { createClient } from "@supabase/supabase-js";

const ownerId = process.argv[2];
// ★ 캐논니컬 uuid 형태만 받는다. "------------------------------------"(36자 하이픈)
// 같은 쓰레기가 옛 정규식(/^[0-9a-f-]{36}$/i)은 통과했다 — 글자수만 맞으면 통과였다.
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId || "")) {
  console.error("사용법: node scripts/backfill-owner.mjs <owner-uuid>");
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다.");
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ★ projects.owner_id 에는 FK 가 없다(profiles.id 와 달리 auth.users 참조가 없다).
// 형태만 맞는 오타 uuid 를 그대로 쓰면 존재하지 않는 유령 사용자에게 프로젝트 전체가
// 조용히 넘어간다. 실행 전에 profiles 에 실제로 있는 사람인지 확인한다.
const { data: owner, error: oErr } = await db
  .from("profiles").select("id, email").eq("id", ownerId).maybeSingle();
if (oErr) throw oErr;
if (!owner) {
  console.error(`profiles 에 ${ownerId} 가 없습니다 — uuid 를 다시 확인하세요. 아무것도 바꾸지 않았습니다.`);
  process.exit(1);
}
console.log(`대상: ${owner.email} (${owner.id})`);

// 프로젝트 — 이미 주인이 있는 것은 건드리지 않는다.
const { data: projects, error: pErr } = await db
  .from("projects").update({ owner_id: ownerId }).is("owner_id", null).select("id");
if (pErr) throw pErr;
console.log(`프로젝트 ${projects.length}건에 주인을 넣었습니다.`);

// 업로드는 Storage 목록에서 키를 얻어 upload_owners 에 채운다.
// ignoreDuplicates 라 이미 있는 키(=이미 주인이 있는 업로드)는 그대로 둔다.
const { data: files, error: fErr } = await db.storage.from("uploads").list("", { limit: 1000 });
if (fErr) throw fErr;
const rows = (files || []).map((f) => ({ key: f.name, owner_id: ownerId }));
if (rows.length) {
  const { error: uErr } = await db
    .from("upload_owners")
    .upsert(rows, { onConflict: "key", ignoreDuplicates: true });
  if (uErr) throw uErr;
}
console.log(`업로드 ${rows.length}건을 upload_owners 에 채웠습니다(이미 주인이 있던 키는 건드리지 않았습니다).`);

// ★ cost_records.actor 의 "local" 은 그대로 둔다.
// 과거 지출을 특정 사용자 앞으로 옮기면 사용자별 상한이 첫날부터 잘못 물린다.
console.log('원장(cost_records)의 "local" 은 그대로 뒀습니다(과거 사실이라 손대지 않습니다).');
