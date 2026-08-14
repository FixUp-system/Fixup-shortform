import { getProjectProgress } from "../../../../../lib/projects";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { stalledFor } from "../../../../../lib/progress.js";

// 진행 상태만 묻는 자리 — "컷이 생겼나"를 2초마다 확인하는 ②대본·③목소리가 쓴다.
//
// 예전에는 그 자리가 load(id) 로 프로젝트 문서 전체를 받았다. 화면이 보는 것은
// "컷 개수가 0을 넘었나" 하나인데 실측 13,236 bytes 를 읽고 있었다(1/378 로 줄었다).
//
// 컷 내용은 여기서 주지 않는다. 다 만들어진 뒤 화면이 load(id) 를 한 번 부르면 된다 —
// 폴링 15회가 전부 통짜를 받는 것과, 15회는 35 bytes 이고 마지막에 한 번만 통짜를
// 받는 것의 차이다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const progress = await getProjectProgress(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!progress || progress.kind === "ad") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }
  // 심장박동(progress)은 셀렉터가 이미 실어 준다. 시간 차는 **서버가 뺀다** —
  // 브라우저 시계로 빼면 시계가 어긋난 PC 에서 시작하자마자 "멈췄어요"가 뜬다
  // (lib/progress.js stalledFor 주석).
  return Response.json({ ...progress, stalled_for_ms: stalledFor(progress, Date.now()) });
});
