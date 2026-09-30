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
    "- characters 에 등장인물을 **전부** 적는다. key 는 A, B, C … 한 글자다. who·look·voice 는 영어로 쓴다.",
    `- 대사가 있는 샷은 speaker_id 에 말하는 인물의 key 를 적는다. 화면 밖 목소리면 "${NARRATION_ID}", 대사가 없으면 빈 문자열이다.`,
    "- on_screen 에 그 샷에 보이는 인물의 key 를 전부 적는다. 사람이 안 보이면 빈 배열이다.",
    "- shows 에서 인물을 가리킬 때는 대명사만 쓰지 말고 key 를 함께 적는다(예: \"A, the woman in her 20s\").",
    // ★★ 2026-09-30 실제 구간 1 — "우산 하나 아래 어깨를 나란히"만 적혀 두 사람이 팔짱을 꼈고
    //   우산은 아무도 안 든 채 공중에 떴다. 금지 문구가 아니라 **원하는 상태**를 적게 한다.
    "- 소품(우산·컵·가방 등)이 나오는 샷은 shows 에 **누가 어느 손으로 들고 있는지** 적는다. 두 인물이 붙어 서거나 팔짱을 끼는 장면이라도 소품을 든 손을 적는다.",
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
  const { min, max } = segmentBounds();
  const errors = [];

  const characters = (Array.isArray(raw?.characters) ? raw.characters : [])
    .map((c) => ({ key: str(c?.key), who: str(c?.who), look: str(c?.look), voice: str(c?.voice) }))
    .filter((c) => c.key);
  const keys = new Set(characters.map((c) => c.key));
  if (keys.size !== characters.length) errors.push("인물 key 가 겹쳐요");

  let prev = 1;
  const sums = new Map();
  const counts = new Map();
  base.shots.forEach((s, i) => {
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
    if (sp && sp !== NARRATION_ID && !keys.has(sp)) errors.push(`샷 ${n}: speaker_id "${sp}" 는 인물 목록에 없다`);
    for (const k of Array.isArray(s?.on_screen) ? s.on_screen : []) {
      if (!keys.has(k)) errors.push(`샷 ${n}: on_screen "${k}" 는 인물 목록에 없다`);
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
  if (errors.length) return { ok: false, errors };
  return { ok: true, scenario: { ...base, characters } };
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

export async function generateLongformScenario({ project, segmentCount = 2, deps = {} }) {
  const call = deps.callJson || callJson;
  const { system, messages } = buildLongformScenarioMessages(project, { segmentCount });
  const raw = await call({
    system, messages, stage: "롱폼 시나리오", projectId: project.id,
    schema: LONGFORM_SCENARIO_SCHEMA, fake: fakeLongformResponse,
  });
  const out = validateLongformScenario(raw, (project.material?.photos || []).length, {
    segmentCount,
    resolution: project.settings?.resolution,
    aspect: project.settings?.aspect_ratio,
  });
  if (!out.ok) throw new Error(`롱폼 시나리오가 규칙을 어겼어요 — ${out.errors.join(" · ")}`);
  return out.scenario;
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
