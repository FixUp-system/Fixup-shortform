// 비용 기록 저장소 — 로컬 파일 기반 (data/costs.json)
// 실험 단계용. 배포 시에는 DB로 교체 필요.
import { promises as fs } from "fs";
import path from "path";
import { fakeFal } from "./fake";

// 호출 시점에 읽는다 — 모듈 로드 때 고정하면 SHOTFORM_DATA_DIR 을 무시하게 되고,
// 테스트가 저장소의 data/costs.json 에 실제로 쓴다(그렇게 오염된 적이 있다).
// lib/projects.js 와 같은 규칙이다.
function costsFile() {
  const base = process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data");
  return path.join(base, "costs.json");
}

// 모델별 예상 단가. fal 대시보드 실비용으로 검증 후 갱신할 것.
// key는 엔드포인트 앞부분(prefix) 매칭 — 더 구체적인 prefix를 위에 둘 것.
//
// 단위가 둘이다 — 영상은 초당(perSec), 음성은 글자당(per1k, 1000자 기준).
// unit 을 생략하면 "sec" 으로 본다(기존 호출부는 초를 넘긴다).
// 이미지는 장당인데 perSec 자리를 그대로 쓴다 — amount 에 장 수를 넘기면 값이 맞는다.
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
  { prefix: "fal-ai/ffmpeg-api/merge-audios", perSec: 0.0002 },
  // TTS — 글자당
  { prefix: "fal-ai/elevenlabs/tts", unit: "chars", per1k: 0.05 },
  { prefix: "fal-ai/chatterbox", unit: "chars", per1k: 0.025 },
  // 이미지 — 장당. "fal-ai/nano-banana/edit"(레퍼런스 사진이 있을 때)도 이 prefix 에 걸린다.
  //
  // 구글 직접 요금은 토큰 과금이다(nano-banana-2-lite 기준 이미지 출력 $37.50/1M —
  // 1024×1024 한 장이 1290토큰이면 ≈$0.048). 우리가 부르는 것은 fal 이고, fal 은 그것을
  // 장당 고정가로 재포장해 판다. 그래서 여기 값은 fal 의 장당 가격이다.
  { prefix: "fal-ai/nano-banana", perSec: 0.04 },
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
    const raw = await fs.readFile(costsFile(), "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeAll(records) {
  await fs.mkdir(path.dirname(costsFile()), { recursive: true });
  await fs.writeFile(costsFile(), JSON.stringify(records, null, 2), "utf8");
}

// 예산 가드 — 기록만으로는 아무것도 막지 못한다.
// 30초 한 편이 약 $2 라 해도 되돌리기·재생성이 얽히면 한 프로젝트에서 훨씬 더 나간다.
export class BudgetExceeded extends Error {
  constructor(spent, limit, scope) {
    super(`예산 상한($${limit})에 닿아 멈췄어요 — 지금까지 $${spent.toFixed(2)} 썼어요`);
    this.name = "BudgetExceeded";
    this.scope = scope; // "total" | "project"
  }
}

// 상한은 매번 env 에서 읽는다 — 모듈 로드 시점에 굳히면 테스트가 값을 못 바꾼다
function limitTotal() {
  return Number(process.env.SHOTFORM_BUDGET_TOTAL_USD ?? 20);
}
function limitProject() {
  // 30초 한 편이 약 $2(클립 $1.20 + 이미지 $0.80). 재생성 여지를 두어 두 배쯤 잡는다
  return Number(process.env.SHOTFORM_BUDGET_PROJECT_USD ?? 5);
}

const sum = (records) => records.reduce((s, r) => s + (Number(r.est_cost_usd) || 0), 0);

export async function spentTotal() {
  return sum(await readAll());
}

export async function spentForProject(projectId) {
  return sum((await readAll()).filter((r) => r.project_id === projectId));
}

// fal 로 나가기 직전에 부른다. 호출한 뒤에 재는 것이 아니라 나가기 전에 막는다 —
// 이번 호출의 예상 비용을 더한 값으로 판정하는 이유다.
export async function assertBudget({ projectId, endpoint, amount }) {
  if (fakeFal()) return; // 가짜 모드는 0원이라 잴 것이 없다
  const cost = estimateCost(endpoint, amount);
  const all = await readAll();

  const total = sum(all) + cost;
  if (total > limitTotal()) throw new BudgetExceeded(total - cost, limitTotal(), "total");

  if (projectId) {
    const mine = sum(all.filter((r) => r.project_id === projectId)) + cost;
    if (mine > limitProject()) throw new BudgetExceeded(mine - cost, limitProject(), "project");
  }
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
