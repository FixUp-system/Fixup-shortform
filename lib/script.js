// 대본 생성 — 정리된 브리핑과 자료 원문을 함께 입력으로 완결된 대본(문단+역할 태그) 산출
const SYSTEM = `너는 짧은 영상의 대본 작가다. 주어진 자료와 [기획] 설계를 바탕으로 한국어 나레이션 대본을 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["자료에서 반영한 포인트"]}
숏폼이다 — 군더더기 없이, 짧고 힘있게. 훅과 리듬을 살린다. 다만 광고 문구가 아니라 사실이 스스로 말하게 한다.
규칙:
- [기획]이 주어지면 그 앵글과 beats 순서를 따른다. 각 beat의 role을 문단 tag로 쓴다.
- 기획의 point는 너에게 주는 연출 지시다. 그 표현을 문장에 옮기지 마라. 그 의도를 실제 대사로 실현한다. '강조·유도·차별화·소개·훅·긴장' 같은 연출·기법 단어는 나레이션에 절대 넣지 않는다.
- 사실을 나열하지 않는다. 각 사실을 그 결과·상황·의미로 이어 전개한다("직접 삶습니다"에서 그치지 말고 "그래서 단맛이 다릅니다"까지). 단, 자료가 함의하는 데까지만 — 새 사실을 지어내지 않는다.
- 분량은 자료가 정한다 — 담긴 내용을 빠짐없이 (3~8문단). 군살(클리셰·광고 필러)은 빼되, 사실을 인과·의미로 전개하는 것은 군살이 아니다.
- 첫 문단은 자료의 성격에 맞되, 스크롤을 멈추게 할 가장 센 한 방으로 연다 — 광고 문구가 아니라 가장 구체적이고 센 사실로.
- 형용사로 부풀리지 않는다. 수치·고유명사·행동 같은 구체적 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 다음 표현은 쓰지 않는다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요.
- 자료의 구체 포인트(제품명·수치·위치·특징)는 빠뜨리지 말고 반영하고 coverage에 나열.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.
- tag는 그 문단이 하는 역할을 짧게 적는다. 여는말·상황·본문·전환·희소성·마무리 같은 것이 예시이고, 자료에 맞는 다른 이름을 써도 된다.
아래는 톤 참고용 예시다(내용을 베끼지 말 것):
✗ 나쁜 예(기법 전사): "한정된 수량으로 희소성을 강조합니다."
✓ 짧고 센 예: "오전 11시부터, 하루 40잔. 지나면 없습니다."`;

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

export function buildScriptMessages(project, instruction, plan) {
  const { script } = project;
  let user = sourceBlock(project);
  if (plan) {
    const beats = plan.beats
      .map((b, i) => `${i + 1}. (${b.role}) 사실: ${(b.facts || []).join(", ") || "(원문에서 고르기)"} / 연출 의도: ${b.point}`)
      .join("\n");
    user += `\n\n[기획 — 이 설계대로 쓴다]
앵글: ${plan.angle}
${beats}`;
  }
  if (script && instruction) {
    user += `\n\n[기존 대본]\n${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[수정 지시] ${instruction}\n지시를 반영해 대본 전체를 다시 출력하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// 기획(분석) — 대본을 쓰기 전에 앵글과 문단 구조를 정한다. 저장하지 않는 내부 밑그림.
const PLAN_SYSTEM = `너는 짧은 영상의 대본을 쓰기 전에 자료를 분석해 설계도를 짜는 기획자다.
문장을 쓰지 않는다 — 어떤 사실을 어떤 순서로 배치하고, 각 비트가 시청자에게 어떤 임팩트를 줄지만 정한다.
출력은 JSON 하나로 한다: {"angle":"이 영상이 진짜 말하는 한 가지","beats":[{"role":"문단 역할","facts":["쓸 자료 사실"],"point":"이 비트가 시청자에게 줄 임팩트를 구체적으로"}]}
규칙:
- angle은 자료에서 가장 구체적이고 센 사실로 잡는다. 광고 문구가 아니다.
- beats는 3~8개. 각 beat의 role은 그 문단이 하는 일(여는말·상황·본문·희소성·마무리 등). 여는말 beat의 point는 스크롤을 멈추게 할 가장 센 한 방으로 잡는다.
- point는 연출 의도다. '강조한다·유도한다·차별화·소개한다' 같은 기법 서술이나 광고 형용사('특별한'·'완벽한'…)로 쓰지 않는다. 실제로 칠 사실·훅·장면으로 적는다.
  ✗ "희소성을 강조한다" / "방문을 유도한다"
  ✓ "오전 11시 지나면 그날 치는 끝" / "성수역 3번 출구 2분, 지금 갈 수 있다"
- point의 임팩트도 자료가 함의하는 데까지만. 자료에 없는 새 주장을 지어내지 않는다.
- facts는 자료·브리핑에 실제로 있는 것만 담는다. 담을 사실이 없으면 그 beat를 만들지 않는다.`;

export function buildPlanMessages(project) {
  return { system: PLAN_SYSTEM, messages: [{ role: "user", content: sourceBlock(project) }] };
}

// 자기 교정 패스 — 초안에서 광고 티·상투어만 걷어낸다. 입력은 초안뿐(원문 자료를 다시 주지 않는다).
const EDIT_SYSTEM = `너는 대본을 다듬는 편집자다. 주어진 대본을 숏폼답게 날카롭게 다듬는다 — 광고 티·상투어·무른 명령형·기법 서술을 걷어낸다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["반영한 포인트"]}
규칙:
- 대본에 있는 사실을 하나도 빠뜨리지 않는다 — 수치·고유명사·위치·특징 그대로. 새 사실을 만들어 더하지 않는다.
- 인과 사슬을 단문으로 뭉개지 않는다. 사실 간 연결("그래서 …")과 문단의 전개를 그대로 살린다. 분량을 줄이지 않는다.
- 임팩트를 깎지 않는다. 평탄하게 되쓰지 마라 — 여는말이 무디면 더 세게 punch-up 한다.
- 다음 표현을 없앤다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요. "~해보세요"류 권유도 사실 진술로 바꾼다. '강조·유도·차별화' 같은 기법 서술이 있으면 실제 사실로 되살린다.
- 형용사로 부풀리지 않는다. 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 문단 수와 구조, tag는 대본 그대로 유지한다. 군더더기·기법 서술 제거 외에 내용을 바꾸지 않는다.
- coverage는 대본의 것을 유지한다.`;

export function buildScriptEditMessages(draft) {
  const body = draft.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n");
  const user = `[다듬을 대본]
${body}
[반영 포인트]
${(draft.coverage || []).join(", ")}`;
  return { system: EDIT_SYSTEM, messages: [{ role: "user", content: user }] };
}

// 교정본이 초안의 내용을 지켰는가 — 문단·coverage 개수에 더해 글자 수(공백 제외)가
// 초안의 80% 미만이면 전개가 뭉개진 것으로 보고 초안으로 폴백한다.
export function editKeptContent(draft, edited) {
  if (!edited) return false;
  if (edited.paragraphs.length < draft.paragraphs.length) return false;
  if ((edited.coverage?.length || 0) < (draft.coverage?.length || 0)) return false;
  const chars = (s) => s.paragraphs.map((p) => (p.text || "").replace(/\s/g, "").length).reduce((a, b) => a + b, 0);
  if (chars(edited) < chars(draft) * 0.8) return false;
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
