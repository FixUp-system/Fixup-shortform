// 대본 생성 — 정리된 브리핑과 자료 원문을 함께 입력으로 완결된 대본(문단+역할 태그) 산출
const SYSTEM = `너는 짧은 영상의 대본 작가다. 주어진 자료를 바탕으로 한국어 나레이션 대본을 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["자료에서 반영한 포인트"]}
규칙:
- 분량은 자료가 정한다 — 자료에 담긴 내용을 빠짐없이, 군살 없이. 자료가 적으면 짧게, 많으면 길게 (3~8문단).
- 첫 문단은 자료의 성격에 맞게 연다. 알리거나 파는 내용이면 3초 안에 시선을 잡고, 겪은 일이나 이야기·인사면 상황이 그려지는 문장으로 연다.
- tag는 그 문단이 하는 역할을 짧게 적는다. 여는말·상황·본문·전환·희소성·마무리 같은 것이 예시이고, 자료에 맞는 다른 이름을 써도 된다.
- 자료의 구체 포인트(제품명·수치·위치·특징)는 빠뜨리지 말고 반영하고 coverage에 나열.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.`;

export function buildScriptMessages(project, instruction) {
  const { material, briefing, script } = project;
  const photoList = material.photos.map((p) => `- ${p.filename}`).join("\n") || "(없음)";
  let user = "";
  // 브리핑은 구조를, 원문은 브리핑이 놓친 디테일을 준다 — 둘 다 담는다.
  // 브리핑이 없는 옛 프로젝트는 원문만으로 조립된다.
  if (briefing) {
    const points = briefing.key_points.map((k) => `- ${k}`).join("\n");
    const answered = (briefing.asked || [])
      .filter((a) => a.answer)
      .map((a) => `- ${a.question} → ${a.answer}`)
      .join("\n");
    user += `[정리된 브리핑]
주제: ${briefing.topic}
핵심 내용:
${points}
보는 사람: ${briefing.audience || "(밝히지 않음)"}
보고 나면: ${briefing.takeaway || "(밝히지 않음)"}${answered ? `\n추가로 확인한 것:\n${answered}` : ""}

`;
  }
  user += `[자료 원문]
${material.text}
[업로드된 사진]
${photoList}`;
  if (script && instruction) {
    user += `\n\n[기존 대본]\n${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[수정 지시] ${instruction}\n지시를 반영해 대본 전체를 다시 출력하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// 대본 낭독 시간 근사 — 표시 전용(프롬프트·파이프라인에 주입하지 않는다).
// 한국어 나레이션은 쉼 포함 대략 초당 5.5자. P0에서 TTS 실측 길이로 교체될 임시 계산.
const CHARS_PER_SEC = 5.5;

export function estimateSeconds(script) {
  const chars = (script?.paragraphs || [])
    .map((p) => (p.text || "").replace(/\s/g, "").length)
    .reduce((a, b) => a + b, 0);
  if (!chars) return 0;
  return Math.max(1, Math.round(chars / CHARS_PER_SEC));
}
