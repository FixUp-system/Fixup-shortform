// 컷 분할: 구성의 장면을 화면 단위로 쪼갠다. 컷의 화면 근거는 나레이션 문장이 아니라 장면의 '보여줌'이다.
// 모든 컷 화면은 AI가 새로 그린다. 업로드 사진은 화면에 직접 넣지 않고 참조(ref)로만 쓴다.
// 참조 사진은 컷이 고르지 않는다 — ②구성에서 장면이 정한 것을 컷이 물려받는다(validateCuts).
const CUTS_SYSTEM = `너는 숏폼 영상 편집자다. 확정된 구성의 장면을 컷으로 나눈다.
반드시 JSON 하나만 출력: {"cuts":[{"scene_idx":이 컷이 속한 장면 번호,"sentence":"컷의 나레이션 문장","seconds":초(2~15)}]}
규칙:
- 컷은 장면 경계를 넘지 않는다. 한 장면의 나레이션을 그 장면 안에서만 나누고, scene_idx로 어느 장면의 것인지 밝힌다.
- 한 장면이 짧으면 컷 하나로 두어도 된다. 억지로 쪼개지 않는다.
- 각 컷의 seconds는 그 문장을 자연스러운 속도로 읽는 실제 소요 시간으로 잡는다.
- 모든 컷의 화면은 AI가 새로 그린다. 화면의 근거는 그 장면의 '보여줌'이다.`;

export function buildCutsMessages(project) {
  const { script, synopsis } = project;
  const scenes = (synopsis?.scenes || [])
    .map((s, i) => `장면 ${i} (${s.role}) 약 ${s.seconds}초 / 보여줌: ${s.shows}`)
    .join("\n");
  const lines = script.paragraphs.map((p, i) => `장면 ${i}: ${p.text}`).join("\n");
  const user = `[구성]
앵글: ${synopsis?.angle || "(없음)"}
${scenes}
[대본 — 장면별 나레이션]
${lines}`;
  return { system: CUTS_SYSTEM, messages: [{ role: "user", content: user }] };
}

export function buildImagePrompt(cut, project) {
  const ar = project.settings.aspect_ratio;
  const orient = ar === "9:16" ? "vertical 9:16" : ar === "1:1" ? "square 1:1" : "horizontal 16:9";
  // 화면 근거는 장면의 '보여줌'이다. 나레이션 문장은 귀로 듣는 것이지 그릴 대상이 아니다.
  // 구성이 없는 옛 프로젝트는 예전처럼 문장으로 폴백한다.
  const scene = project.synopsis?.scenes?.[cut.scene_idx];
  const shows = scene?.shows || cut.sentence;
  // 주제 앵커 — 장면이 제품을 직접 안 담아도(가격·위치 장면 등) 전 컷이 같은 대상을 그리게 한다.
  const subject = project.briefing?.topic
    ? ` The video's subject is: ${project.briefing.topic}. Keep this exact product/subject consistent in every scene.`
    : "";
  let p = `High-quality photographic still for a short-form video, ${orient} composition. Scene: ${shows}.${subject} Cinematic lighting, realistic, no text or letters in the image.`;
  // 사장님이 사진을 갈아끼우면 구성의 ref가 낡을 수 있다. 실제로 첨부될 사진이 있을 때만
  // 첨부를 가리키는 지시를 붙인다(첨부 없이 "첨부를 참조하라"는 이미지 품질을 해친다).
  const refExists = cut.ref_photo_id && (project.material?.photos || []).some((p) => p.id === cut.ref_photo_id);
  if (refExists) {
    p += " Match the product/subject appearance to the attached reference image exactly (shape, colors, packaging).";
  }
  // 사용자가 구체적으로 지시한 수정 — 가장 강하게 반영한다
  if (cut.edit_instruction) {
    p += ` Important correction requested by the user, apply it strictly: ${cut.edit_instruction}.`;
  }
  return p;
}
