// DELETE /api/admin/codes/[code] — 잘못 만든 코드 지우기 (운영자 전용). **안 쓴 것만** 지운다.
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getStore } from "../../../../../lib/store/index.js";
import { normalizeCode } from "../../../../../lib/credit-codes.js";

export const DELETE = withUser(async (_req, { params }) => {
  const { code } = await params;
  const result = await getStore().deleteCreditCode(normalizeCode(decodeURIComponent(code || "")));
  if (result === "used") return Response.json({ error: "이미 사용된 코드는 지울 수 없어요" }, { status: 409 });
  if (result === "not_found") return Response.json({ error: "없는 코드예요" }, { status: 404 });
  return Response.json({ ok: true });
}, { adminOnly: true });
