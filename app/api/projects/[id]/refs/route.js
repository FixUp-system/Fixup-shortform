import { getProject } from "../../../../../lib/projects";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { loadRefUsage } from "../../../../../lib/cut-refs.js";

// 이 프로젝트의 **어느 사진이 어느 컷에 실렸는지**를 한 번에 준다.
//
// 왜 라우트인가: 판정(resolveCutRefs → readRefBytes)이 `fs`·Storage 를 끈다 —
// 화면("use client")은 부를 수 없다. 그래서 ④이미지는 사장님이 올린 사진 5장 중 1장만
// 실렸다는 사실을 한 마디도 하지 못했다.
//
// ★ 왜 컷 하나씩(cuts/[idx]/prompt)이 아니라 통째인가: 그 라우트는 "이 컷의 프롬프트 꼬리"를
//   주는 자리라 컷 하나씩만 답한다. 화면이 필요로 하는 것은 **전체 그림**이다 —
//   "어느 컷에도 안 쓰인 사진"은 컷 하나만 봐서는 알 수 없고, 컷마다 부르면 요청이 컷 수만큼
//   늘고 같은 사진 바이트를 컷마다 다시 내려받는다. 여기서는 키마다 한 번만 읽는다.
//
// ★ 값이 드는 일을 하지 않는다 — 읽기뿐이다(fal·LLM 호출 0). 그래서 크레딧 게이트도 없다.
export const GET = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // 광고 문서는 이 경로가 다루지 않는다 — 없는 것과 같이 404 다(prompt 라우트와 같은 규칙).
  if (!project || project.kind === "ad") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }
  // 바이트는 싣지 않는다 — 화면이 쓸 일이 없고 응답만 무거워진다(사진 원본이다).
  return Response.json(await loadRefUsage(project));
});
