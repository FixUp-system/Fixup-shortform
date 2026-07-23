// 비용 기록 저장소 — 로컬 파일 기반 (data/costs.json)
// 실험 단계용. 배포 시에는 DB로 교체 필요.
import { promises as fs } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "costs.json");

// 모델별 예상 단가 (USD/초, 오디오 on 기준). fal 대시보드 실비용으로 검증 후 갱신할 것.
// key는 엔드포인트 앞부분(prefix) 매칭 — 더 구체적인 prefix를 위에 둘 것.
const PRICE_TABLE = [
  { prefix: "fal-ai/veo3.1/fast", perSec: 0.15 },
  { prefix: "fal-ai/veo3.1", perSec: 0.4 },
  { prefix: "fal-ai/kling-video/v3", perSec: 0.126 },
  { prefix: "fal-ai/kling-video", perSec: 0.05 },
  { prefix: "fal-ai/minimax", perSec: 0.05 },
];
const DEFAULT_PER_SEC = 0.1;

export function estimateCost(endpoint, seconds) {
  const entry = PRICE_TABLE.find((p) => endpoint.startsWith(p.prefix));
  const perSec = entry ? entry.perSec : DEFAULT_PER_SEC;
  return Math.round(perSec * Number(seconds) * 100) / 100;
}

async function readAll() {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeAll(records) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(records, null, 2), "utf8");
}

export async function listRecords() {
  const all = await readAll();
  return all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

export async function addRecord(record) {
  const all = await readAll();
  all.push(record);
  await writeAll(all);
  return record;
}

export async function updateRecord(requestId, patch) {
  const all = await readAll();
  const idx = all.findIndex((r) => r.request_id === requestId);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  await writeAll(all);
  return all[idx];
}
