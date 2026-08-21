import { withUser } from "../../../../lib/auth/require-user.js";
import { getProject } from "../../../../lib/projects.js";

// reel 문서를 **읽는 문**.
//
// ★★ 이 자리가 비어 있던 것이 사고였다(2026-08-21, Task 12 브리핑 도중 발견). reel 을
//   `lib/projects.js` 의 KINDS 에 더한 순간 `isStepDoc(doc) = doc.kind == null` 이 거짓이
//   되어 `GET /api/projects/[id]` 도 함께 닫혔다(app/api/projects/[id]/route.js 의
//   isStepDoc 검사) — 격리를 옳게 만든 대가로 읽는 문이 사라졌는데, 계획이 그 대칭을 안
//   채웠다. film 이 같은 사고를 이미 겪었고(app/api/film/[id]/route.js 머리말 참고),
//   그 선례를 계획에 못 옮긴 것이 이 구멍의 원인이다.
//
// ★ film 과 다르게 **소유자 범위**로 좁힌다 — 보기 전용(누구나 보는) 문이 아니라
//   `getProject` 를 쓴다. film 은 보관함 전체 공유가 요구지만 reel 에는 그런 요구가
//   없다 — 넓게 시작하면 나중에 좁힐 때 이미 공유된 것이 끊긴다. 좁게 시작하는 쪽이
//   되돌리기 쉽다.
//
// ★ `kind !== "reel"` 검사 — 다른 reel 라우트들과 같은 결로 격리를 양방향으로 지킨다
//   (예: app/api/reel/[id]/clips/route.js 의 같은 검사, 2026-08-21 리뷰 I10).
//
// ★ 문구는 다른 reel 라우트와 같다("프로젝트를 찾을 수 없어요") — 같은 화면이 문에 따라
//   다른 말을 하면 안 된다.
//
// ★ 읽는 문과 만드는 문을 가른다 — 이 GET 은 아무것도 안 만들고 아무 값도 안 쓴다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }
  return Response.json(project);
});
