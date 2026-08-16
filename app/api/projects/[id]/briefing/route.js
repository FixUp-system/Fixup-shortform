// ①자료는 되묻지 않는다(2026-08-16) — 사장님은 설명 하나를 적고 바로 ②시나리오로 간다.
// 그래서 이야기 소재를 청하던 `kind:"develop"` 경로는 통째로 사라졌다. 빈칸을 미리 캐물어야
// 할지는 시나리오를 만들어 봐야 알 수 있는 것이었고, 실제로 부르는 화면도 이미 없었다.
import { getProject, updateProject } from "../../../../../lib/projects";
import { mergeAsked, briefingContentChanged } from "../../../../../lib/briefing";
import { extractBriefing } from "../../../../../lib/briefing-extract";
import { withUser } from "../../../../../lib/auth/require-user.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!project || project.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.material?.text?.trim()) {
    return Response.json({ error: "정리할 자료가 없어요" }, { status: 400 });
  }

  // 추출 루프는 lib 로 옮겼다 — 자동 관통(lib/auto.js)이 같은 함수를 부른다.
  const briefing = await extractBriefing(project);
  if (!briefing) {
    return Response.json({ error: "자료를 정리하지 못했어요. 직접 채우거나 다시 시도해 주세요." }, { status: 502 });
  }

  // 이미 답한 이력은 보존하고, 질문 라운드는 1회로 코드가 강제한다.
  // (프롬프트로도 지시하지만 LLM이 어길 수 있으므로 여기서 잘라낸다)
  const updated = await updateProject(id, user.id, (proj) => {
    const asked = mergeAsked(proj.briefing?.asked, briefing.asked);
    const next = {
      ...briefing,
      asked,
      confirmed: proj.briefing?.confirmed || false,
      version: proj.briefing?.version || 1,
    };
    // 재추출로 내용이 달라졌으면 버전을 올린다 — 확정된 프로젝트에서 다시 정리했는데도 버전이 그대로면
    // 대본 화면이 "브리핑이 바뀌었어요"를 띄우지 못한다. (첫 추출은 바뀐 것이 아니다)
    if (proj.briefing && briefingContentChanged(proj.briefing, next)) next.version += 1;
    // 재추출은 브리핑 내용을 갱신하는 것이지 진행을 취소하는 게 아니다 —
    // 이미 나아간 status와 확정 여부는 되감지 않는다(되감으면 만든 이미지가 잠긴다).
    return {
      ...proj,
      status: proj.status === "draft" ? "briefing" : proj.status,
      briefing: next,
    };
  });
  return Response.json({ briefing: updated.briefing });
});
