import { getProjectRender, isStepDoc } from "../../../../../../lib/projects";
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { stalledFor } from "../../../../../../lib/progress.js";

// 합성 상태 — doc 통짜가 아니라 render 만 읽는다(실측 13,236 → 3,113 bytes).
// 합성 대기가 최대 10분(=폴링 300회)이라 이 한 자리의 절감이 가장 오래 쌓인다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const st = await getProjectRender(id, user.id);
  // ★ 이 경로는 **종류가 없는 옛 문서**만 다룬다 — 광고는 /api/ads/*, film 은 /api/film/* 이 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!isStepDoc(st)) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  // 심장박동(progress)은 셀렉터가 이미 실어 준다. 시간 차는 **서버가 뺀다** —
  // 브라우저 시계로 빼면 시계가 어긋난 PC 에서 시작하자마자 "멈췄어요"가 뜬다
  // (lib/progress.js stalledFor 주석). 합성 자체는 STALL_EXEMPT_PHASES 라 임계에
  // 안 걸리지만, 다섯이 같은 것을 싣는 편이 어긋남을 막는다.
  return Response.json({ ...st, stalled_for_ms: stalledFor(st, Date.now()) });
});
