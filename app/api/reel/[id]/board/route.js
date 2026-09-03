// GET /api/reel/[id]/board — **사람이 보는 스토리보드 한 장**을 그려서 흘려준다.
//
// ★★ r2v 시트(/sheet)와 **다른 산출물**이다. 시트는 모델이 먹는 격자 그림이고 글자가 없다.
//   이쪽은 번호·타임코드·카메라·연기·대사가 붙은 보드다. 같은 cuts 에서 나오지만 섞지 않는다.
//
// ★ 버킷에 저장하지 않고 **그 자리에서 그려 보낸다**. /sheet 가 이미 같은 모양이고,
//   저장하면 "컷을 고쳤는데 보드는 옛것"이라는 낡음 문제가 새로 생긴다. 값은 0원이라
//   (fal 도 LLM 도 안 부른다) 다시 그리는 것이 싸다.
//
// ★ 소유자 검사는 getProject 가 한다(소유자 인자가 필수다 — 이 저장소의 방어선).
// ★ 그림 바이트는 **우리 버킷에서 직접** 읽는다. 화면이 준 주소를 그대로 열면 아무 URL 이나
//   우리 서버로 내려받게 하는 문이 된다(SSRF) — 그래서 문서가 쥔 컷의 주소에서 **키만**
//   떼어 uploads 버킷을 본다.
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject } from "../../../../../lib/projects.js";
import { getStore } from "../../../../../lib/store/index.js";
import { drawBoard } from "../../../../../lib/reel/board.js";

// 굽는 데 몇 초 걸린다 — 배포 기본값에 잘리면 사장님에게는 정체불명의 실패로 보인다
// (2026-09-02 에 시나리오 라우트에서 그 모양을 겪었다).
export const maxDuration = 60;

const keyOf = (url) => {
  const m = String(url || "").match(/^\/api\/uploads\/([A-Za-z0-9._-]+)$/);
  return m ? m[1] : null;
};

export const GET = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }
  const cuts = project.cuts || [];
  if (!cuts.length) {
    return Response.json({ error: "아직 컷이 없어요" }, { status: 400 });
  }

  const store = getStore();
  const readImage = async (url) => {
    const key = keyOf(url);
    if (!key) throw new Error("우리 버킷의 그림이 아니에요");
    return store.getObject("uploads", key);
  };

  const { bytes } = await drawBoard({ project, cuts, readImage });

  // ★★★ **한 주소가 미리보기와 내려받기를 겸할 수 없다.** `attachment` 를 늘 붙였더니
  //   화면의 <img> 가 아무것도 못 그렸다(브라우저가 그 응답을 강제 저장으로 처리한다 —
  //   2026-09-02, 실제로 열어 보고 알았다. 테스트도 빌드도 그린이었다).
  //   그래서 `?download=1` 일 때만 attachment 다. 화면은 그냥 열고, [내려받기]만 그 인자를 준다.
  const wantsFile = new URL(req.url).searchParams.has("download");
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      // 이름을 우리가 준다 — 누르면 저장이 되고, 파일명으로 어느 편인지 알 수 있다.
      "Content-Disposition": `${wantsFile ? "attachment" : "inline"}; filename="storyboard-${id.slice(0, 8)}.png"`,
      // ★★★ 2026-09-03 — **주소에 내용 지문(`?v=`)이 실리면 오래 쥐어도 안전하다**
      //   (lib/reel/board-key.js). 컷을 고치면 화면이 만드는 주소가 달라져 **자동으로**
      //   새로 그려지므로, 낡은 그림이 남을 길이 없다.
      //   그전에는 60초였고, 그래서 화면을 다시 열 때마다 보드를 다시 그렸다 —
      //   사장님이 "매번 불러오는 데 시간이 걸린다"고 한 자리다.
      // ★ `v` 가 없는 옛 주소(북마크·직접 호출)는 **짧게** 쥔다 — 그 주소는 내용이
      //   바뀌어도 그대로라 오래 쥐면 낡은 그림이 굳는다.
      "Cache-Control": new URL(req.url).searchParams.has("v")
        ? "private, max-age=31536000, immutable"
        : "private, max-age=60",
    },
  });
});
