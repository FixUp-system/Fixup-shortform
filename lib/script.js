// 대본 생성 — 정리된 브리핑과 자료 원문을 함께 입력으로 완결된 대본(문단+역할 태그) 산출
const SYSTEM = `너는 짧은 영상의 대본 작가다. 주어진 자료를 바탕으로 한국어 나레이션 대본을 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["자료에서 반영한 포인트"]}
목소리는 담담하게, 사실 위주로. 광고 문구가 아니라 사실이 스스로 말하게 한다.
규칙:
- 분량은 자료가 정한다 — 자료에 담긴 내용을 빠짐없이, 군살 없이. 자료가 적으면 짧게, 많으면 길게 (3~8문단).
- 평서문 위주로 사실을 단언한다("시럽은 쓰지 않습니다"). "~해보세요"류 권유를 남발하지 않는다.
- 형용사로 부풀리지 않는다. 수치·고유명사·행동 같은 구체적 사실이 스스로 말하게 한다. 한 문장에 한 가지, 짧게.
- 첫 문단은 자료의 성격에 맞게 연다 — 단, 광고 문구가 아니라 가장 구체적이고 센 사실로.
- 다음 표현은 쓰지 않는다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요.
- 자료의 구체 포인트(제품명·수치·위치·특징)는 빠뜨리지 말고 반영하고 coverage에 나열.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.
- tag는 그 문단이 하는 역할을 짧게 적는다. 여는말·상황·본문·전환·희소성·마무리 같은 것이 예시이고, 자료에 맞는 다른 이름을 써도 된다.
아래는 톤 참고용 예시다(내용을 베끼지 말 것):
✗ 나쁜 예: "성수동에서 특별한 딸기라떼를 만나보세요. 신선함을 자랑합니다."
✓ 담담한 예: "카페 미영은 딸기라떼에 시럽을 쓰지 않습니다. 매일 아침 논산 설향 딸기를 직접 갈아요. 하루 40잔만 만듭니다."`;

// 브리핑 + 자료 원문 + 사진을 하나의 지문으로 — 기획·초안이 같은 원천을 본다(DRY).
function sourceBlock(project) {
  const { material, briefing } = project;
  const photoList = material.photos.map((p) => `- ${p.filename}`).join("\n") || "(없음)";
  let user = "";
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
  return user;
}

export function buildScriptMessages(project, instruction) {
  const { script } = project;
  let user = sourceBlock(project);
  if (script && instruction) {
    user += `\n\n[기존 대본]\n${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[수정 지시] ${instruction}\n지시를 반영해 대본 전체를 다시 출력하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// 기획(분석) — 대본을 쓰기 전에 앵글과 문단 구조를 정한다. 저장하지 않는 내부 밑그림.
const PLAN_SYSTEM = `너는 짧은 영상의 대본을 쓰기 전에 자료를 분석해 설계도를 짜는 기획자다.
문장을 쓰지 않는다 — 어떤 사실을 어떤 순서로, 어떤 인과·의미로 풀지만 정한다.
출력은 JSON 하나로 한다: {"angle":"이 영상이 진짜 말하는 한 가지","beats":[{"role":"문단 역할","facts":["쓸 자료 사실"],"point":"그 사실을 어떤 인과·상황·의미로 풀지 한 문장"}]}
규칙:
- angle은 자료에서 가장 구체적이고 센 사실로 잡는다. 광고 문구가 아니다.
- beats는 3~8개. 각 beat의 role은 그 문단이 하는 일(여는말·상황·본문·희소성·마무리 등, 자료에 맞는 다른 이름도 가능).
- point는 그 사실이 스스로 함의하는 데까지만 전개한다. 자료에 없는 새 주장을 지어내지 않는다.
  예: "시럽 안 씀 → 그날 딸기에 따라 단맛이 다름"은 자료가 함의하므로 좋다. "시럽 안 씀 → 건강에 좋음"은 새 주장이라 금지.
- facts는 자료·브리핑에 실제로 있는 것만 담는다. 담을 사실이 없으면 그 beat를 만들지 않는다.
- 담담한 문체·금지어는 이 단계에서 신경 쓰지 않는다. 그건 대본 작가가 한다.`;

export function buildPlanMessages(project) {
  return { system: PLAN_SYSTEM, messages: [{ role: "user", content: sourceBlock(project) }] };
}

// 자기 교정 패스 — 초안에서 광고 티·상투어만 걷어낸다. 입력은 초안뿐(원문 자료를 다시 주지 않는다).
const EDIT_SYSTEM = `너는 대본을 다듬는 편집자다. 주어진 대본에서 광고 티·상투어·무른 명령형을 걷어내고 담담한 평서문으로 다시 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["반영한 포인트"]}
규칙:
- 대본에 있는 사실을 하나도 빠뜨리지 않는다 — 수치·고유명사·위치·특징 그대로. 새 사실을 만들어 더하지 않는다.
- 다음 표현을 없앤다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요. "~해보세요"류 권유도 평서문으로 바꾼다.
- 형용사로 부풀리지 않는다. 사실이 스스로 말하게 한다. 한 문장에 한 가지, 짧게.
- 문단 수와 구조, tag는 대본 그대로 유지한다. 클리셰 제거 외에 내용을 바꾸지 않는다.
- coverage는 대본의 것을 유지한다.`;

export function buildScriptEditMessages(draft) {
  const body = draft.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n");
  const user = `[다듬을 대본]
${body}
[반영 포인트]
${(draft.coverage || []).join(", ")}`;
  return { system: EDIT_SYSTEM, messages: [{ role: "user", content: user }] };
}

// 교정본이 초안의 내용을 지켰는가 — 문단 수나 반영 포인트(coverage)가 줄면 교정이 사실을 흘린 것으로 본다.
// validateScript는 스키마 형태만 보므로, 이 저비용 가드로 조용한 사실 유실을 막고 초안으로 폴백한다.
export function editKeptContent(draft, edited) {
  if (!edited) return false;
  if (edited.paragraphs.length < draft.paragraphs.length) return false;
  if ((edited.coverage?.length || 0) < (draft.coverage?.length || 0)) return false;
  return true;
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
