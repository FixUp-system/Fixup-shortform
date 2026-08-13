// 원장에 어떤 엔드포인트가 실제로 청구됐는지 센다 — DB 읽기만, 0원.
//
// 쓰는 이유: 코드가 겨냥한 모델과 **실제로 돈이 나간 모델**이 같은지는 원장에만 답이 있다.
// (2026-08-13: Kling v3 standard 가 `start_image_url` 을 요구하는데 lib/i2v.js 는
//  `image_url` 을 보낸다 — 한 번이라도 성공했는지 여기서 갈린다.)
import { runWithActor } from "../../lib/actor.js";
import { listRecords } from "../../lib/costs.js";

const rows = await runWithActor("admin", () => listRecords());

const byEndpoint = new Map();
for (const r of rows) {
  const key = r.endpoint || "(없음)";
  const cur = byEndpoint.get(key) || { n: 0, usd: 0, done: 0, failed: 0, last: "" };
  cur.n += 1;
  cur.usd += Number(r.est_cost_usd) || 0;
  if (r.status === "done") cur.done += 1;
  else cur.failed += 1;
  const ts = r.ts ? new Date(Number(r.ts)).toISOString().slice(0, 16) : "";
  if (ts > cur.last) cur.last = ts;
  byEndpoint.set(key, cur);
}

console.log(`원장 총 ${rows.length}건\n`);
console.log("엔드포인트별 (건수 · 성공/실패 · 추정원가 · 마지막):");
for (const [ep, v] of [...byEndpoint.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${ep}`);
  console.log(`      ${v.n}건 · 성공 ${v.done} / 실패 ${v.failed} · $${v.usd.toFixed(4)} · ${v.last}`);
}

// 관심 축 — 클립 모델이 실제로 돈 적이 있는가
const clipish = [...byEndpoint.keys()].filter((e) => /kling|seedance|ltx/i.test(e));
console.log("\n클립 모델만:");
if (!clipish.length) console.log("  (한 건도 없다 — 클립을 만든 적이 없다)");
for (const ep of clipish) {
  const v = byEndpoint.get(ep);
  console.log(`  ${ep} → ${v.n}건 (성공 ${v.done} / 실패 ${v.failed})`);
}
