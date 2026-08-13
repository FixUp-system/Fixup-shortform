// GET /api/admin/users/[id]/ledger — 운영자가 한 사람의 크레딧 내역을 본다.
//
// 문의는 "크레딧이 왜 줄었냐"로 온다. 운영자가 같은 화면을 못 보면 답할 수가 없다.
// 사장님 화면과 **같은 것을 부른다**(lib/ledger-read.js) — 둘이 다른 값을 말하면 안 된다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject } from "../lib/projects.js";
import { chargeVideo } from "../lib/charges.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET } from "../app/api/admin/users/[id]/ledger/route.js";
import { GET as usersGET } from "../app/api/admin/users/route.js";

const USER = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";

const req = (uid, role) => ({
  url: "http://localhost/api/admin/users/x/ledger",
  headers: new Headers({ [USER_HEADER]: uid, [STATUS_HEADER]: "approved", [ROLE_HEADER]: role }),
});
const ctx = (id) => ({ params: Promise.resolve({ id }) });

describe("백오피스 — 한 사람의 크레딧 내역", () => {
  beforeEach(() => resetMemoryStore());

  const setup = async () => {
    await getStore().insertGrant({ user_id: USER, amount_credits: 500, reason: "충전", granted_by: ADMIN });
    const p = await createProject({
      ownerId: USER, settings: { target_seconds: 30 }, material: { text: "농구화 광고", photos: [] },
    });
    return chargeVideo({ userId: USER, projectId: p.id, seconds: 30 });
  };

  it("운영자는 남의 내역을 본다 — 문의에 답하려면 필요하다", async () => {
    const paid = await setup();
    const { rows, balance } = await (await GET(req(ADMIN, "admin"), ctx(USER))).json();
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.kind === "video").delta).toBe(-paid);
    expect(balance).toBe(500 - paid);
  });

  it("어느 영상에 썼는지도 함께 본다", async () => {
    await setup();
    const { rows } = await (await GET(req(ADMIN, "admin"), ctx(USER))).json();
    expect(rows.find((r) => r.kind === "video").project_title).toContain("농구화");
  });

  // ★ 이 문이 열리면 아무나 남의 지출을 들여다본다.
  it("일반 사용자는 못 본다", async () => {
    await setup();
    const res = await GET(req(USER, "user"), ctx(USER));
    expect(res.status).toBe(403);
  });

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