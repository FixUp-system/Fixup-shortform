// 컷 분할: 대본 → 컷(문장·초·레퍼런스) / 이미지 프롬프트 생성.
// 모든 컷 화면은 AI가 새로 그린다. 업로드 사진은 화면에 직접 넣지 않고 참조(ref)로만 쓴다.
const CUTS_SYSTEM = `너는 숏폼 영상 편집자다. 대본을 컷으로 나눈다.
반드시 JSON 하나만 출력: {"cuts":[{"sentence":"컷의 나레이션 문장","seconds":초(2~15),"ref_photo_id":"이 컷에 사진 속 피사체가 나오면 참조할 사진 id(없으면 생략)"}]}
규칙:
- 문장·호흡 단위로 나누고, 각 컷의 seconds는 그 문장을 자연스러운 속도로 읽는 실제 소요 시간으로 잡는다.
- 모든 컷의 화면은 AI가 새로 그린다. 업로드 사진을 화면에 그대로 넣지 않는다.
- 컷에 사진 속 피사체(제품·장소·인물)가 등장하면 ref_photo_id로 그 사진을 지정 — 그 외형을 참조해 그린다(일관성의 기준).`;

export function buildCutsMessages(project) {
  const { material, script } = project;
  const photos = material.photos.map((p) => `- id:${p.id} 파일명:${p.filename}`).join("\n") || "(없음)";
  const user = `[대본]
${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[업로드 사진 목록]
${photos}`;
  return { system: CUTS_SYSTEM, messages: [{ role: "user", content: user }] };
}

export function buildImagePrompt(cut, project) {
  const ar = project.settings.aspect_ratio;
  const orient = ar === "9:16" ? "vertical 9:16" : ar === "1:1" ? "square 1:1" : "horizontal 16:9";
  // 주제 앵커 — 컷 문장이 제품을 직접 안 담아도(가격·위치 컷 등) 전 컷이 같은 대상을 그리게 한다.
  const subject = project.briefing?.topic
    ? ` The video's subject is: ${project.briefing.topic}. Keep this exact product/subject consistent in every scene.`
    : "";
  let p = `High-quality photographic still for a short-form video, ${orient} composition. Scene: ${cut.sentence}.${subject} Cinematic lighting, realistic, no text or letters in the image.`;
  if (cut.ref_photo_id) {
    p += " Match the product/subject appearance to the attached reference image exactly (shape, colors, packaging).";
  }
  // 사용자가 구체적으로 지시한 수정 — 가장 강하게 반영한다
  if (cut.edit_instruction) {
    p += ` Important correction requested by the user, apply it strictly: ${cut.edit_instruction}.`;
  }
  return p;
}
