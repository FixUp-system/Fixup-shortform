// GET /api/admin/users/[id]/ledger — 운영자가 한 사람의 크레딧 내역을 본다 (운영자 전용).
//
// 문의는 "크레딧이 왜 줄었냐"로 온다. 운영자가 사장님과 **같은 화면**을 못 보면 답할 수 없다.
// 그래서 합치는 규칙을 다시 적지 않고 lib/ledger-read.js 를 그대로 부른다 — 두 화면이
// 서로 다른 값을 말하는 순간 어느 쪽이 맞는지 아무도 모른다.
//
// ★ adminOnly 다. 이 문이 열리면 아무나 남의 지출을 들여다본다.
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { readLedger, ledgerLimit } from "../../../../../../lib/ledger-read.js";

export const GET = withUser(async (req, { params }) => {
  const { id } = await params;
  const url = new URL(req.url || "http://localhost/l");
  const before = Number(url.searchParams.get("before")) || undefined;
  return Response.json(await readLedger(id, { limit: ledgerLimit(url.searchParams.get("limit")), before }));
}, { adminOnly: true });
