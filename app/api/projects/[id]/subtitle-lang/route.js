import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { BudgetExceeded } from "../../../../../lib/costs.js";
import { isSubtitleLang } from "../../../../../lib/subtitle-langs.js";
import { buildTranslateMessages, validateTranslation, isSubtitleStale } from "../../../../../lib/translate.js";

// 자막 언어를 저장하고, 낡은 컷만 번역한다.
//
// ★ 값이 나가는 자리다(브리핑·subtitle/route.js 와 같은 이유로 남긴다):
// - 한국어는 원문이 곧 자막이라 모델을 아예 안 부른다.
// - 낡은 컷(isSubtitleStale)만 모아 **한 번**에 번역한다 — 컷마다 부르면 호출 수만큼 값이 나간다.
// - 무음 컷(silent:true)은 문장이 없다 — 번역 대상에서 뺀다(lib/translate.js buildTranslateMessages
//   와 달리, 여기서는 애초에 부를 목록에 넣지 않는다. 자리 유지는 그 함수 안에서만 필요하다).
// - 검증기가 개수를 못 맞추면 통째로 버린다 — 절반만 저장하면 어느 컷이 새 언어인지 알 길이 없다.
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const lang = body?.lang;
  if (!isSubtitleLang(lang)) {
    return Response.json({ error: `모르는 자막 언어예요: ${lang}` }, { status: 400 });
  }

  const cuts = project.cuts || [];
  // 무음 컷은 애초에 옮길 문장이 없으니 번역 대상에서 뺀다.
  const staleCuts = cuts
    .map((c, i) => ({ cut: c, i }))
    .filter(({ cut }) => !cut?.silent && isSubtitleStale(cut, lang));

  let lines = null;
  if (staleCuts.length > 0) {
    const msg = buildTranslateMessages(staleCuts.map(({ cut }) => cut), lang);
    let raw;
    try {
      raw = await callJson({ system: msg.system, messages: msg.messages, stage: "자막 번역", projectId: id });
    } catch (e) {
      // 예산 오류는 삼키지 않는다 — withUser 까지 올라가야 402/503 이 된다.
      if (e instanceof BudgetExceeded) throw e;
      console.error("자막 번역 호출 실패:", e);
      return Response.json({ error: e?.message || "번역을 부르지 못했어요" }, { status: 502 });
    }
    lines = validateTranslation(raw, staleCuts.length);
    if (!lines) {
      // 개수가 안 맞으면 통째로 버린다 — 저장하지 않는다(부분 저장은 짝이 어긋난 채로 남는다).
      return Response.json({ error: "번역 결과가 컷 수와 맞지 않아 저장하지 않았어요" }, { status: 502 });
    }
  }

  const updated = await updateProject(id, user.id, (proj) => {
    if (!lines) {
      return { ...proj, settings: { ...proj.settings, subtitle_lang: lang } };
    }
    const nextCuts = (proj.cuts || []).map((cut, i) => {
      const idx = staleCuts.findIndex((s) => s.i === i);
      if (idx === -1) return cut;
      return {
        ...cut,
        subtitles: { ...cut.subtitles, [lang]: { text: lines[idx], of: cut.sentence } },
      };
    });
    return { ...proj, settings: { ...proj.settings, subtitle_lang: lang }, cuts: nextCuts };
  });

  return Response.json({ settings: updated.settings, cuts: updated.cuts });
});
