// GET /api/credits — 내 잔액. 사이드바가 5분마다도 아니고 화면 진입 때 한 번 읽는다.
import { withUser } from "../../../lib/auth/require-user.js";
import { balanceFor, videosLeft, perVideoUsd } from "../../../lib/credits.js";

export const GET = withUser(async (_req, _ctx, user) => {
  const balance = await balanceFor(user.id);
  return Response.json({
    balance_usd: balance,
    videos_left: videosLeft(balance),
    per_video_usd: perVideoUsd(),
  });
});
