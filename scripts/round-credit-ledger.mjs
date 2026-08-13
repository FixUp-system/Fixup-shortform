// 장부의 소수 행을 정수로 정정한다.
//
// 왜 필요한가: credit_grants 는 옛 amount_usd(달러라 소수였다)를 **이름만 바꿔** 쓰는
// 자리다(db/schema.sql 의 rename). 그래서 옛 계정에는 +5.18 같은 행이 남아 있다.
// 크레딧은 개수로 다루기로 했으므로(정수 단위) 그 행들이 마지막 소수 출처다.
//
// 고치면 무엇이 달라지나: 잔액은 어차피 버림이라 대개 그대로지만, "줄의 합 ≠ 잔액"이
// 사라진다(내역은 줄마다 반올림, 잔액은 합을 버림 — 옛 소수 행이 그 어긋남의 원인이다).
//
// ★ 기본은 **훑기만** 한다. 실제로 쓰려면 --apply 를 준다.
// ★ 멱등이다. 두 번 돌려도 두 번째는 고칠 것이 없다.
// ★ 지우지 않는다 — 값을 반올림해 **덮는다**. 이 행들은 돈이 오간 사실이 아니라
//   단위를 잘못 읽은 자국이라, 정정이 곧 사실에 가까워지는 쪽이다.
//   (청구 장부는 돈이 오간 사실이라 지금까지도 지운 적이 없다. 거기 소수가 있으면
//    이 스크립트는 **보고만 하고 건드리지 않는다** — 사람이 보고 정한다.)
//
// 실행: node scripts/round-credit-ledger.mjs         (훑기)
//       node scripts/round-credit-ledger.mjs --apply (정정)
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const fractional = (n) => Number(n) !== Math.round(Number(n));

// ── 1. 청구 장부는 보기만 한다 ────────────────────────────────────────────
const { data: charges, error: cErr } = await db
  .from("credit_charges")
  .select("id, user_id, project_id, kind, credits, created_at");
if (cErr) throw new Error(`청구 장부 조회 실패: ${cErr.message}`);

const oddCharges = (charges || []).filter((c) => fractional(c.credits));
if (oddCharges.length) {
  console.log(`⚠️ 청구 장부에 소수 행이 ${oddCharges.length}건 있습니다 — 이 스크립트는 건드리지 않습니다.`);
  for (const c of oddCharges) console.log(`   ${c.created_at} ${c.user_id} ${c.kind} ${c.credits}`);
} else {
  console.log("청구 장부: 소수 행 없음 ✅");
}

// ── 2. 충전 장부의 소수 행 ────────────────────────────────────────────────
const { data: grants, error: gErr } = await db
  .from("credit_grants")
  .select("id, user_id, amount_credits, reason, created_at")
  .order("created_at", { ascending: true });
if (gErr) throw new Error(`충전 장부 조회 실패: ${gErr.message}`);

const targets = (grants || []).filter((g) => fractional(g.amount_credits));
if (!targets.length) {
  console.log("충전 장부: 소수 행 없음 ✅ — 고칠 것이 없습니다.");
  process.exit(0);
}

console.log(`\n충전 장부의 소수 행 ${targets.length}건:`);
const perUser = new Map();
for (const g of targets) {
  const from = Number(g.amount_credits);
  const to = Math.round(from);
  console.log(`   ${g.created_at?.slice(0, 10)} ${g.user_id} · "${g.reason}" · ${from} → ${to}`);
  perUser.set(g.user_id, (perUser.get(g.user_id) || 0) + (to - from));
}

console.log("\n사람별 잔액 변화:");
for (const [userId, delta] of perUser) {
  console.log(`   ${userId} · ${delta > 0 ? "+" : ""}${delta.toFixed(2)} 크레딧`);
}

if (!APPLY) {
  console.log("\n훑기만 했습니다. 실제로 고치려면 --apply 를 주세요.");
  process.exit(0);
}

// ── 3. 정정 ───────────────────────────────────────────────────────────────
// id 로 한 행씩 쓴다. 조건부 일괄 update 로 하면 그 사이에 들어온 행까지 함께 반올림된다.
let done = 0;
for (const g of targets) {
  const { error } = await db
    .from("credit_grants")
    .update({ amount_credits: Math.round(Number(g.amount_credits)) })
    .eq("id", g.id);
  if (error) {
    console.error(`   ✗ ${g.id}: ${error.message}`);
    continue;
  }
  done += 1;
}
console.log(`\n${done}/${targets.length}건 정정했습니다.`);

// 정말 사라졌는지 다시 읽어 확인한다 — "고쳤다"는 말은 다시 읽어 본 뒤에만 한다.
const { data: after } = await db.from("credit_grants").select("amount_credits");
const left = (after || []).filter((g) => fractional(g.amount_credits)).length;
console.log(left === 0 ? "남은 소수 행: 없음 ✅" : `⚠️ 아직 ${left}건 남았습니다`);
