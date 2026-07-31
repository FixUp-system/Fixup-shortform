// owner_id 가 비어 있는 옛 프로젝트와 업로드를 한 사람에게 몰아준다.
//
// 사용법: node scripts/backfill-owner.mjs <owner-uuid>
// 두 번 돌려도 안전하다 — 프로젝트는 is("owner_id", null)로 이미 주인이 있는 행을
// 건드리지 않고, 업로드는 upsert(ignoreDuplicates)로 이미 있는 키를 건드리지 않는다.
//
// ★ cost_records.actor 의 "local" 은 건드리지 않는다. 과거 지출을 특정 사용자
// 앞으로 옮기면 사용자별 상한(assertBudget)이 첫날부터 잘못 물린다.
import { createClient } from "@supabase/supabase-js";

const ownerId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(ownerId || "")) {
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
