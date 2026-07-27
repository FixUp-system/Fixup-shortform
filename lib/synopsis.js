// 구성(시놉시스) — 영상이 어떤 장면들로 어떻게 흘러갈지 정한다. 사장님이 승인하는 게이트.
// 낭독 문장은 여기서 쓰지 않는다. 문장은 대본 단계(lib/script.js)의 일이다.
const SYNOPSIS_SYSTEM = `너는 짧은 영상의 구성을 짜는 기획자다. 자료를 읽고 이 영상이 어떤 장면들로 어떻게 흘러갈지 정한다.
출력은 JSON 하나로 한다: {"angle":"이 영상이 진짜 말하는 한 가지","scenes":[{"role":"장면이 하는 일","shows":"화면에 보이는 것","says":"할 말의 요지","seconds":초,"facts":["쓰는 자료 사실"],"ref_photo_id":"이 장면에 사진 속 피사체가 나오면 그 사진 id(없으면 생략)"}]}
규칙:
- angle은 자료에서 가장 구체적이고 센 사실로 잡는다. 광고 문구가 아니다.
- scenes는 3~8개. role은 그 장면이 하는 일(여는말·상황·근거·전개·희소성·마감 등).
- shows는 카메라가 잡는 것을 눈에 보이게 적는다 — 피사체·행동·샷 크기·앵글. 추상어로 쓰지 않는다.
  샷 크기는 극단적 클로즈업·클로즈업·미디엄 샷·풀 샷·광각(설정 샷) 중에서, 앵글은 눈높이·로우 앵글·하이 앵글·조감도·오버더숄더·시점 샷 중에서 골라 그 말 그대로 적는다.
  화면의 분위기를 정하는 조명도 장면에 맞게 적는다 — 시간대(골든아워·한낮·황혼·새벽), 날씨·공기(안개·이슬비·햇빛에 떠다니는 먼지). 모든 장면에 억지로 넣지는 않는다.
  없는 것으로 쓰지 않는다. 빼고 싶은 것을 말하는 대신 원하는 상태를 그대로 서술한다.
  ✗ "정성이 느껴지는 장면" / "분위기 있는 컷" / "손님이 없는 매장"
  ✓ "아침 7시 주방, 논산 설향 딸기를 통째로 갈아 넣는 손 클로즈업, 창으로 든 새벽빛"
  ✓ "텅 빈 새벽 매장 풀 샷, 의자가 테이블 위에 올려져 있다"
- says는 할 말의 요지다. 완성된 낭독 문장을 쓰지 마라 — 문장은 다음 단계가 쓴다.
  '강조한다·유도한다·차별화·소개한다' 같은 기법 서술이나 광고 형용사('특별한'·'완벽한'·'다양한')로 쓰지 않는다. 실제로 칠 사실로 적는다.
  ✗ "희소성을 강조한다" / "방문을 유도한다"
  ✓ "오전 11시 지나면 그날 치는 끝" / "성수역 3번 출구 2분, 지금 갈 수 있다"
- 여는말 장면의 shows와 says는 스크롤을 멈추게 할 가장 센 한 방으로 잡는다.
- seconds는 그 장면에 몇 초를 쓸지 배분한다(2~15). 전체 합이 15~40초가 되게 한다.
- facts는 자료·브리핑에 실제로 있는 것만 담는다. 담을 사실이 없으면 그 장면을 만들지 않는다.
- 자료가 함의하는 데까지만. 새 사실을 지어내지 않는다.`;

// 브리핑 + 자료 원문 + 사진을 하나의 지문으로 — 구성·대본이 같은 원천을 본다(DRY).
export function sourceBlock(project) {
  const { material, briefing } = project;
  const photoList = material.photos.map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";
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

// 구성을 지문에 적을 때의 표기 — 대본·컷 단계도 같은 표기를 쓴다(사장님이 본 것과 같은 모양).
export function synopsisBlock(synopsis) {
  const scenes = synopsis.scenes
    .map((s, i) => `${i + 1}. (${s.role}) 약 ${s.seconds}초 / 보여줌: ${s.shows} / 할 말: ${s.says}${(s.facts || []).length ? ` / 사실: ${s.facts.join(", ")}` : ""}`)
    .join("\n");
  return `앵글: ${synopsis.angle}\n${scenes}`;
}

export function buildSynopsisMessages(project, instruction) {
  let user = sourceBlock(project);
  // 수정 지시가 있을 때만 기존 구성을 보여준다. 지시가 없으면 처음부터 다시 짠다.
  if (project.synopsis && instruction) {
    user += `\n\n[기존 구성]\n${synopsisBlock(project.synopsis)}
[수정 지시] ${instruction}\n지시를 반영해 구성 전체를 다시 출력하라.`;
  }
  return { system: SYNOPSIS_SYSTEM, messages: [{ role: "user", content: user }] };
}
