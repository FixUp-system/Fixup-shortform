// GET /api/reel/[id]/sheet — 스토리보드 **원본 한 장**을 파일로 내려준다.
//
// ★★ 왜 라우트가 필요한가: 그 한 장은 우리 버킷이 아니라 **fal CDN**에 있다(칸만 잘라
//   우리 버킷에 둔다 — lib/reel/storyboard.js 의 saveStoryboardCells). 다른 출처라
//   `<a download>` 가 안 먹어서, 링크를 누르면 저장이 아니라 그냥 열린다.
//   여기서 바이트를 받아 우리 이름으로 흘려주면 그때 저장이 된다
//   (완성본 라우트 app/api/renders/[name] 이 쓰는 것과 같은 처방).
//
// ★ 주소는 문서가 쥔 값 하나다(reelSheetUrl) — 화면이 준 주소를 그대로 받아 열면
//   아무 URL 이나 우리 서버로 내려받게 하는 문이 된다(SSRF).
// ★ 소유자 검사는 getProject 가 한다(소유자 인자가 필수다).
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject } from "../../../../../lib/projects.js";
import { reelSheetUrl } from "../../../../../lib/reel/oneshot.js";
import { fetchImageBytes } from "../../../../../lib/reel/storyboard.js";

export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }
  const url = reelSheetUrl(project.cuts || []);
  if (!url) return Response.json({ error: "스토리보드가 아직 없어요" }, { status: 404 });

  let bytes;
  try {
    bytes = await fetchImageBytes(url);
  } catch (e) {
    // 왜 못 받았는지는 반드시 로그에 남긴다 — 조용한 404 는 원인을 지운다.
    console.error(`스토리보드 원본 조회 실패: ${id} — ${e?.message || e}`);
    return Response.json({ error: "스토리보드를 가져오지 못했어요" }, { status: 502 });
  }

  return new Response(bytes, {
    headers: {
      // fal 이 주는 것은 png·jpg 둘 다 가능하다 — 확장자로 고른다(모르면 png).
      "Content-Type": url.includes(".jpg") || url.includes(".jpeg") ? "image/jpeg" : "image/png",
      "Content-Disposition": `attachment; filename="storyboard-${id}.png"`,
      // 같은 프로젝트의 같은 한 장이라 내용이 안 바뀐다(다시 그리면 주소가 바뀐다).
      "Cache-Control": "private, max-age=3600",
    },
  });
});
