import { runInBackground } from "../../../../../lib/background.js";
import { getProject, updateProject } from "../../../../../lib/projects";
import { runVoicePipeline, withProgress } from "../../../../../lib/pipeline";
import { VOICES } from "../../../../../lib/voices";
import { fakeFal } from "../../../../../lib/fake";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { requireVideoCharge, NoCredits } from "../../../../../lib/charges.js";
import { modelIdForProject, projectSpeaks, resolutionForProject } from "../../../../../lib/clip-limits.js";

// ★★ 응답을 보낸 뒤에도 이 일이 계속 돌아야 한다 — 그것을 **플랫폼에 말해 줘야 한다**
//    (2026-08-18 프로덕션 실측). Vercel 에서 응답 후의 작업은 보장되지 않는다: `after()` 로
//    함수 수명을 그 약속까지 늘리고(lib/background.js 한 자리), `maxDuration` 으로 상한을 명시해야 한다. 둘 다 없어서
//    **클립 3개를 결제하고 2개만 저장됐고**(오류 기록조차 없다), 합성은 두 번 다 조용히 죽었다.
//    폴링이 우연히 그 인스턴스를 깨우면 진행되고 아니면 멈췄다 — 부분 성공과 전면 실패를 가른
//    것이 **운**이었다.
//
// ★ **약속(promise) 을 넘긴다 — 콜백이 아니다.** 콜백으로 넘기면 파이프라인이 요청 범위 밖에서
//   시작하고, 비용 주체는 AsyncLocalStorage 에서 읽으므로(lib/actor.js) 컨텍스트가 없으면
//   `costActor()` 가 **던진다**. 이 형태는 호출이 요청 안에서 일어나 컨텍스트가 따라간다.
// ★ 심장박동(startHeartbeat)은 이것을 막지 못한다 — 죽음을 보이게 하는 장치일 뿐이다.
//   근본 해결은 작업 큐·워커이고 별개 프로젝트다(CLAUDE.md).
//
// 컷마다 TTS.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!project || project.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // 읽을 컷이 있어야 한다 — 목소리는 컷별로 만든다.
  // 컷은 시나리오 확정이 나눈다(POST /cuts).
  if (!(project.cuts || []).length) {
    return Response.json({ error: "시나리오를 먼저 확정해 주세요" }, { status: 400 });
  }

  // ★ 말하는 모델에서는 클립이 목소리를 만든다 — 여기서 살 것이 없다.
  // 고른 목소리(voice_id)도 필요 없다: 대사와 목소리는 캐스팅(project.cast)에 있고
  // 클립 프롬프트가 그것을 싣는다.
  // 단계를 없애지 않는 이유는 Kling 경로가 그대로 쓰기 때문이다 — status 만 넘긴다.
  // 정가는 다음 문(/images)이 받는다. 아무것도 안 사는 자리에서 값을 물리지 않는다.
  if (projectSpeaks(project)) {
    await updateProject(id, user.id, (proj) => ({ ...proj, status: "voice", voice_error: null }));
    return Response.json({ skipped: true });
  }

  const body = await req.json().catch(() => ({}));
  // 가짜 모드에서는 voice_id 가 아직 비어 있어도 흐름을 확인할 수 있어야 한다.
  // 실제 호출에서는 목록에 있는 id 만 받는다(임의 문자열이 fal 로 새어 나가지 않게).
  const known = VOICES.some((v) => v.label === body?.voiceLabel);
  if (!known) return Response.json({ error: "목소리를 골라 주세요" }, { status: 400 });
  const voiceId = VOICES.find((v) => v.label === body.voiceLabel)?.id || "";
  if (!voiceId && !fakeFal()) {
    return Response.json({ error: "이 목소리는 아직 연결되지 않았어요" }, { status: 400 });
  }

  // 멱등 가드 — 이미 만든 소리를 통째로 지우고 다시 만들지 않는다(컷별 재생성으로 처리).
  // status 조건을 두지 않는다: 목소리가 끝나면 status 는 이미지·영상으로 계속 앞서 가므로,
  // status 로 판정하면 뒤 단계에서 소리를 다시 살 수 있다. 소리의 유무만 본다.
  if ((project.cuts || []).some((c) => c.audio)) {
    return Response.json(
      { error: "이미 만든 목소리가 있어요 — 컷별로 다시 만들 수 있어요" },
      { status: 409 }
    );
  }

  // 시작 게이트 + 청구 — 정가를 낸 프로젝트만 통과한다(/images·/clips 와 같은 문).
  // 목소리는 영상 정가에 포함이라(편당 ~$0.014) 정상 흐름에서는 그냥 지나간다.
  // 문을 다는 이유는 값이 아니라 **순서**다: 여기를 열어 두면 정가를 안 낸 프로젝트가
  // 소리를 갖추고 /clips(편당 ~$2.10) 앞까지 걸어 들어온다.
  // 가짜 모드는 건너뛴다 — 0원이라 받을 것이 없다(assertBudget 과 같은 규칙).
  if (!fakeFal()) {
    try {
      await requireVideoCharge({
        userId: user.id, projectId: id, seconds: project.settings?.target_seconds,
        model: modelIdForProject(project), resolution: resolutionForProject(project),
      });
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  // 시작 시각을 여기서 찍는다 — 첫 컷이 끝나기 전에 함수가 얼면 progress 가 아예 없어
  // "멈췄다"를 판정할 근거가 없다(컷마다 찍는 심장박동은 첫 컷이 끝나야 처음 뛴다).
  //
  // ★ done 은 손으로 0 을 박지 않고 withProgress 가 문서에서 센다 — 표식의 모양을
  //   두 곳에서 지으면 언젠가 조용히 어긋난다(끝남 판정을 lib/progress.js 한 벌로 모은 이유).
  // ★ 시각은 락 밖에서 잰다 — CAS 재시도로 patchFn 이 다시 불리기 때문이다(lib/projects.js).
  //
  // 위쪽 말하는 모델 분기(skipped)에는 찍지 않는다 — 거기서는 파이프라인을 던지지 않아
  // 뛸 심장이 없고, 찍어 두면 아무것도 안 도는 자리가 "살아 있음"으로 읽힌다.
  const startedAt = Date.now();
  await updateProject(id, user.id, (proj) =>
    withProgress(
      { ...proj, voice_id: voiceId, voice_label: body.voiceLabel, voice_error: null },
      "voice",
      startedAt
    )
  );

  // 비동기 시작 — 완료를 기다리지 않고 폴링으로 확인 (컷 파이프라인과 같은 방식)
  runInBackground(
    runVoicePipeline(id, user.id).catch(async (e) => {
      console.error("voice pipeline error:", e);
      await updateProject(id, user.id, (proj) => ({
        ...proj, voice_error: e?.message || "목소리를 만들지 못했어요",
      })).catch(() => {});
    })
  );
  return Response.json({ started: true });
});
