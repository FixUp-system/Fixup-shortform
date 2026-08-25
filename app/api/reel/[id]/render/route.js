import { withUser } from "../../../../../lib/auth/require-user.js";
import { runInBackground } from "../../../../../lib/background.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { putReel } from "../../../../../lib/reel/doc.js";
import { composeVideo } from "../../../../../lib/compose.js";
import { speechLangOf } from "../../../../../lib/subtitle-langs.js";
// 자막 시각 — 모델이 **언제** 말했는지를 재서 붙인다(2026-08-25 실측).
import { probeSpeech } from "../../../../../lib/speech-probe.js";
import { alignSpeech, needsSpeechProbe } from "../../../../../lib/speech-timing.js";

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

  await updateProject(id, user.id, (p) => putReel(p, { status: "rendering", error: null }));

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
  let timed = cuts;
  if (needsSpeechProbe(cuts) && !cuts.some((c) => Number(c?.spoken_start) > 0)) {
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
          putReel(p, { status: "error", error: e?.message || "합성하지 못했어요" })).catch(() => {});
      })
  );
  return Response.json({ ok: true });
});
