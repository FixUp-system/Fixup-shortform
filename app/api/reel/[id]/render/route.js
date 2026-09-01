import { withUser } from "../../../../../lib/auth/require-user.js";
import { runInBackground } from "../../../../../lib/background.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { putReel } from "../../../../../lib/reel/doc.js";
// ★ 진행 표식 — 사이드바가 ⑤영상과 ⑥완성을 가르는 유일한 근거다(둘 다 status 가
//   "rendering" 이다). lib/reel/steps.js 의 runningReelStepKey 가 이 값을 읽는다.
import { reelProgress } from "../../../../../lib/reel/pipeline.js";
import { composeVideo } from "../../../../../lib/compose.js";
import { speechLangOf } from "../../../../../lib/subtitle-langs.js";
// 자막 시각 — 모델이 **언제** 말했는지를 재서 붙인다(2026-08-25 실측).
import { probeSpeech } from "../../../../../lib/speech-probe.js";
import { alignSpeech, needsSpeechProbe } from "../../../../../lib/speech-timing.js";
import { narrationUnits } from "../../../../../lib/reel/narration.js";

// 완성 — 컷마다 만든 클립을 이어 붙이고 자막을 태운다. lib/compose.js 의 composeVideo
// 하나가 그 둘을 다 한다(합성이 곧 자막 굽기다) — 새 장치를 만들지 않는다.
//
// ★ 유료 입구가 아니다(/clips 와 다르다). 합성은 로컬 ffmpeg 라 fal 지출이 0원이고,
//   requireVideoCharge 는 여기 없다(app/api/projects/[id]/render/route.js 와 같은 이유).
//
// ★★ 응답을 보낸 뒤에도 이 일이 계속 돌아야 한다 — 플랫폼에 말해 줘야 한다(2026-08-18
//    프로덕션 실측). maxDuration 없이 fire-and-forget 을 쓰면 클립 결제·저장이 조용히
//    끊긴 전례가 있다(app/api/projects/[id]/clips/route.js 머리말).
// ★ **약속(promise)을 넘긴다 — 콜백이 아니다.** costActor() 가 요청 컨텍스트를 요구한다.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }

  const cuts = project.cuts || [];
  if (!cuts.some((c) => c.video?.url)) {
    return Response.json({ error: "영상을 먼저 만들어 주세요" }, { status: 400 });
  }

  // ★★★ 2026-09-01 — **표식을 함께 찍는다.** status 는 /clips 와 똑같이 "rendering"
  //   이라 그것만으로는 굽는 중인지 합성 중인지 알 수 없었다. phase 를 "render" 로
  //   남기면 사이드바가 ⑥완성 줄에 표시를 붙인다.
  //   ⚠️ 덤으로 STALL_EXEMPT_PHASES(["render"]) 가 비로소 뜻을 갖는다 — 그전에는
  //     reel 에서 이 phase 가 한 번도 안 쓰여 그 면제가 죽은 코드였다.
  await updateProject(id, user.id, (p) =>
    reelProgress(putReel(p, { status: "rendering", error: null }), "render", Date.now()));

  // ★★ **말한 때를 재서 자막에 반영한다**(2026-08-25 사장님 지시).
  //
  // 우리 자막은 컷 경계 누적으로 시각을 잡는데(lib/subtitles.js 의 buildCues),
  // 한 클립 안에 대사가 여럿이면 모델이 자기 리듬으로 말해 어긋난다 — 떡볶이 15초
  // 실측에서 최대 2초, **방향도 제각각**이었다(+0.03 · +1.47 · -0.41 · -1.99).
  // 상수 보정이 안 되므로 재는 수밖에 없다.
  //
  // ★ **글자는 안 받는다** — 같은 실측에서 모델이 "끓이기"를 "끄기"로 말했다.
  //   whisper 는 시각만 답하고 글자는 시나리오가 답한다(lib/speech-timing.js).
  // ★ 못 재도 그대로 간다 — 자막 하나 때문에 이미 값을 다 치른 한 편을 잃을 수 없다.
  // ★ 재고 난 것은 문서에 남긴다 — 다시 합성할 때 또 재면 값이 두 번 나간다.
  // ★★ 2026-08-27 — 자막 원천이 **한 벌**이면 그것을 넘긴다. 새 길에서는 말이 컷이 아니라
  //   `scenario.narration` 에 살아 컷의 sentence 가 비므로, 안 넘기면 완성본에 자막이
  //   통째로 없다(lib/reel/narration.js 의 narrationUnits · lib/compose.js 의 subtitleCutsOf).
  // ★ 길이는 **구운 클립의 합**이다 — 계획 초가 아니라 실제로 화면에 있는 시간이라야
  //   마지막 자막이 영상 밖으로 안 나간다.
  // ★ 옛 문서는 null 이라 그 자리가 통째로 없다 — 예전 길 그대로다.
  const units = narrationUnits(
    project,
    cuts.reduce((a, c) => a + (Number(c?.video?.seconds) || 0), 0)
  );

  let timed = cuts;
  // ★★ 2026-08-28 — **한 벌이 있으면 재지 않는다.** whisper 가 잰 시각은 컷에 박히는데
  //   (spoken_start) 자막은 한 벌 단위에서 나오므로(위 units) **잰 값을 읽는 자리가 없다.**
  //   그런데도 불렸다: needsSpeechProbe 는 "대사가 있는 컷이 둘 이상인가"를 보는데,
  //   시나리오가 한 벌을 컷 line 에 조각내 적어 두면 참이 된다(에너지 음료 실측: 컷 다섯).
  //   값은 작지만($0.0006/초) 쓰지 않을 값을 재려고 fal 을 부르고 몇 초를 기다린다.
  // ★ 컷 line 은 **지우지 않는다** — 한 벌이 빠졌을 때 옛 길(컷 자막)로 떨어지는 안전망이다.
  // ★ 옛 문서는 units 가 null 이라 이 조건이 참이 되어 **예전 그대로** 잰다(회귀 0).
  if (!units && needsSpeechProbe(cuts) && !cuts.some((c) => Number(c?.spoken_start) > 0)) {
    const clipUrl = cuts.find((c) => c?.video?.url)?.video?.url;
    const seconds = cuts.reduce((a, c) => a + (Number(c?.video?.seconds) || 0), 0);
    const chunks = await probeSpeech(clipUrl, { projectId: id, seconds });
    if (chunks.length) {
      timed = alignSpeech(cuts, chunks);
      await updateProject(id, user.id, (p) => ({
        ...p,
        cuts: (p.cuts || []).map((c, i) => (timed[i] ? { ...c, spoken_start: timed[i].spoken_start, spoken_seconds: timed[i].spoken_seconds } : c)),
      })).catch(() => {});
    }
  }


  runInBackground(
    composeVideo({
      projectId: id,
      cuts: timed,
      narrationUnits: units,
      aspect_ratio: project.settings?.aspect_ratio || "9:16",
      subtitle: project.settings?.subtitle,
      lang: project.settings?.subtitle_lang || speechLangOf(project),
      sourceLang: speechLangOf(project),
    })
      .then(async (result) => {
        await updateProject(id, user.id, (p) =>
          putReel(p, {
            status: "done",
            // ★★ ts — **각인 시각**이다(2026-08-25). 완성본 주소는 다시 구워도 늘 같아서
            //   (/api/renders/<id>.mp4) 이 값이 없으면 브라우저가 옛 파일을 그대로 쓴다.
            //   단계별 흐름은 이미 이 처방을 쓴다(app/create/[id]/done/page.js 의 ?v=).
            //   ★ app/api/renders/[name]/route.js 의 ETag 도 이 값을 읽는다 — 없으면
            //     ETag 가 아예 안 나가 볼 때마다 전량이 다시 전송된다.
            video: { url: result.url, seconds: result.seconds, ts: Date.now() },
            error: null,
          }));
      })
      .catch(async (e) => {
        console.error("reel render error:", e);
        await updateProject(id, user.id, (p) =>
          // ★ 어느 단계의 실패인지 적는다(2026-08-25) — reelErrorFor 가 이 값으로 가른다.
          putReel(p, { status: "error", error: e?.message || "합성하지 못했어요", errorStep: "done" })).catch(() => {});
      })
  );
  return Response.json({ ok: true });
});
