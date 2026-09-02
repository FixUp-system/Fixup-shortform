import { withUser } from "../../../../lib/auth/require-user.js";
import { getProject, getProjectForViewing, updateProject } from "../../../../lib/projects.js";
// ★ 줍기(아래 GET 머리말) — 접수증이 남아 있으면 fal 에서 끝난 결과를 걷어 문서에 꽂는다.
import { collectReelOneShot } from "../../../../lib/reel/pipeline.js";
// 자막 설정의 되돌리기 규칙은 lib 하나가 쥔다 — 라우트가 다시 적으면 갈린다.
import { normalizeSubtitle } from "../../../../lib/subtitles.js";

// reel 문서를 **읽는 문**.
//
// ★★ 이 자리가 비어 있던 것이 사고였다(2026-08-21, Task 12 브리핑 도중 발견). reel 을
//   `lib/projects.js` 의 KINDS 에 더한 순간 `isStepDoc(doc) = doc.kind == null` 이 거짓이
//   되어 `GET /api/projects/[id]` 도 함께 닫혔다(app/api/projects/[id]/route.js 의
//   isStepDoc 검사) — 격리를 옳게 만든 대가로 읽는 문이 사라졌는데, 계획이 그 대칭을 안
//   채웠다. film 이 같은 사고를 이미 겪었고(app/api/film/[id]/route.js 머리말 참고),
//   그 선례를 계획에 못 옮긴 것이 이 구멍의 원인이다.
//
// ★ 읽기는 **보기 전용 문**이다(2026-08-27 에 바뀌었다 — 아래 GET 머리말 참고).
//   고치는 문(PATCH)은 그대로 소유자 전용이다: updateProject 에 소유자를 넘긴다.
//
// ★ `kind !== "reel"` 검사 — 다른 reel 라우트들과 같은 결로 격리를 양방향으로 지킨다
//   (예: app/api/reel/[id]/clips/route.js 의 같은 검사, 2026-08-21 리뷰 I10).
//
// ★ 문구는 다른 reel 라우트와 같다("프로젝트를 찾을 수 없어요") — 같은 화면이 문에 따라
//   다른 말을 하면 안 된다.
//
// ★ 읽는 문과 만드는 문을 가른다 — 이 GET 은 아무것도 안 만들고 아무 값도 안 쓴다.
// ★★ 2026-08-27 — **보기 전용 문으로 바꿨다.** 옛 주석(바로 위)은 "reel 에는 보관함 전체
//   공유 요구가 없다 — 좁게 시작하는 쪽이 되돌리기 쉽다"였는데, 그 요구가 생겼다:
//   사장님이 레퍼런스 체크를 위해 **로그인 없이도** 보관함 전체를 보게 해 달라고 했다.
//   film·광고가 이미 같은 모양이라(loadFilmForViewing·loadAdForViewing) 그 결로 맞춘다.
//   ★ `mine` 을 함께 실어 보낸다 — 화면이 고치는 버튼을 그릴지 정하는 근거다.
//   ★ 고치는 문(PATCH, 아래)은 **그대로 소유자 전용**이다. 열린 것은 읽기뿐이다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  let viewed = await getProjectForViewing(id, user?.id ?? null);
  let project = viewed?.doc || null;
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }
  // ★★★ 줍기 — "읽는 문은 안 쓴다"의 **명시적 예외**다(2026-09-02 사장님 신고: 오류로
  //   멈췄다 이어서 하면 fal 에는 결과물이 있는데 보관함에서는 안 보인다).
  //   수거가 ⑤영상 상태 라우트에만 걸려 있어서, 보관함으로 바로 가면 아무도 안 걷었다.
  //   보관함 상세도 이 문을 부르므로(app/archive/[id]/page.js) 여기서 걷으면 양쪽이 산다.
  //   ★ 새로 만드는 것이 아니다 — 이미 값을 치른 결과를 **줍는** 것이다(fal 호출 0원,
  //     접수증 없으면 그대로 지나간다). ★ 소유자일 때만 — 남의 편을 손대지 않는다.
  if (viewed.mine && project.reel?.job?.requestId) {
    const got = await collectReelOneShot(id, user.id).catch(() => null);
    if (got?.changed) {
      viewed = (await getProjectForViewing(id, user.id).catch(() => null)) || viewed;
      project = viewed?.doc || project;
    }
  }
  return Response.json({ ...project, mine: viewed.mine, editable: viewed.editable });
}, { guest: true });

// reel 문서에 **자막 설정을 저장하는 문**(2026-08-25).
//
// ★★ 왜 새 문이 필요한가: 단계별 흐름이 쓰는 `/api/projects/[id]` 는 종류가 있는 문서를
//   `isStepDoc` 로 막아 404 를 준다(그 파일의 PATCH). reel 은 kind 가 있으니 그 문으로는
//   못 저장한다 — 그래서 이 문이다. **보내는 값의 모양은 단계별과 같다**
//   (`{ settings: { subtitle } }`) — 화면 하나(components/SubtitleEditor.jsx)가 두 흐름을
//   다 그리므로, 모양까지 갈리면 화면이 흐름마다 다른 몸통을 만들어야 한다.
//
// ★ 되돌리기 규칙을 여기서 새로 적지 않는다 — 목록 밖 글꼴·잘못된 색·범위 밖 크기·화면 밖
//   자리는 lib/subtitles.js 의 normalizeSubtitle 하나가 조용히 되돌린다(단계별 라우트와
//   같은 함수다). 400 으로 막지 않는 이유도 같다: 슬라이더를 끌다가 400 이 뜨면 성가시고,
//   되돌려도 사장님이 잃는 것이 없다.
//
// ★ **자막 설정만 받는다.** settings 를 통째로 머지하면 비율·모델·길이처럼 값이 나가는
//   설정이 이 문으로 함께 들어온다 — 그것들은 닫힌 목록과 결제 잠금이 붙어 있는 값이라
//   (app/api/projects/[id]/route.js 참고) 그물 없는 문을 새로 여는 셈이 된다.
export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body?.settings?.subtitle === undefined) {
    return Response.json({ error: "저장할 자막 설정이 없어요" }, { status: 400 });
  }

  try {
    const project = await updateProject(id, user.id, (p) => {
      // ★ 격리는 양방향이다 — 다른 종류의 문서가 이 문으로 들어오면 없는 것과 같이 답한다
      //   (다른 reel 라우트들과 같은 결, 위 GET 의 검사와 같은 문구다).
      if (p?.kind !== "reel") throw new Error("프로젝트를 찾을 수 없어요");
      return { ...p, settings: { ...p.settings, subtitle: normalizeSubtitle(body.settings.subtitle) } };
    });
    return Response.json(project);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 404 });
  }
});
