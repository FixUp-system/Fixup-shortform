// GET /api/costs — 비용 기록 목록.
// 전사 원장이다 — 일반 사용자가 남의 지출과 프롬프트를 볼 이유가 없다.
import { withUser } from "../../../lib/auth/require-user.js";
import { listRecords } from "../../../lib/costs";

export const GET = withUser(async () => {
  const records = await listRecords();
  return Response.json({ records });
}, { adminOnly: true });
