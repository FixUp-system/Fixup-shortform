import { getProjectRender } from "../../../../../../lib/projects";
import { withUser } from "../../../../../../lib/auth/require-user.js";

// 합성 상태 — doc 통짜가 아니라 render 만 읽는다(실측 13,236 → 3,113 bytes).
// 합성 대기가 최대 10분(=폴링 300회)이라 이 한 자리의 절감이 가장 오래 쌓인다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const st = await getProjectRender(id, user.id);
  if (!st) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json(st);
});
