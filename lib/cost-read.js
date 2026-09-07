// 한 사람이 **우리 돈을 얼마나 썼나** — 운영자 화면이 읽는 한 자리 (2026-09-07 사장님 지시).
//
// ★★ 이 저장소는 **장부가 둘이고 단위가 다르다.** 섞으면 안 된다:
//     · 청구 = **크레딧** (`credit_grants`·`credit_charges`) → lib/ledger-read.js
//     · 원가 = **USD**   (`cost_records`)                    → 이 파일
//   운영자가 사용자 관리에서 보고 싶은 것은 "이 사람이 **우리 돈**을 얼마나 썼나"라 원가다.
//
// ★ **lib/ledger-read.js 를 안 건드린다** — 마이페이지(/me)는 사장님 본인의 크레딧 화면이고
//   거기서는 크레딧이 맞는 단위다. 한 파일로 합치면 두 화면이 서로 다른 단위를 말하게 된다.
//
// ★★ 합계는 **DB 가 낸다**(sumCosts → SQL 의 sum_costs). 행을 받아 JS 에서 더하면
//   PostgREST 의 행 상한(기본 1000)에 걸려 **조용히 적게 센다** — 예산 가드가 그 함정으로
//   $300 상한을 통째로 잃었던 자리다(lib/costs.js 주석). 화면 한 쪽만 더하는 것은 더 나쁘다:
//   20건짜리 쪽을 보면서 "전체 사용 비용"이라 적히면 그 숫자는 거짓말이다.
//
// ★ 커서는 번호가 아니라 **시각**이다 — ledger-read 와 같은 규약. 그 사이 새 기록이 생겨도
//   이미 본 줄이 다시 나오거나 건너뛰지 않는다(원가는 생성 중에도 계속 쌓인다).
import { getStore } from "./store/index.js";

// 한 번에 주는 줄 수. 화면이 안 정하면 이 값이다.
export const COST_PAGE = 20;
// 화면이 아무리 크게 불러도 여기까지다 — 한 번에 장부를 통째로 퍼가지 못하게.
const COST_PAGE_MAX = 100;

export function costLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return COST_PAGE;
  return Math.min(Math.floor(n), COST_PAGE_MAX);
}

export async function readCosts(actor, { limit = COST_PAGE, before } = {}) {
  const store = getStore();
  // ★ 한 줄 더 받아서 "다음이 있는가"를 안다 — 전체를 세면 페이지를 나눈 뜻이 없다.
  const [rows, total] = await Promise.all([
    store.listCosts({ actor, before, limit: limit + 1 }),
    store.sumCosts({ actor }),
  ]);
  const page = rows.slice(0, limit);

  // 어느 영상에 썼는지. 지운 영상은 제목이 없다 — 원장은 남고 프로젝트만 사라지기 때문이다.
  // ★ 제목은 **이번 쪽에 실린 것만** 묻는다(ledger-read 와 같은 이유).
  // ★ ownerId 는 actor 다 — 운영자 화면이지만 그 사람의 프로젝트를 묻는 것이라 범위가 같다.
  const titles = await store.findProjectTitles(
    [...new Set(page.map((r) => r.project_id).filter(Boolean))],
    actor
  );

  return {
    total_usd: Number(total) || 0,
    has_more: rows.length > page.length,
    rows: page.map((r) => ({
      request_id: r.request_id,
      ts: r.ts,
      // 무엇에 썼나 — 실측으로 stage 는 이미 사람 말이다("광고 시나리오"·"이미지"·"검수").
      stage: r.stage || null,
      // 어느 모델이 받아갔나 — 사람 말이 아니라 작게 붙인다.
      endpoint: r.endpoint || null,
      est_cost_usd: Number(r.est_cost_usd) || 0,
      project_id: r.project_id || null,
      project_title: r.project_id ? titles.get(r.project_id) || null : null,
    })),
  };
}
