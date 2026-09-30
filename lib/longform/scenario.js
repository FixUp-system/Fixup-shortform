// 롱폼 시나리오 — **30초 전체를 한 번에** 쓰고, 샷마다 구간을 배정한다(스펙 결정 10 · (가)).
//
// ★★ 인물을 **시나리오가 정의한다**(characters). 스펙은 캐스팅을 뒤에 두었지만, 대사를 인물
//   id 에 묶으려면(고정 블록 규칙 ②) 그 id 가 시나리오를 쓸 때 이미 있어야 한다.
// ★ 단계별의 스키마·지시문·검증을 **읽기만** 한다 — lib/reel/* 는 한 줄도 안 바꾼다.
//   스키마는 structuredClone 으로 넓힌다(원본을 변형하면 단계별이 모르는 칸을 요구받는다).
import { REEL_SCENARIO_SCHEMA, buildScenarioMessages, validateScenario } from "../reel/scenario.js";
import { profileFor } from "../clip-limits.js";
// ★ 판 격자 판정은 단계별의 것을 **그대로** 부른다 — 스크립트가 판을 그릴 때 쓰는 그 함수다.
//   두 벌이면 "검증은 통과했는데 판을 못 그린다"가 생긴다(2026-09-30 가짜 관통에서 실제로 났다).
import { reelGridFor, REEL_MIN_CUTS } from "../reel/scenario-rules.js";
import { callJson } from "../llm.js";
import { NARRATION_ID, H3_R2V } from "./plan.js";

export const LONGFORM_SCENARIO_SCHEMA = (() => {
  const s = structuredClone(REEL_SCENARIO_SCHEMA);
  s.properties.characters = {
    type: "array",
    items: {
      type: "object",
      properties: {
        key: { type: "string" },
        who: { type: "string" },
        look: { type: "string" },
        voice: { type: "string" },
      },
      required: ["key", "who", "look", "voice"],
      additionalProperties: false,
    },
  };
  const shot = s.properties.shots.items;
  shot.properties.segment = { type: "integer" };
  shot.properties.speaker_id = { type: "string" };
  shot.properties.on_screen = { type: "array", items: { type: "string" } };
  shot.required = [...shot.required, "segment", "speaker_id", "on_screen"];
  s.required = [...s.required, "characters"];
  return s;
})();

// 구간 하나가 받을 수 있는 초 — H3 프로필이 정한다(손으로 적지 않는다).
export function segmentBounds() {
  const p = profileFor(H3_R2V);
  return { min: p.min, max: p.max };
}

// ★★ 요구하지 말 것 — 모델이 못 그리는 것은 **애초에 요구하지 않는다**(CLAUDE.md: 금지 문구를 더 붙이는
//   것은 소용없다). 전부 2026-09-30 롱폼 실측에서 나온 것이다. 시나리오·이어 쓰기가 이 목록 하나를 읽는다.
export const AVOID_RULES = [
  "★★ 영상 모델이 잘 못 그리는 것 — 아래는 **쓰지 마라**:",
  // 5초 시험 ③: "카디건 한쪽 어깨가 젖음"을 옷감이 반쯤 비치고 결이 뭉개지는 얼룩으로 그렸다.
  "- 옷이 젖거나 얼룩지거나 찢어지는 것처럼 **옷감의 상태 변화**. 비는 옷이 아니라 빗줄기·젖은 길·우산으로 보여 준다.",
  // 구간 1·2·3 판 칸 4 세 번: 두 손이 팔짱·손잡기·문 손잡이로 바빠 우산을 쥔 손이 빠졌다.
  "- 두 사람이 한 우산을 쓰고 **뒤에서 걸어가는 구도**. 우산을 쓴 장면은 정면이나 옆에서, 우산을 쥔 손이 보이게 쓴다.",
  // 구간 3 영상: 몽타주 가로수길 샷에서 남자가 양손에 우산을 하나씩 들었다.
  "- 소품은 shows 에 **몇 개인지**(예: \"one closed navy umbrella\")와 누가 어느 손으로 드는지 적는다.",
  // 5초 시험 ①·②: 스타일 말 없는 글은 실사로, 황금빛·역광 참조는 화보·AI 질감으로 나왔다.
  "- 조명(lighting)은 **평범한 자연광이나 실내등**으로 쓴다(흐린 날, 형광등, 가로등 등). golden hour·역광(backlight)·보케(bokeh)·렌즈 플레어·cinematic 같은 말은 쓰지 마라 — 인물이 광택 나는 AI 얼굴이 된다.",
].join("\n");

function longformRules({ segmentCount, min, max }) {
  return [
    "★★ 롱폼 규칙 — 이 영상은 짧은 구간 여러 개를 따로 만들어 이어 붙인다.",
    // ★★★ 최종 리뷰(2026-09-30) — 위의 단계별 지문은 "한 번에 통째로 만든다"·"화자는 하나다"·
    //   "line 은 나레이션 대사"라고 말한다. 뒤에 붙인 규칙이 그것을 무효라고 **말하지 않으면**
    //   LLM 이 한 사람만 말하게 하거나 전부 나레이션으로 써서, 이번 시험의 핵심(한 장면에서
    //   여러 인물이 대화하는가)을 잴 재료가 사라진다. 그래서 첫머리에서 덮어쓴다.
    "- ★ 위의 「한 번에 통째로 만들어진다」는 이 영상에 적용하지 않는다 — 구간마다 따로 굽고 이어 붙인다.",
    "- ★ 위의 「한 영상에 화자는 하나다」는 이 영상에 적용하지 않는다 — 인물마다 자기 목소리로 말한다. 대화가 있으면 여러 인물이 번갈아 말하게 쓴다.",
    "- ★ line 은 나레이션만이 아니다 — 화면 속 인물의 대사도 line 에 쓰고, 말하는 사람을 speaker_id 로 가리킨다.",
    `- 구간은 ${segmentCount}개다. 모든 샷에 segment 를 적는다(1부터). 샷 순서대로 segment 는 줄지 않는다.`,
    `- 구간마다 그 샷들의 seconds 합이 ${min}초 이상 ${max}초 이하다.`,
    `- 구간마다 샷은 ${REEL_MIN_CUTS}개 이상 5개 이하다 — 구간마다 스토리보드 판을 한 장 그리는데, 그보다 적으면 판을 못 그린다.`,
    "- 구간 경계는 **장면이 바뀌는 자리**에 둔다. 한 장면 한가운데서 자르지 마라.",
    "- 앞 구간은 끝을 닫지 마라 — 다음 구간으로 이어지게 끝낸다.",
    "- characters 에 이름 있는 등장인물을 **전부** 적는다. key 는 A, B, C … 한 글자다. who·look·voice·outfits 는 영어로 쓴다.",
    // ★★ 2026-09-30 첫 1분 plan: A 의 look 에 "회귀 전 웨딩드레스, 회귀 후 정장"이 섞여, 캐스팅이 어느 옷인지
    //   모르고 모든 구간 지문에 두 벌이 함께 실렸다. 옷은 outfits 로, 샷마다 어느 옷인지는 shots[].outfits 로.
    "- ★★ look 에는 얼굴·머리·체격·나이 인상만 적는다. **옷은 적지 마라** — 옷은 outfits 에 적는다.",
    "- outfits 에는 그 인물이 이 영상에서 입는 옷을 전부 적는다(보통 한 벌, 이야기상 옷이 바뀌면 여러 벌). id 는 key 뒤에 번호(A1, A2 …), desc 는 옷 한 벌의 영어 설명이다.",
    "- 모든 샷의 outfits 에는 그 샷에 보이는 인물이 입은 옷의 id 를 적는다(on_screen 인물마다 하나). 사람이 안 보이면 빈 배열이다.",
    // ★★★ 같은 plan: 대사 13줄 중 11줄이 "narration" 이었다 — 캐스팅은 인물만 만들어 내레이터 목소리는 잠기지 않는다.
    "- 대사가 있는 샷은 speaker_id 에 말하는 인물의 key 를 적는다. 대사가 없으면 빈 문자열이다.",
    `- ★★ 회상·해설처럼 화면 밖에서 들리는 목소리도 **인물 중 한 명의 목소리**로 쓰고 voiceover: true 로 표시한다(그 인물이 화면에 나와도 된다). 입을 맞춰 말하는 대사는 voiceover: false 다. speaker_id 에 "${NARRATION_ID}" 은 쓰지 마라 — 그 목소리는 캐스팅으로 잠기지 않아 구간마다 달라진다.`,
    "- on_screen 에 그 샷에 보이는 인물의 key 를 전부 적는다. 사람이 안 보이면 빈 배열이다.",
    // ★ 같은 plan: 결혼식장인데 지문이 "배경에도 아무도 없다"였다 — 샷 설명의 하객과 싸운다.
    "- 이름 없는 배경 인물(하객·행인 같은 엑스트라)은 shows 에 써도 된다 — 말하지 않고 초점 밖에 있다. characters 에는 넣지 않는다.",
    "- shows 에서 인물을 가리킬 때는 대명사만 쓰지 말고 key 를 함께 적는다(예: \"A, the woman in her 20s\").",
    // ★★ 2026-09-30 실제 구간 1 — "우산 하나 아래 어깨를 나란히"만 적혀 두 사람이 팔짱을 꼈고
    //   우산은 아무도 안 든 채 공중에 떴다. 금지 문구가 아니라 **원하는 상태**를 적게 한다.
    "- 소품(우산·컵·가방 등)이 나오는 샷은 shows 에 **누가 어느 손으로 들고 있는지** 적는다. 두 인물이 붙어 서거나 팔짱을 끼는 장면이라도 소품을 든 손을 적는다.",
    "- 장소가 구간마다 바뀌면 segment_looks 에 그 구간의 장소를 적는다(같으면 빈 배열).",
    "",
    AVOID_RULES,
    "",
    // ★★★ 모양은 이 글이 정한다 — lib/llm.js 의 callJson 은 schema 를 모델에 안 넘긴다(이어 쓰기와 같은 이유).
    "롱폼 칸의 모양 — 위 JSON 에 더해서 답한다:",
    '  "characters": [{ "key": "A", "who": "이야기 속 역할 — 영어", "look": "얼굴·머리·체격·나이 인상 — 영어, 옷 없이", "voice": "목소리 — 영어", "outfits": [{ "id": "A1", "desc": "옷 한 벌 — 영어" }] }],',
    '  "segment_looks": [{ "segment": 구간 번호, "environment": "그 구간의 장소 — 영어", "wardrobe": "" }],',
    '  shots 의 각 샷에 더한다: "segment": 구간 번호, "speaker_id": "A 또는 빈 문자열", "voiceover": true 또는 false, "on_screen": ["A"], "outfits": ["A1"]',
  ].join("\n");
}

export function buildLongformScenarioMessages(project, { segmentCount = 2 } = {}) {
  const { min, max } = segmentBounds();
  // conceptLine: null — 광고 포맷 줄을 안 싣는다(단계별이 [알아서]에 쓰는 그 규약).
  const { system, messages } = buildScenarioMessages(project, {
    conceptLine: null,
    sceneCountRule: `★ 장면 수 — 구간마다 ${REEL_MIN_CUTS}개에서 5개. 전체 ${segmentCount * 5}개를 넘기지 마라.`,
  });
  return { system: `${system}\n\n${longformRules({ segmentCount, min, max })}`, messages };
}

const str = (v) => (typeof v === "string" ? v.trim() : "");

export function validateLongformScenario(raw, photoCount, { segmentCount = 2, resolution, aspect } = {}) {
  const base = validateScenario(raw, photoCount);
  if (!base) return { ok: false, errors: ["시나리오 모양이 아니에요(text·shots)"] };
  // ★★★ 샷·글은 단계별 검증의 것을 **안 쓴다** — 그쪽은 shots.slice(0, 12) · text.slice(0, 4000) 이다
  //   (15~60초 한 편 기준). 롱폼은 30초가 벌써 8샷이고 구간 하나를 더하면 12를 넘어 뒤 샷이
  //   **말없이 사라진다**(2026-09-30 구간 3 을 붙이려다 발견). 모양 판정만 빌린다.
  const shots = raw.shots.filter((s) => s && typeof s === "object");
  const text = String(raw.text).trim();
  const { min, max } = segmentBounds();
  const errors = [];

  const characters = (Array.isArray(raw?.characters) ? raw.characters : [])
    .map((c) => {
      const outfits = (Array.isArray(c?.outfits) ? c.outfits : [])
        .map((o) => ({ id: str(o?.id), desc: str(o?.desc) }))
        .filter((o) => o.id);
      // ★ 옷 칸은 **있을 때만** 싣는다 — 옛 시나리오의 인물 모양(잠금·비교)이 그대로다.
      return { key: str(c?.key), who: str(c?.who), look: str(c?.look), voice: str(c?.voice), ...(outfits.length ? { outfits } : {}) };
    })
    .filter((c) => c.key);
  const keys = new Set(characters.map((c) => c.key));
  if (keys.size !== characters.length) errors.push("인물 key 가 겹쳐요");
  // 옷 id → 주인. 옷 칸이 하나라도 있으면 샷마다 화면 속 인물의 옷을 판정한다(없으면 옛 시나리오).
  const owner = new Map();
  for (const c of characters) {
    for (const o of c.outfits || []) {
      if (owner.has(o.id)) errors.push(`옷 id "${o.id}" 가 겹쳐요`);
      owner.set(o.id, c.key);
    }
  }
  const dressed = new Set(characters.filter((c) => c.outfits?.length).map((c) => c.key));

  let prev = 1;
  const sums = new Map();
  const counts = new Map();
  shots.forEach((s, i) => {
    const n = i + 1;
    const seg = Number(s?.segment);
    if (!Number.isInteger(seg) || seg < 1 || seg > segmentCount) {
      errors.push(`샷 ${n}: segment ${s?.segment} 이 1~${segmentCount} 밖이다`);
      return;
    }
    if (seg < prev) errors.push(`샷 ${n}: segment 가 거꾸로 간다(${prev} → ${seg})`);
    prev = seg;
    sums.set(seg, (sums.get(seg) || 0) + (Number(s?.seconds) || 0));
    counts.set(seg, (counts.get(seg) || 0) + 1);
    const sp = str(s?.speaker_id);
    if (str(s?.line) && !sp) errors.push(`샷 ${n}: 대사가 있는데 speaker_id 가 비었다`);
    // ★★★ narration 은 막는다(2026-09-30) — 캐스팅은 인물만 만들어 내레이터 목소리는 참조가 없다.
    if (sp === NARRATION_ID) errors.push(`샷 ${n}: speaker_id "${NARRATION_ID}" 은 쓰지 않는다 — 인물 중 한 명의 voiceover 로 쓴다`);
    else if (sp && !keys.has(sp)) errors.push(`샷 ${n}: speaker_id "${sp}" 는 인물 목록에 없다`);
    const onScreen = Array.isArray(s?.on_screen) ? s.on_screen : [];
    for (const k of onScreen) {
      if (!keys.has(k)) errors.push(`샷 ${n}: on_screen "${k}" 는 인물 목록에 없다`);
    }
    if (owner.size) {
      const worn = Array.isArray(s?.outfits) ? s.outfits : [];
      for (const id of worn) if (!owner.has(id)) errors.push(`샷 ${n}: 옷 "${id}" 는 outfits 에 없다`);
      for (const k of onScreen) {
        if (dressed.has(k) && !worn.some((id) => owner.get(id) === k)) errors.push(`샷 ${n}: 화면에 있는 ${k} 의 옷이 outfits 에 없다`);
      }
    }
  });
  for (let seg = 1; seg <= segmentCount; seg++) {
    const t = sums.get(seg) || 0;
    if (t === 0) errors.push(`구간 ${seg} 에 샷이 없다`);
    else if (t < min || t > max) errors.push(`구간 ${seg} 가 ${t}초 — ${min}~${max}초여야 한다`);
    // ★★ 구간마다 판을 한 장 그린다 — 그 격자가 이 샷 수를 못 담으면 판 없이 굽게 된다.
    const c = counts.get(seg) || 0;
    if (c && !reelGridFor(c, { resolution, aspect })) {
      errors.push(`구간 ${seg} 의 샷 ${c}개는 스토리보드 판 한 장에 못 담는다(${REEL_MIN_CUTS}개 이상 · 격자로 나뉘는 수)`);
    }
  }
  // 구간별 장소·옷 — 몽타주처럼 장소·날이 바뀌는 구간만 적는다(bible.js 의 segmentLook 이 읽는다).
  const looks = (Array.isArray(raw?.segment_looks) ? raw.segment_looks : [])
    .map((l) => ({ segment: Number(l?.segment), environment: str(l?.environment), wardrobe: str(l?.wardrobe) }))
    .filter((l) => l.environment || l.wardrobe);
  for (const l of looks) {
    if (!Number.isInteger(l.segment) || l.segment < 1 || l.segment > segmentCount) {
      errors.push(`segment_looks 의 구간 ${l.segment} 이 1~${segmentCount} 밖이다`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    scenario: { ...base, text, shots, characters, ...(looks.length ? { segment_looks: looks } : {}) },
  };
}

// 저장된 시나리오를 **다시** 잰다 — 확인 ① 뒤에 사람이 run.json 의 구간 2 를 고칠 수 있어서다.
// ★★★ 최종 리뷰(2026-09-30) — 예전에는 plan 때 한 번만 쟀다. 그러면 구간 2 를 27초로 고쳐도
//   seg2 가 그대로 통과했고, h3Body 의 fitDurationFor 가 **조용히 15로 잘랐다.** 모르는
//   speaker_id 도 목소리 묘사 없이 지문에 들어갔다. 굽기 단계마다 이것을 먼저 부른다.
export function checkStoredScenario(state) {
  return validateLongformScenario(state?.scenario, (state?.photos || []).length, {
    segmentCount: (state?.segments || []).length || 2,
    resolution: state?.settings?.resolution,
    aspect: state?.settings?.aspect_ratio,
  });
}

// LLM 한 번을 기다리는 한도 — 구간이 늘면 답이 길다. lib/llm.js 의 기본 120초는 "가장 큰 호출이
//   3,468 토큰"(08-12) 근거인데, 첫 1분(구간 4개) plan 이 거기서 끊겼다(2026-09-30). 10분 상한.
export function scenarioTimeoutMs(segments) {
  return Math.min(600_000, 120_000 + 60_000 * Math.max(1, Number(segments) || 1));
}

export async function generateLongformScenario({ project, segmentCount = 2, deps = {} }) {
  const call = deps.callJson || callJson;
  const { system, messages } = buildLongformScenarioMessages(project, { segmentCount });
  const ask = (msgs) => call({
    system, messages: msgs, stage: "롱폼 시나리오", projectId: project.id,
    schema: LONGFORM_SCENARIO_SCHEMA, fake: fakeLongformResponse, timeoutMs: scenarioTimeoutMs(segmentCount),
  });
  const check = (raw) => validateLongformScenario(raw, (project.material?.photos || []).length, {
    segmentCount,
    resolution: project.settings?.resolution,
    aspect: project.settings?.aspect_ratio,
  });
  let raw = await ask(messages);
  let out = check(raw);
  // ★★ 규칙을 어기면 **이유를 붙여 한 번 다시** 쓰게 한다 — 판정은 코드가, 고치기는 모델이(CLAUDE.md:
  //   "판정만 하고 강제하지 않으면 안 된다"). 첫 답을 버리고 plan 을 통째로 다시 돌리면 값이 두 번 나간다.
  if (!out.ok) {
    raw = await ask([
      ...messages,
      { role: "assistant", content: JSON.stringify(raw) },
      { role: "user", content: `방금 답이 규칙을 어겼다 — ${out.errors.join(" · ")}\n고친 시나리오 전체를 같은 JSON 모양으로 다시 답하라.` },
    ]);
    out = check(raw);
  }
  if (!out.ok) throw new Error(`롱폼 시나리오가 규칙을 어겼어요 — ${out.errors.join(" · ")}`);
  return out.scenario;
}

// ── 이어 쓰기 — 이미 구운 구간 뒤에 구간을 더한다 ─────────────────────────────
//
// ★★ 사장님 승인(2026-09-30): 30초(비 오는 정류장의 만남) 뒤에 "그렇게 우리의 만남이 시작돼서
//   간단한 연애사가 나오는 형식"의 구간 3 을 붙인다. 5분·10분의 첫 계단이다.
// ★★★ 인물은 **잠겨 있다** — 스키마에 characters 칸이 없다. 앞 구간 영상의 얼굴·목소리가 이미
//   정해졌으니 LLM 이 인물을 고쳐 쓸 자리를 아예 안 준다(run-state.js 의 잠금도 같은 것을 본다).
// ★ 장소·옷은 구간마다 바꿀 수 있다(segment_looks) — 몽타주는 장소와 날이 바뀐다.
// ★ 회상 내레이션은 "narration" 이 아니라 **그 인물의 화면 밖 목소리**다 — 내레이터 목소리는
//   잠겨 있지 않고(참조 오디오가 없다), 인물 목소리는 구간 1 에서 잘라 둔 것이 있다.
export const LONGFORM_EXTEND_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    shots: LONGFORM_SCENARIO_SCHEMA.properties.shots,
    segment_looks: {
      type: "array",
      items: {
        type: "object",
        properties: { segment: { type: "integer" }, environment: { type: "string" }, wardrobe: { type: "string" } },
        required: ["segment", "environment", "wardrobe"],
        additionalProperties: false,
      },
    },
  },
  required: ["text", "shots", "segment_looks"],
  additionalProperties: false,
};

function storySoFar(scenario) {
  const people = (scenario?.characters || []).map((c) => `- ${c.key}: ${c.who} — ${c.look} — voice: ${c.voice}`);
  const shots = (scenario?.shots || []).map((s) => {
    const said = str(s.line) ? ` / ${s.speaker_id}: "${str(s.line)}"` : "";
    return `- 구간 ${s.segment} · ${s.seconds}초 · ${str(s.shows)}${said}`;
  });
  const lastShot = (scenario?.shots || []).at(-1);
  return [
    `대본:\n${str(scenario?.text)}`,
    `인물(잠겨 있다 — 그대로 쓴다):\n${people.join("\n")}`,
    `지금까지의 장소: ${str(scenario?.environment) || "(없음)"}`,
    `지금까지의 옷: ${str(scenario?.wardrobe) || "(없음)"}`,
    `지금까지의 샷:\n${shots.join("\n")}`,
    // 끝 샷을 따로 짚는다 — 긴 목록 끝에 묻히면 이어짐을 놓친다(첫 실제 구간 3).
    lastShot ? `★ 앞 구간의 마지막 샷(여기서 이어진다): ${str(lastShot.shows)} — ${str(lastShot.action)}` : "",
  ].filter(Boolean).join("\n\n");
}

export function buildExtendMessages({ scenario, fromSegment, addSegments = 1, brief = "" }) {
  const { min, max } = segmentBounds();
  const to = fromSegment + addSegments - 1;
  const range = addSegments > 1 ? `구간 ${fromSegment}~${to}` : `구간 ${fromSegment}`;
  const system = [
    "너는 짧은 한국어 영상의 시나리오 작가다. 이미 만들어진 영상 뒤에 이어질 구간을 쓴다.",
    `★★ 구간 1~${fromSegment - 1} 은 이미 영상으로 만들어졌다 — 고치지 않는다. ${range} 만 새로 쓴다.`,
    "★★ 인물은 주어진 목록 그대로다. 새 인물을 만들지 마라. 얼굴·머리·목소리는 바뀌지 않는다.",
    `- 모든 새 샷의 segment 는 ${fromSegment}${addSegments > 1 ? `~${to}` : ""} 이다. 샷 순서대로 줄지 않는다.`,
    `- 구간마다 샷은 ${REEL_MIN_CUTS}개 이상 5개 이하, seconds 합은 ${min}초 이상 ${max}초 이하다.`,
    "- 샷의 칸 모양은 앞의 샷들과 같다. shows·action·camera·lighting·sound 는 영어, line 은 한국어다.",
    "- shows 에서 인물을 가리킬 때는 key 를 함께 적는다(예: \"A, the woman\").",
    "- 대사가 있는 샷은 speaker_id 에 말하는 인물 key 를 적는다. on_screen 에는 그 샷에 보이는 인물 key 를 전부 적는다.",
    // ★★★ 2026-09-30 첫 실제 구간 3 — 이 자리에 "on_screen 에는 그 인물을 넣지 않는다"고 적었더니 LLM 이
    //   여자를 몽타주에서 통째로 뺐다(남자 혼자 버스·카페). 내레이션 여부는 voiceover 로 따로 가른다.
    "- ★ 회상하듯 말하는 내레이션은 voiceover: true 로 쓴다 — speaker_id 는 그 인물이다. 그 인물이 그 샷 화면에 나와도 된다(on_screen 에 넣는다). 입을 맞춰 말하는 대사는 voiceover: false 다. speaker_id 에 \"narration\" 은 쓰지 마라.",
    // ★★★ 같은 날 — 구간 2 는 둘이 **함께** 버스에 오르며 끝났는데 구간 3 은 "남자 혼자, 옆자리가 빈" 버스로
    //   시작했다(사장님: "시나리오가 전혀 안 이어지는데?").
    "- ★★ 새 구간의 첫 샷은 **앞 구간의 마지막 장면**에서 이어진다 — 그때 누가 어디서 무엇을 하고 있었는지와 모순되면 안 된다. 시간이 건너뛰어도 관계와 상황은 앞 이야기와 이어져야 한다.",
    "- 함께 있던 인물을 이유 없이 혼자 두지 마라. 두 사람의 이야기면 두 사람이 함께 보이는 장면이 중심이다.",
    "- 장소나 옷이 앞 구간과 달라지면 segment_looks 에 {segment, environment, wardrobe} 를 영어로 적는다. 같으면 빈 배열이다.",
    "- 소품이 나오는 샷은 shows 에 누가 어느 손으로 들고 있는지 적는다.",
    "- 구간 경계는 장면이 바뀌는 자리에 둔다.",
    "- text 에는 새 구간의 대본을 한국어 한 단락으로 쓴다.",
    "",
    AVOID_RULES,
    "",
    // ★★★ 이 블록이 답의 모양을 정하는 **유일한 자리**다 — lib/llm.js 의 callJson 은 schema 를 모델에
    //   안 넘긴다. 첫 실제 extend(2026-09-30)가 이것 없이 "LLM 응답 해석 실패"로 죽었다.
    "JSON 으로만 답한다(앞뒤에 다른 글·코드 울타리를 붙이지 않는다):",
    "{",
    '  "text": "새 구간의 대본 — 한국어 한 단락",',
    '  "segment_looks": [{ "segment": 구간 번호, "environment": "그 구간의 장소·시간대·빛 — 영어 한 줄", "wardrobe": "그 구간의 옷 — 인물마다, 영어 한 줄" }],',
    '  "shots": [{',
    '    "segment": 구간 번호(숫자),',
    '    "seconds": 이 샷의 길이(초, 숫자),',
    '    "beat": "이 샷이 하는 일 — 한국어",',
    '    "shows": "이 샷의 정지 화면 — 영어 한 줄, 인물은 key 와 함께",',
    '    "action": "무엇이 어떻게 움직이나 — 영어",',
    '    "camera": "앵글·움직임·렌즈감 — 영어",',
    '    "lighting": "빛 — 영어",',
    '    "sound": "들리는 소리 — 영어",',
    '    "line": "대사 — 한국어 (없으면 빈 문자열)",',
    '    "speaker": "말하는 인물 key (없으면 빈 문자열)",',
    '    "speaker_id": "말하는 인물 key (없으면 빈 문자열)",',
    '    "on_screen": ["그 샷에 보이는 인물 key"],',
    '    "voiceover": 회상 내레이션이면 true, 입을 맞춰 말하는 대사거나 대사가 없으면 false,',
    '    "avatar_id": "", "transition": ""',
    "  }]",
    "}",
  ].join("\n");
  const user = [
    storySoFar(scenario),
    `사장님이 원하는 방향: ${str(brief) || "(없음 — 앞 이야기에서 자연스럽게 이어 간다)"}`,
    `${range} 을 써라.`,
  ].join("\n\n");
  return { system, messages: [{ role: "user", content: user }] };
}

export async function extendLongformScenario({ state, brief = "", addSegments = 1, deps = {} }) {
  const call = deps.callJson || callJson;
  const old = state.scenario;
  const fromSegment = (state.segments || []).length + 1;
  const to = fromSegment + addSegments - 1;
  const { system, messages } = buildExtendMessages({ scenario: old, fromSegment, addSegments, brief });
  const raw = await call({
    system, messages, stage: "롱폼 이어 쓰기", projectId: state.runId,
    schema: LONGFORM_EXTEND_SCHEMA, fake: () => fakeExtendResponse({ fromSegment }), timeoutMs: scenarioTimeoutMs(addSegments),
  });
  const added = Array.isArray(raw?.shots) ? raw.shots : [];
  const stray = added.filter((s) => !(Number(s?.segment) >= fromSegment && Number(s?.segment) <= to));
  if (!added.length || stray.length) {
    throw new Error(`이어 쓴 샷은 구간 ${fromSegment}${to > fromSegment ? `~${to}` : ""} 이어야 해요 — 앞 구간은 이미 구웠어요`);
  }
  const merged = {
    ...old,
    text: [str(old.text), str(raw.text)].filter(Boolean).join("\n\n"),
    shots: [...old.shots, ...added],
    segment_looks: [...(old.segment_looks || []), ...(raw.segment_looks || [])],
  };
  const out = validateLongformScenario(merged, (state.photos || []).length, {
    segmentCount: to,
    resolution: state.settings?.resolution,
    aspect: state.settings?.aspect_ratio,
  });
  if (!out.ok) throw new Error(`이어 쓴 시나리오가 규칙을 어겼어요 — ${out.errors.join(" · ")}`);
  return out.scenario;
}

// 이어 쓰기 가짜 응답 — 구간 하나(5+5+5 = 15초). 첫 샷은 화면 밖 목소리(A 가 화면에 없다).
export function fakeExtendResponse({ fromSegment }) {
  const shot = (o) => ({
    beat: "", avatar_id: "", transition: "", camera: "eye level, slow drift",
    lighting: "warm afternoon light", action: "", sound: "soft café ambience",
    line: "", speaker: "", speaker_id: "", on_screen: [], segment: fromSegment, seconds: 5, ...o,
  });
  return {
    text: "가짜 이어 쓰기 구간입니다. 배선을 확인하려고 만든 글입니다.",
    segment_looks: [{ segment: fromSegment, environment: "a small café and a riverside path in autumn", wardrobe: "A in a camel coat, B in a grey wool coat" }],
    shots: [
      shot({ shows: "B, the man, waits at a café table holding two cups, one in each hand", on_screen: ["B"], line: "그렇게 우리의 만남이 시작됐어요.", speaker: "A", speaker_id: "A" }),
      shot({ shows: "A and B walk along the river at dusk, B holding her hand in his left hand", on_screen: ["A", "B"], line: "우리 또 보자.", speaker: "B", speaker_id: "B" }),
      shot({ shows: "A and B laugh on a bench as leaves fall", on_screen: ["A", "B"] }),
    ],
  };
}

// SHOTFORM_FAKE=all 과 테스트가 쓰는 응답 — **검증을 통과하는 모양**이어야 0원 관통이 돈다.
// 구간 1 = 5+5+4 = 14초 · 구간 2 = 5+5+5 = 15초 — 구간마다 3샷(판 격자의 하한).
export function fakeLongformResponse() {
  const shot = (o) => ({
    beat: "", avatar_id: "", transition: "", camera: "eye level, slow push-in",
    lighting: "soft morning window light", action: "", sound: "quiet bakery ambience",
    line: "", speaker: "", speaker_id: "", on_screen: [], ...o,
  });
  return {
    text: "가짜 롱폼 시나리오입니다. 배선을 확인하려고 만든 글이라 실제 내용이 아닙니다.",
    focus: "person", voice: "", music: "", tone: "warm natural color",
    look: "", wardrobe: "flour-dusted aprons", environment: "a small neighborhood bakery at dawn",
    angle: "두 사람의 아침", endpoint: "r2v",
    characters: [
      { key: "A", who: "Korean woman in her 30s, the baker", look: "short black hair, round glasses", voice: "warm, low, unhurried" },
      { key: "B", who: "Korean man in his 20s, her apprentice", look: "tall, curly hair", voice: "bright, slightly nervous" },
    ],
    shots: [
      shot({ segment: 1, seconds: 5, shows: "A, the baker, pulls a tray of bread from the oven", on_screen: ["A"], line: "오늘도 잘 구워졌네.", speaker: "A", speaker_id: "A" }),
      shot({ segment: 1, seconds: 5, shows: "B, the apprentice, rushes in through the back door", on_screen: ["A", "B"], line: "늦어서 죄송해요!", speaker: "B", speaker_id: "B" }),
      shot({ segment: 1, seconds: 4, shows: "A glances at the wall clock and smiles at B", on_screen: ["A", "B"] }),
      shot({ segment: 2, seconds: 5, shows: "A hands B an apron across the counter", on_screen: ["A", "B"], line: "괜찮아, 반죽부터 하자.", speaker: "A", speaker_id: "A" }),
      shot({ segment: 2, seconds: 5, shows: "B ties the apron and nods", on_screen: ["A", "B"] }),
      shot({ segment: 2, seconds: 5, shows: "Both knead dough side by side as the sun rises", on_screen: ["A", "B"] }),
    ],
  };
}
