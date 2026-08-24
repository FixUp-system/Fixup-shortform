// 프로젝트 문서를 저장소에서 직접 읽어 시나리오를 찍는다(읽기 전용).
//   node scripts/measure/dump-project.mjs <projectId>
import { readFileSync } from "fs";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = process.argv[2];
const { data, error } = await db.from("projects").select("doc").eq("id", id).single();
if (error) throw new Error(error.message);
const d = data.doc;
const sc = d.scenario || {};
console.log("kind:", d.kind, "· settings:", JSON.stringify(d.settings));
console.log("사진:", (d.material?.photos || []).length, "장\n");
for (const k of ["focus", "angle", "environment", "look", "wardrobe", "tone", "voice", "music"]) {
  console.log(`■ ${k}\n  ${JSON.stringify(sc[k])}\n`);
}
console.log("■ shots");
for (const [i, s] of (sc.shots || []).entries()) {
  console.log(`  [${i + 1}] speaker=${JSON.stringify(s.speaker)} avatar_id=${JSON.stringify(s.avatar_id)} seconds=${s.seconds}`);
  console.log(`      shows : ${s.shows}`);
  console.log(`      camera: ${s.camera}`);
  console.log(`      line  : ${JSON.stringify(s.line)}\n`);
}
console.log("■ cuts(저장된 것):", (d.cuts || []).length, "개");
for (const c of d.cuts || []) {
  console.log(`  [${c.idx}] narration=${!!c.narration} ref_ids=${JSON.stringify(c.ref_ids)} image=${c.image?.url ? "있음" : "없음"} clip_prompt=${c.clip_prompt ? "있음" : "없음"}`);
}
