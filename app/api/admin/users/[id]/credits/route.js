// POST /api/admin/users/[id]/credits — 운영자 수동 충전(회수는 음수).
// 결제가 붙기 전까지 크레딧이 들어오는 유일한 문이다.
import { getStore } from "../../../../../../lib/store/index.js";
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { balanceFor, videosLeft, perVideoUsd } from "../../../../../../lib/credits.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // 편수로 받는다 — 운영자도 사장님과 같은 말을 쓰게. 저장은 USD 다(원장과 같은 단위).
  const videos = Number(body?.videos);
  if (!Number.isInteger(videos) || videos === 0) {
    return Response.json({ error: "편수는 0 이 아닌 정수여야 해요" }, { status: 400 });
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return Response.json({ error: "사유를 적어 주세요" }, { status: 400 });
  }

  await getStore().insertGrant({
    user_id: id,
    amount_usd: videos * perVideoUsd(),
    reason,
    granted_by: user.id,
  });

  const balance = await balanceFor(id);
  return Response.json({ balance_usd: balance, videos_left: videosLeft(balance) });
}, { adminOnly: true });
