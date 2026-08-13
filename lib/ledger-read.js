// 크레딧 내역을 읽는 한 자리 — 사장님의 마이페이지와 운영자의 백오피스가 **같은 규칙**을 쓴다.
//
// 두 화면이 각자 두 장부를 합치면 언젠가 부호나 정렬이 갈리고, 그때 어느 쪽이 맞는지
// 아무도 모른다. 돈에 관한 화면이라 그 갈림이 특히 나쁘다.
//
// ★ 말·부호 표(lib/ledger.js)와 나눠 둔 이유: 저쪽은 화면("use client")도 import 하므로
//   import 문이 없어야 하고, 이쪽은 스토어를 부른다. 섞으면 번들이 깨진다.
import { getStore } from "./store/index.js";
import { creditStateFor } from "./charges.js";
import { ledgerDelta } from "./ledger.js";

// 한 번에 주는 줄 수. 화면이 안 정하면 이 값이다.
export const LEDGER_PAGE = 20;
// 화면이 아무리 크게 불러도 여기까지다 — limit=100000 한 번에 장부를 통째로 퍼가지 못하게.
const LEDGER_PAGE_MAX = 100;

export function ledgerLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return LEDGER_PAGE;
  return Math.min(Math.floor(n), LEDGER_PAGE_MAX);
}

// userId 의 내역을 최신순으로 준다.
//
// before 를 주면 **그 시각보다 앞선 것만** 준다(이어 받기). 커서를 번호가 아니라 시각으로
// 두는 이유: 그 사이에 새 줄이 생겨도 이미 본 줄이 다시 나오거나 건너뛰지 않는다.
//
// ⚠️ 지금은 두 장부를 통째로 읽어 코드에서 자른다. 사람당 장부가 수십~수백 줄이라
// 감당되는 크기이고, DB 쪽에서 자르려면 두 장부를 각각 잘라 합친 뒤 다시 잘라야 해서
// 스토어 계약이 넓어진다. 한 사람이 수천 줄을 넘기기 시작하면 그때 옮긴다.
export async function readLedger(userId, { limit = LEDGER_PAGE, before } = {}) {
  const store = getStore();
  const [grants, charges, state] = await Promise.all([
    store.listGrants(userId),
    store.listCharges(userId),
    creditStateFor(userId),
  ]);

  const all = [
    ...grants.map((g) => ({
      source: "grant",
      // 충전은 종류가 하나다 — 사유(reason)는 운영자가 적은 말이라 그대로 흘리지 않는다.
      kind: "grant",
      credits: Number(g.amount_credits) || 0,
      ts: new Date(g.created_at).getTime(),
      project_id: null,
    })),
    ...charges.map((c) => ({
      source: "charge",
      kind: c.kind,
      credits: Number(c.credits) || 0,
      ts: new Date(c.created_at).getTime(),
      project_id: c.project_id || null,
    })),
  ]
    .filter((r) => (before ? r.ts < before : true))
    .sort((a, b) => b.ts - a.ts);

  const page = all.slice(0, limit);

  // 어느 영상에 썼는지. 지운 영상은 제목이 없다 — 장부는 남고 프로젝트만 사라지기 때문이다
  // (지우면 환불이 되면 "만들고 지워서 되돌려받는" 길이 열린다 — DELETE 라우트 주석 참고).
  //
  // ★ 제목은 **이번 쪽에 실린 것만** 묻는다. 전체를 물으면 페이지를 나눈 뜻이 없다.
  const titles = await store.findProjectTitles(
    [...new Set(page.map((r) => r.project_id).filter(Boolean))],
    userId
  );

  return {
    balance: state.balance,
    has_more: all.length > page.length,
    rows: page.map((r) => ({
      ts: r.ts,
      kind: r.kind,
      delta: ledgerDelta(r),
      project_id: r.project_id,
      project_title: r.project_id ? titles.get(r.project_id) || null : null,
    })),
  };
}
