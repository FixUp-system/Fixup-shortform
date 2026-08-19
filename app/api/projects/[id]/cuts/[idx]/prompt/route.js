import { getProject, isStepDoc } from "../../../../../../../lib/projects";
import { withUser } from "../../../../../../../lib/auth/require-user.js";
import { buildImagePrompt, promptBodyOf } from "../../../../../../../lib/cuts";
import { loadCutRefs } from "../../../../../../../lib/cut-refs.js";

// 이 컷 그림 프롬프트의 **꼬리**를 준다 — 레퍼런스 절까지 포함해서.
//
// 왜 라우트인가: 레퍼런스 절은 resolveCutRefs → readRefBytes 를 거쳐야 알 수 있고 그 판정이
// `fs`·Storage 를 끈다. 화면("use client")은 그것을 부를 수 없어서, ④이미지의 [전문 복사]가
// 그 절이 **빠진** 프롬프트를 복사하고 있었다.
//
// ★ 왜 전문이 아니라 꼬리인가: 본문은 사장님이 지금 화면에서 고치는 중일 수 있다(아직 저장
//   안 한 글자). 꼬리는 본문에 딸리지 않으므로(buildImagePrompt = 본문 + 공통지시 + 꼬리)
//   화면이 **자기 본문 + 이 꼬리**를 이으면 "저장하면 나갈 글자"가 정확히 나온다.
//   전문을 주면 방금 고친 본문이 서버의 옛 본문으로 덮인다.
//
// ★ 값이 드는 일을 하지 않는다 — 읽기뿐이다(fal·LLM 호출 0). 그래서 크레딧 게이트도 없다.
//   대신 Storage 를 읽으므로(레퍼런스 바이트) 컷 하나씩만 답한다.
//
// ⚠️ missing 을 함께 준다. 고른 레퍼런스와 실제로 실린 레퍼런스는 다를 수 있고(I/O 실패),
//    그때 그림은 그 사진 없이 그려진다 — 사장님이 그것을 모르면 왜 자기 제품이 안 나왔는지
//    알 수 없다.
export const GET = withUser(async (req, { params }, user) => {
  const { id, idx } = await params;
  const project = await getProject(id, user.id);
  // 종류가 있는 문서(광고·film)는 이 경로가 다루지 않는다 — 없는 것과 같이 404 다(clips 라우트와 같은 규칙).
  if (!isStepDoc(project)) {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }
  const cut = (project.cuts || []).find((c) => c.idx === Number(idx));
  if (!cut) return Response.json({ error: "컷을 찾을 수 없어요" }, { status: 404 });

  const { refs, resolved, missing } = await loadCutRefs(cut, project);

  // ★ 꼬리를 **떼어 낸다**(직접 조립하지 않는다). imagePromptTail 은 감춘 함수이고,
  //   "전체 프롬프트는 언제나 본문으로 시작한다"가 lib/cuts.js 의 불변이다
  //   (tests/prompt-override.test.js 가 못 박는다). 여기서 꼬리를 따로 조립하면 그 문형이
  //   갈려, 사장님이 복사해 간 글이 실제와 달라진다.
  const body = promptBodyOf("image", cut, project);
  const tail = buildImagePrompt(cut, project, refs).slice(body.length);
  // 화면이 혼자 만들 수 있는 꼬리(레퍼런스 없음) — 차이를 화면이 알아야 "정확해졌다"고
  // 말할 수 있고, 테스트도 이 둘을 비교해 레퍼런스 절이 실렸는지 잰다.
  const tail_without_refs = buildImagePrompt(cut, project, []).slice(body.length);

  return Response.json({
    tail,
    tail_without_refs,
    missing,
    // 바이트는 싣지 않는다 — 화면이 쓸 일이 없고, 응답만 무거워진다(사진 원본이다).
    refs: refs.map((r) => ({ kind: r.kind, who: r.who || null, key: r.key || null })),
    picked: resolved.length,
  });
});
