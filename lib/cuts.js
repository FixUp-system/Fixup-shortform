// 컷 분할: 대본 → 컷(문장·초·소스·레퍼런스) / 이미지 프롬프트 생성
const CUTS_SYSTEM = `너는 숏폼 영상 편집자다. 대본을 컷으로 나눈다.
반드시 JSON 하나만 출력: {"cuts":[{"sentence":"컷의 나레이션 문장","seconds":초(2~15),"source":"photo"|"ai","photo_id":"사진 컷이면 사진 id","ref_photo_id":"ai 컷에 같은 피사체가 나오면 참조할 사진 id"}]}
규칙:
- 문장·호흡 단위로 나누고 seconds 합이 목표 길이의 ±20% 안에 오게.
- 업로드 사진이 그 컷 내용을 "그대로 보여줄 수 있으면" source:"photo"+photo_id. 사진에 없는 요소(사람·동작)가 필요하면 source:"ai".
- ai 컷에 사진 속 피사체(제품·장소)가 등장하면 ref_photo_id로 그 사진을 지정 — 외형 일관성의 기준이 된다.`;

export function buildCutsMessages(project) {
  const { settings, material, script } = project;
  const photos = material.photos.map((p) => `- id:${p.id} 파일명:${p.filename}`).join("\n") || "(없음)";
  const user = `[목표 길이] ${settings.duration_s}초
[대본]
${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[업로드 사진 목록]
${photos}`;
  return { system: CUTS_SYSTEM, messages: [{ role: "user", content: user }] };
}

export function buildImagePrompt(cut, project) {
  const ar = project.settings.aspect_ratio;
  const orient = ar === "9:16" ? "vertical 9:16" : ar === "1:1" ? "square 1:1" : "horizontal 16:9";
  let p = `High-quality photographic still for a short-form video, ${orient} composition. Scene: ${cut.sentence}. Cinematic lighting, realistic, no text or letters in the image.`;
  if (cut.ref_photo_id) {
    p += " Match the product/subject appearance to the attached reference image exactly (shape, colors, packaging).";
  }
  return p;
}
