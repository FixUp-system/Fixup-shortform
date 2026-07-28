// 컷 분할과 화면 설계 — 두 패스다.
//  1패스(분할): LLM은 컷 경계(문장 번호)만 고르고, 텍스트는 코드가 원고에서 잘라낸다.
//               모델이 문장을 다시 쓰게 두면 사장님이 승인한 원고가 이미지 단계에서 조용히 달라진다.
//  2패스(화면): 컷마다 무엇을 보여줄지 설계한다. 화면 근거는 나레이션 문장이 아니라 이 'shows'다.
// 모든 컷 화면은 AI가 새로 그린다. 업로드 사진은 화면에 직접 넣지 않고 참조(ref)로만 쓴다.

// 원고를 문장으로 나눈다 — 줄바꿈과 종결부호가 경계다.
// 컷 경계는 이 배열의 번호로만 이야기하므로, 나누는 규칙이 곧 컷의 최소 단위다.
export function splitSentences(text) {
  return (text || "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

const SPLIT_SYSTEM = `너는 숏폼 영상 편집자다. 완성된 나레이션 원고를 컷으로 나눈다.
번호가 매겨진 문장 목록을 받는다. 각 컷이 어느 문장부터 어느 문장까지인지만 고른다.
반드시 JSON 하나만 출력: {"cuts":[{"from":시작 문장 번호,"to":끝 문장 번호}]}
규칙:
- 문장을 고쳐 쓰지 않는다. 너는 경계만 고른다 — 문장은 이미 사장님이 승인했다.
- 컷은 1번 문장에서 시작해 마지막 문장에서 끝난다. 빈틈도 겹침도 없다(앞 컷의 to 다음이 뒤 컷의 from이다).
- 한 컷은 화면 하나다. 화면이 바뀔 자리에서 끊는다 — 말하는 대상이 바뀌거나, 시간·장소가 옮겨가거나, 근거에서 결과로 넘어가는 자리.
- 컷 하나는 3~8초를 겨냥한다. 한국어 낭독은 초당 5.5자 남짓이니 공백 빼고 17~44자다.
  이미지 한 장이 화면에 머무는 시간이라, 길면 지루하고 짧으면 눈이 못 따라간다.
- 문장을 쪼개지 않는다. 한 문장이 이미 8초를 넘으면 그 문장 하나로 컷을 만든다(컷은 문장보다 잘아질 수 없다).
- 짧은 문장 여럿이 한 화면에서 이어지면 묶되, 묶은 결과가 8초를 넘지 않게 한다.
- 어떤 경우에도 컷 하나가 15초를 넘지 않게 한다.`;

export function buildSplitMessages(sentences) {
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return {
    system: SPLIT_SYSTEM,
    messages: [{ role: "user", content: `[원고 — 문장 ${sentences.length}개]\n${numbered}` }],
  };
}

const SHOWS_SYSTEM = `너는 숏폼 영상의 촬영을 설계한다. 컷마다 화면에 무엇이 보일지, 그것이 어떻게 움직일지 적는다.
반드시 JSON 하나만 출력: {"shots":[{"shows":"화면에 보이는 것(정지 화면)","motion":"그 화면이 어떻게 움직이는지 한 줄","ref_ids":["이 컷에 나오는 출연 id 와 사진 id (없으면 빈 배열, 최대 2개)"]}]}
shots는 컷과 같은 개수·같은 순서다.
규칙:
- shows는 카메라가 잡는 것을 눈에 보이게 적는다 — 피사체·행동·샷 크기·앵글. 추상어로 쓰지 않는다.
  샷 크기는 극단적 클로즈업·클로즈업·미디엄 샷·풀 샷·광각(설정 샷) 중에서, 앵글은 눈높이·로우 앵글·하이 앵글·조감도·오버더숄더·시점 샷 중에서 골라 그 말 그대로 적는다.
  화면의 분위기를 정하는 조명도 컷에 맞게 적는다 — 시간대(골든아워·한낮·황혼·새벽), 날씨·공기(안개·이슬비·햇빛에 떠다니는 먼지). 모든 컷에 억지로 넣지는 않는다.
  없는 것으로 쓰지 않는다. 빼고 싶은 것을 말하는 대신 원하는 상태를 그대로 서술한다.
  ✗ "정성이 느껴지는 장면" / "분위기 있는 컷" / "손님이 없는 매장"
  ✓ "아침 7시 주방, 딸기를 통째로 갈아 넣는 손 클로즈업, 창으로 든 새벽빛"
  ✓ "텅 빈 새벽 매장 풀 샷, 의자가 테이블 위에 올려져 있다"
- shows는 그 컷 문장을 그림으로 옮긴 삽화가 아니다. 말이 하지 않는 것을 화면이 맡는다 —
  말이 "한 번에 한 명만 받습니다"이면 화면은 작업대에 놓인 의자 하나를 비춘다.
  화면이 말을 그대로 되풀이하면 그 컷의 정보량은 절반이 된다.
- 첫 컷은 스크롤을 멈추는 한 방이다. 거리 전경·간판·외관 같은 설정 샷으로 열지 않는다.
- 컷들은 한 편의 영상이다. 같은 피사체를 이어 그리되 같은 그림을 반복하지 않는다 — 샷 크기와 각도를 바꿔 간다.
- **shows 에는 카메라 움직임을 적지 않는다.** shows 로 만드는 것은 클립의 첫 프레임이 될 정지
  화면이라, 움직임을 섞으면 그림이 흐려진다. 움직임은 motion 에 따로 적는다.
- **motion 은 그 정지 화면에서 이어지는 움직임 하나다.** 카메라가 움직이거나 피사체가
  움직이거나 — 둘 다 넣지 않는다. 몇 초 안에 끝나는 작은 변화로 적는다.
  ✗ "카메라가 돌면서 인물이 걸어오고 문이 열린다"(셋을 한 컷에)
  ✓ "카메라가 천천히 뒤로 물러난다"
  ✓ "김이 위로 천천히 피어오른다"
  얼굴 표정·말하는 입·손가락을 세밀하게 쓰는 동작은 적지 않는다 — 지금 기술로는 뭉개진다.
  움직일 것이 마땅치 않으면 "거의 정지, 아주 느린 카메라 이동"으로 적는다.
- ref_ids 는 이 컷 화면에 실제로 보이는 것만 적는다. 사람은 [출연] 목록의 id, 물건·공간은 [올린 사진] 의 id 다.
  같은 사람이 나오는 컷들에는 같은 id 를 적는다 — 이것이 컷 사이 인물을 같은 사람으로 묶는 유일한 장치다.
  많아도 2개까지다(사람 하나 + 물건 하나). 사람이 안 보이는 컷은 사람 id 를 적지 않는다.
- 자료에 없는 사실을 화면으로 지어내지 않는다.`;

export function buildShowsMessages(project, cuts) {
  const photos = (project.material?.photos || []).map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";
  // 출연 목록 — 컷은 여기서만 사람을 고른다. 원고를 읽고 뽑은 목록이라 표현이 어긋나지 않는다
  const cast = (project.cast || []).map((c) => `- id:${c.id} ${c.who}`).join("\n") || "(없음)";
  const list = cuts.map((c, i) => `${i + 1}. ${c.sentence}`).join("\n");
  const user = `[영상 주제] ${project.briefing?.topic || "(밝히지 않음)"}
[원고 전문]
${project.script?.text || ""}

[컷 ${cuts.length}개 — 이 순서대로 shots를 만든다]
${list}

[출연]
${cast}

[올린 사진]
${photos}`;
  return { system: SHOWS_SYSTEM, messages: [{ role: "user", content: user }] };
}

// shows 에서 정지 그림에 못 담을 절을 뺀다 — 이미지 프롬프트를 만들 때만 쓴다.
//
// SHOWS_SYSTEM 에 "shows 에는 카메라 움직임을 적지 않는다"가 굵게 적혀 있는데도 지켜지지
// 않아 "자전거 바퀴가 천천히 회전한다"가 그림 지시로 갔다(2026-07-28 관통). 정지 이미지
// 모델은 회전을 그릴 방법이 없어 회전을 **암시하는** 그림을 만든다 — 페달에서 뗀 발,
// 굴러가는 자세. 그 그림이 클립의 첫 프레임이 되어 "페달을 안 밟는데 굴러가는" 결함이 굳는다.
// 이 저장소가 반복해 겪은 패턴이다 — 지켜져야 하는 것은 프롬프트가 아니라 코드가 쥔다.
//
// **저장된 shows 는 건드리지 않는다.** 사장님이 대본 화면에서 보고 고치는 값이라,
// 화면에 보이는 것과 그림 지시가 어긋나면 고칠 근거를 잃는다. 여기서 걸러 쓰기만 한다.
//
// 판정선은 감이 아니라 실측에서 뽑았다 — 화면 설계를 자료 6편 × 3회 돌려 절 122개를 모으고
// (scripts/measure/shows-motion-leak.mjs) 눈으로 라벨해 규칙을 맞췄다. 결과 4/4·오검출 0.
// 절 122개 중 76%가 명사·관형형으로 끝나(구도 서술) 판정 대상조차 아니었고, 오염은 3.3%였다.
const STILL_FORMS = [
  /\s있다$/,      // 보조용언 '있다' 구성 — "놓여 있다"(상태) · "입고 있다"(착용). 둘 다 정지다
  /보인다$/,       // 존재
  /하다$/,        // 양태 — "딸기 조각이 가득하다"
  /(햇빛|햇살|빛|조명|먼지).*(비친다|비춘다|들어온다|떠다닌다)$/, // 빛이 주어인 조명 서술
];
// 유지 형태라도 속도 부사가 붙으면 움직임이다 — "손이 키보드를 빠르게 치고 있다".
// '부드럽게'는 넣지 않는다. 속도가 아니라 태(態)라서, 정당한 "조명이 부드럽게 비친다"까지 지운다.
const SPEED_ADVERBS = /(천천히|서서히|빠르게|점점|조금씩)/;

export function stillOnly(shows) {
  const clauses = String(shows || "").split(/,\s*/).map((c) => c.trim()).filter(Boolean);
  const kept = clauses.filter((c) => {
    // 명사·관형형으로 끝나면 구도 서술이다. 절 안의 동사를 훑으면 안 된다 —
    // "자전거를 타고 지나가며 손을 흔드는 풀 샷"은 '지나가며'가 있어도 정지 화면이다
    if (!/(다|요)$/.test(c)) return true;
    if (SPEED_ADVERBS.test(c)) return false;
    return STILL_FORMS.some((re) => re.test(c));
  });
  return kept.join(", ");
}

export function buildImagePrompt(cut, project) {
  const ar = project.settings.aspect_ratio;
  const orient = ar === "9:16" ? "vertical 9:16" : ar === "1:1" ? "square 1:1" : "horizontal 16:9";
  // 화면 근거는 컷의 '보여줌'이다. 나레이션 문장은 귀로 듣는 것이지 그릴 대상이 아니다.
  // 폴백 두 겹: 화면 패스가 실패한 컷 → 구성 시절 프로젝트의 장면 → 그마저 없으면 문장.
  // 움직임 절을 걸러낸 뒤에 폴백을 판정한다 — shows 가 통째로 움직임이면 그릴 것이 없다
  const legacyScene = Number.isInteger(cut.scene_idx) ? project.synopsis?.scenes?.[cut.scene_idx] : null;
  const shows = stillOnly(cut.shows) || stillOnly(legacyScene?.shows) || cut.sentence;
  // 주제 앵커 — 컷이 제품을 직접 안 담아도(가격·위치 컷 등) 전 컷이 같은 대상을 그리게 한다.
  const subject = project.briefing?.topic
    ? ` The video's subject is: ${project.briefing.topic}. Keep this exact product/subject consistent in every scene.`
    : "";
  let p = `High-quality photographic still for a short-form video, ${orient} composition. Scene: ${shows}.${subject} Cinematic lighting, realistic, no text or letters in the image.`;
  // 사장님이 사진을 갈아끼우면 컷의 ref가 낡을 수 있다. 실제로 첨부될 사진이 있을 때만
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

// 클립 프롬프트 — i2v 에 "이 그림이 어떻게 움직이는가"를 준다.
//
// 이 자리는 오래 비어 있었다. shows 는 정지 화면 설계라 움직임을 일부러 뺐고(위 규칙),
// i2v 는 이미지와 길이만 보냈다. 그래서 컷이 어떻게 움직일지를 아무도 정하지 않고
// 모델 재량에 맡겨져 있었다 — 숏폼에서 움직임은 컷 정보량의 절반이다.
//
// motion 이 없으면(화면 패스 실패·옛 프로젝트) 눈에 띄지 않는 기본값으로 간다.
// 여기서 과한 움직임을 지어내면 그림이 무너지므로, 폴백은 조용한 쪽이다.
export function buildClipPrompt(cut) {
  const motion = typeof cut?.motion === "string" ? cut.motion.trim() : "";
  const base = motion || "거의 정지 상태, 아주 느린 카메라 이동";
  return `${base}. The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged. No text or letters. No talking faces or lip sync.`;
}
