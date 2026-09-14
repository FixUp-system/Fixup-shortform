// POST /api/credits/redeem — 크레딧 코드 등록 (본인, 2026-09-14)
//
// ★ 승인 대기 계정도 받는다(pending: true). 와디즈 서포터가 가입 직후 코드를 넣어 두면
//   크레딧은 쌓이고 쓰는 것은 승인 뒤다 — 운영자는 /admin/codes 에서 등록한 계정을 보고 승인한다.
//   차단된 계정은 여전히 403 이다.
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";
import { balanceFor } from "../../../../lib/charges.js";
import { normalizeCode, isCodeShape, redeemReason } from "../../../../lib/credit-codes.js";

export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(body?.code);
  if (!isCodeShape(code)) {
    return Response.json({ error: "코드 모양이 맞지 않아요 — 메일에 적힌 12자리를 확인해 주세요" }, { status: 400 });
  }
  const { result, credits } = await getStore().redeemCreditCode(code, user.id, redeemReason(code));
  if (result === "not_found") return Response.json({ error: "없는 코드예요 — 글자를 다시 확인해 주세요" }, { status: 404 });
  if (result === "used") return Response.json({ error: "이미 사용된 코드예요" }, { status: 409 });
  return Response.json({ credits, balance: await balanceFor(user.id) });
}, { pending: true });
