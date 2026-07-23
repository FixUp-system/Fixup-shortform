// 대본 생성 — 자료 전체를 입력으로 완결된 숏폼 대본(문단+역할 태그) 산출
const SYSTEM = `너는 숏폼 영상 대본 작가다. 사용자가 준 자료를 바탕으로 한국어 나레이션 대본을 쓴다.
반드시 JSON 하나만 출력: {"paragraphs":[{"tag":"훅|본문|희소성|마무리 등 역할","text":"문장"}],"coverage":["자료에서 반영한 포인트"]}
규칙:
- 목표 길이에 맞는 분량 (나레이션 기준 15초≈3문단, 30초≈4, 45초≈5~6, 60초≈7~8).
- 첫 문단은 반드시 3초 안에 시선을 잡는 훅.
- 자료의 구체 포인트(제품명·수치·위치·특징)는 빠뜨리지 말고 반영하고 coverage에 나열.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.`;

export function buildScriptMessages(project, instruction) {
  const { settings, material, script } = project;
  const photoList = material.photos.map((p) => `- ${p.filename}`).join("\n") || "(없음)";
  let user = `[설정] 목적: ${settings.purpose} / 길이: ${settings.duration_s}초 / 비율: ${settings.aspect_ratio}
[자료 텍스트]
${material.text}
[업로드된 사진]
${photoList}`;
  if (script && instruction) {
    user += `\n\n[기존 대본]\n${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[수정 지시] ${instruction}\n지시를 반영해 대본 전체를 다시 출력하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}
