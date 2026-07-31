// 기존 로컬 데이터를 Supabase 로 옮긴다. 일회성이지만 **여러 번 돌려도 안전하다** —
// 비용은 request_id 가 기본키라 중복이 막히고, 파일은 이름이 고정이라 덮어써도 같다.
//
// 프로젝트 94개는 옮기지 않는다: 전부 실험 산출물이고 옛 스키마(폐지된 synopsis,
// 옛 ref_photo_id)를 새 저장소가 떠안을 이유가 없다. data/projects/ 는 그대로 남는다.
//
// 실행: node scripts/migrate-to-supabase.mjs
import { promises as fs } from "fs";
import path from "path";
import { getStore } from "../lib/store/index.js";

const DATA = process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data");
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function migrateUploads(store) {
  const dir = path.join(DATA, "uploads");
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    console.log("업로드 폴더가 없어요 — 건너뜁니다");
    return 0;
  }
  let n = 0;
  for (const name of names) {
    const ext = name.split(".").pop();
    if (!MIME[ext]) { console.log(`  건너뜀(형식): ${name}`); continue; }
    await store.putObject("uploads", name, await fs.readFile(path.join(dir, name)), MIME[ext]);
    n++;
  }
  return n;
}

async function migrateCosts(store) {
  let raw;
  try {
    raw = await fs.readFile(path.join(DATA, "costs.json"), "utf8");
  } catch {
    console.log("비용 원장이 없어요 — 건너뜁니다");
    return 0;
  }
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) throw new Error("costs.json 이 배열이 아니에요");
  let n = 0;
  for (const r of records) {
    if (!r.request_id) { console.log("  건너뜀(request_id 없음)"); continue; }
    await store.insertCost(r);
    n++;
  }
  return n;
}

const store = getStore();
console.log("업로드 이관…");
const uploads = await migrateUploads(store);
console.log("비용 원장 이관…");
const costs = await migrateCosts(store);
console.log(`\n완료 — 업로드 ${uploads}개 · 비용 ${costs}건`);
console.log("프로젝트는 옮기지 않았습니다(의도된 것). data/projects/ 는 그대로 남아 있습니다.");
