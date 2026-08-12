import { getProjectRender } from "../../../../../../lib/projects";
import { withUser } from "../../../../../../lib/auth/require-user.js";

// 합성 상태 — doc 통짜가 아니라 render 만 읽는다(실측 13,236 → 3,113 bytes).
// 합성 대기가 최대 10분(=폴링 300회)이라 이 한 자리의 절감이 가장 오래 쌓인다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const st = await getProjectRender(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!st || st.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json(st);
});
