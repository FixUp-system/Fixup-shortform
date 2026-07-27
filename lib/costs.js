// 비용 기록 저장소 — 로컬 파일 기반 (data/costs.json)
// 실험 단계용. 배포 시에는 DB로 교체 필요.
import { promises as fs } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "costs.json");

// 모델별 예상 단가. fal 대시보드 실비용으로 검증 후 갱신할 것.
// key는 엔드포인트 앞부분(prefix) 매칭 — 더 구체적인 prefix를 위에 둘 것.
//
// 단위가 둘이다 — 영상은 초당(perSec), 음성은 글자당(per1k, 1000자 기준).
// unit 을 생략하면 "sec" 으로 본다(기존 호출부는 초를 넘긴다).
// 이미지: 건당 $0.04 (fal-ai/nano-banana, lib/imagegen.js에서 고정 기록 — 이 표를 거치지 않음)
const PRICE_TABLE = [
  { prefix: "fal-ai/veo3.1/fast", perSec: 0.15 },
  { prefix: "fal-ai/veo3.1", perSec: 0.4 },
  { prefix: "fal-ai/kling-video/v3", perSec: 0.126 },
  { prefix: "fal-ai/kling-video", perSec: 0.05 },
  // 음성은 영상보다 위에 — "fal-ai/minimax"가 speech 도 삼킨다
  { prefix: "fal-ai/minimax/speech", unit: "chars", per1k: 0.1 },
  { prefix: "fal-ai/minimax", perSec: 0.05 },
  // LTX — 저비용 테스트용. /fast 계열이 $0.04/s, 일반 2.3이 $0.06/s.
  // 2.3을 2보다 위에 둬야 한다 ("fal-ai/ltx-2"가 "fal-ai/ltx-2.3"도 삼킨다).
  { prefix: "fal-ai/ltx-2.3/text-to-video/fast", perSec: 0.04 },
  { prefix: "fal-ai/ltx-2.3/image-to-video/fast", perSec: 0.04 },
  { prefix: "fal-ai/ltx-2.3", perSec: 0.06 },
  { prefix: "fal-ai/ltx-2", perSec: 0.04 },
  // 합성 — merge-videos 는 $0 으로 표기돼 있다(2026-07-27 확인, 실청구 미검증)
  { prefix: "fal-ai/ffmpeg-api/merge-videos", perSec: 0 },
  { prefix: "fal-ai/ffmpeg-api/merge-audio-video", perSec: 0.0002 },
  // TTS — 글자당
  { prefix: "fal-ai/elevenlabs/tts", unit: "chars", per1k: 0.05 },
  { prefix: "fal-ai/chatterbox", unit: "chars", per1k: 0.025 },
];
const DEFAULT_PER_SEC = 0.1;

// 비용을 낸 주체. 지금은 로컬 테스트라 항상 "local".
// 인증(Supabase Auth 등)이 붙으면 세션 사용자 id/이메일을 반환하도록 교체한다 —
// 비용 기록의 user 필드는 그때 바로 실제 사용자 단위 집계로 쓰인다.
export function costActor() {
  return "local";
}

// amount 는 단위에 따라 초(sec) 또는 글자 수(chars)다.
export function estimateCost(endpoint, amount) {
  const entry = PRICE_TABLE.find((p) => endpoint.startsWith(p.prefix));
  const n = Number(amount) || 0;
  if (!entry) return Math.round(DEFAULT_PER_SEC * n * 100) / 100;
  const raw = entry.unit === "chars" ? (entry.per1k * n) / 1000 : entry.perSec * n;
  return Math.round(raw * 100) / 100;
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
