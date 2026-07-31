// GET /api/admin/users — 승인 대기·전체 사용자 목록 (운영자 전용)
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";

export const GET = withUser(async () => {
  return Response.json({ users: await getStore().listProfiles() });
}, { adminOnly: true });
