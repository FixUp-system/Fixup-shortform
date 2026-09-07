// GET /api/admin/users/[id]/ledger — 운영자가 한 사람의 **사용 비용(USD)** 을 본다.
//
// ★★ 2026-09-07 — 이 문이 돌려주던 것이 **크레딧 내역에서 실제 비용으로 바뀌었다**
//   (사장님 지시). 운영자가 알고 싶은 것은 "이 사람이 **우리 돈**을 얼마나 썼나"이고,
//   그 값은 크레딧 장부가 아니라 원가 원장(`cost_records`)에 있다.
//   · 크레딧 내역을 읽는 자리(lib/ledger-read.js)는 **그대로 살아 있다** — 마이페이지(/me)가
//     쓴다. 거기서는 크레딧이 맞는 단위다.
//   · 주소는 안 바꿨다 — 부르는 곳이 이 화면 하나뿐이라 새 주소를 만들 이유가 없다.
//
// ★ 이 문이 열리면 아무나 남의 지출을 들여다본다 — adminOnly 가 계약이다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET } from "../app/api/admin/users/[id]/ledger/route.js";
import { GET as usersGET } from "../app/api/admin/users/route.js";

const USER = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";

const req = (uid, role, qs = "") => ({
  url: `http://localhost/api/admin/users/x/ledger${qs}`,
  headers: new Headers({ [USER_HEADER]: uid, [STATUS_HEADER]: "approved", [ROLE_HEADER]: role }),
});
const ctx = (id) => ({ params: Promise.resolve({ id }) });

const spend = (actor, i, usd, projectId = null) =>
  getStore().insertCost({
    request_id: `${actor}-${i}`,
    ts: 1_700_000_000_000 + i * 1000,
    endpoint: "bytedance/seedance-2.0",
    stage: "영상",
    actor,
    project_id: projectId,
    est_cost_usd: usd,
    status: "done",
  });

describe("백오피스 — 한 사람의 사용 비용", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 운영자는 남의 사용 비용을 본다 — 합계와 상세가 함께 온다", async () => {
    await spend(USER, 1, 2.5);
    await spend(USER, 2, 1.25);
    const { total_usd, rows } = await (await GET(req(ADMIN, "admin"), ctx(USER))).json();
    expect(total_usd).toBe(3.75);
    expect(rows).toHaveLength(2);
    expect(rows[0].est_cost_usd).toBe(1.25);   // 최신이 위
    expect(rows[0].stage).toBe("영상");
  });

  it("★ 남의 지출이 섞이지 않는다", async () => {
    await spend(USER, 1, 2);
    await spend("00000000-0000-4000-8000-00000000000b", 2, 999);
    const { total_usd, rows } = await (await GET(req(ADMIN, "admin"), ctx(USER))).json();
    expect(total_usd).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it("어느 영상에 썼는지도 함께 본다", async () => {
    const p = await createProject({
      ownerId: USER, settings: { target_seconds: 30 }, material: { text: "농구화 광고", photos: [] },
    });
    await spend(USER, 1, 1, p.id);
    const { rows } = await (await GET(req(ADMIN, "admin"), ctx(USER))).json();
    expect(rows[0].project_title).toContain("농구화");
  });

  // ★ 합계는 **전 기간**이라야 한다. 한 쪽만 더한 값에 "전체 사용 비용"이라 적으면 거짓말이다.
  it("★ 쪽을 나눠도 합계는 전 기간이다", async () => {
    for (let i = 1; i <= 5; i++) await spend(USER, i, 2);
    const res = await (await GET(req(ADMIN, "admin", "?limit=2"), ctx(USER))).json();
    expect(res.rows).toHaveLength(2);
    expect(res.has_more).toBe(true);
    expect(res.total_usd).toBe(10);
  });

  it("★ before 로 다음 쪽을 받는다 — 겹치지 않는다", async () => {
    for (let i = 1; i <= 5; i++) await spend(USER, i, 1);
    const p1 = await (await GET(req(ADMIN, "admin", "?limit=2"), ctx(USER))).json();
    const p2 = await (await GET(req(ADMIN, "admin", `?limit=2&before=${p1.rows.at(-1).ts}`), ctx(USER))).json();
    const ids = [...p1.rows, ...p2.rows].map((r) => r.request_id);
    expect(new Set(ids).size).toBe(4);
  });

  // ★ 이 문이 열리면 아무나 남의 지출을 들여다본다.
  it("일반 사용자는 못 본다", async () => {
    await spend(USER, 1, 1);
    const res = await GET(req(USER, "user"), ctx(USER));
    expect(res.status).toBe(403);
  });
});

// ★ 아래는 **사용자 목록** 라우트의 계약이다 — 잔액(크레딧)은 그 화면에 그대로 남는다.
//   바꾼 것은 "내역"이지 크레딧 지급·잔액이 아니다.
describe("백오피스 — 사용자 목록의 잔액", () => {
  beforeEach(() => resetMemoryStore());

  // ★ 잔액의 규칙은 한 벌이라야 한다. 사장님 화면은 버림인데(faa11d3) 백오피스는 날것을
  // 그대로 더해, 옛 amount_usd 행이 섞인 계정이 "505.18000000000006" 로 보였다(실측).
  it("목록의 잔액도 소수점을 버린다 — 사장님 화면과 같은 값이어야 한다", async () => {
    await getStore().insertProfile({ id: USER, email: "a@b.c", status: "approved", role: "user" });
    await getStore().insertGrant({ user_id: USER, amount_credits: 505.18, reason: "옛 달러 행", granted_by: ADMIN });

    const { users } = await (await usersGET(req(ADMIN, "admin"), {})).json();
    const row = users.find((u) => u.id === USER);
    expect(row.balance).toBe(505);
  });
});
