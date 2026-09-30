// 실사 캐스팅 — 인물마다 H3 **글만**(text-to-video)으로 5초 클립을 만들고, 그 프레임과 소리를
// **구간 1 부터 모든 구간**의 인물·목소리 참조로 쓴다.
//
// ★★★ 왜(2026-09-30 실측, romance-busstop 5초 시험 셋):
//   ① 글만 → 흐린 날 실제 도로·평범한 얼굴, **실사**.
//   ② 같은 글 + GPT Image 판에서 출발한 인물 참조 → 황금빛 역광·보케·화보 얼굴로 통째로 돌아갔다.
//      H3 는 참조에서 얼굴만이 아니라 **빛·색감·배경 질감까지** 가져온다.
//   ③ H3 글만 캐스팅의 얼굴·목소리를 참조로 → 실사 유지 · 인물 유지.
//   → 참조 사슬의 출발점을 그림 모델이 아니라 H3 실사 영상으로 둔다.
// ★★ 캐스팅은 **분위기 없는 사진**이어야 한다 — 참조의 빛·배경이 본편으로 새므로, 흐린 날 고른 빛과
//   밋밋한 벽이어야 본편의 장소·빛을 지문이 정할 수 있다.
// ★ 전신이다 — 가슴 위만 찍었더니(시험 ③) 하의 정보가 없어 본편에서 흰 바지가 됐다.
// ★ 순수 함수다(fs 없음). 부르는 일은 scripts/measure/longform-2seg.mjs 의 cast 단계가 한다.
import { adModel } from "../ad/models.js";

export const CASTING_SECONDS = 5;
// fal(minimax/h3/reference-to-video): 목소리 참조는 한 개 2초 이상 · **합쳐 15초 이하**.
const VOICE_TOTAL_MAX = 15;
const VOICE_MIN = 2;

const clean = (v) => (typeof v === "string" ? v.trim().replace(/\.+$/, "") : "");

// 인물의 생김새(look)·목소리(voice)만 싣는다 — who 에는 "버스 정류장에서 혼자 기다리는" 같은
//   **장면**이 섞여 있어 캐스팅이 그 장면이 된다.
const PLAIN = "Plain casting footage: the person stands in front of a plain light-grey wall outdoors on an overcast day, soft even daylight, nothing else in the frame.";
const FRAMING = "Framing: a full-length shot from head to shoes, standing still and facing the camera, face clearly visible, still camera.";

// 기본 캐스팅은 **첫 번째 옷**을 입는다(옷 칸이 있을 때). 나머지 옷은 의상 캐스팅(buildCostumePrompt)이 찍는다.
export function buildCastingPrompt(character, { line = "안녕하세요, 만나서 반가워요.", lang = "Korean" } = {}) {
  const look = clean(character?.look);
  const voice = clean(character?.voice);
  const first = character?.outfits?.[0];
  return [
    `${look}.`,
    first ? `Wearing: ${clean(first.desc)}.` : "",
    PLAIN,
    FRAMING,
    `Duration: about ${CASTING_SECONDS} seconds.`,
    voice ? `Voice: ${voice}.` : "",
    `[The person looks into the camera and speaks naturally] (in ${lang}): ${line}`,
  ].filter(Boolean).join("\n");
}

// ★★ 의상 캐스팅(사장님 결정 · 방법 2, 2026-09-30) — 기본 캐스팅 얼굴을 Image 1 로 넣고 **같은 사람이 그 옷을
//   입은** 5초를 H3 로 찍는다. 그 프레임이 그 옷을 입는 샷의 참조다. GPT Image 로 옷만 바꿔 그리면 AI 질감이
//   다시 들어온다(5초 시험 ②). 말은 시키지 않는다 — 목소리는 기본 캐스팅의 것 하나다.
export function buildCostumePrompt(character, outfit) {
  return [
    `Image 1 shows this person. Film the same person — same face, hair and build — now wearing: ${clean(outfit?.desc)}.`,
    `${clean(character?.look)}.`,
    PLAIN,
    FRAMING,
    "The person stands quietly and does not speak.",
    `Duration: about ${CASTING_SECONDS} seconds.`,
  ].filter(Boolean).join("\n");
}

// ★★★ 연기 목소리(사장님 선택 · 2026-09-30 목소리 비교 ③) — 기본 캐스팅의 얼굴·목소리를 참조로 **이 인물의
//   극 중 대사를 감정을 실어** 한 번 더 찍고, 그 소리를 모든 구간의 목소리 참조로 쓴다. 기본 캐스팅의
//   "안녕하세요" 자기소개 톤이 배신·복수 대사에 억양·속도까지 옮겨 가 "전체적으로 너무 어색"했다.
//   음색·나이만 따르게 한다 — 감정은 연기 지시가 정한다.
export function buildActedVoicePrompt(character, { line, lang = "Korean" } = {}) {
  const voice = clean(character?.voice);
  return [
    "Image 1 shows this person and Audio 1 is their voice.",
    PLAIN,
    "Framing: chest-up, facing the camera, still camera.",
    `Duration: about ${CASTING_SECONDS} seconds.`,
    "They perform one line as an actor would in the most emotional moment of their story — real feeling, natural intonation and pauses, never a flat read.",
    "Match only its timbre and age; the emotion, intonation and pace follow this direction.",
    voice ? `Voice: ${voice}.` : "",
    `(in ${lang}): ${String(line || "").trim()}`,
  ].filter(Boolean).join("\n");
}

// 연기할 대사 — 시나리오가 쓴 audition_line(극 중 대사와 겹치지 않는 감정 대사). 없으면 기본 문장.
// ★★ 극 중 대사를 쓰지 않는다(2026-09-30 대본 형식 시험) — C 의 연기 목소리를 극 중 대사로 녹음했더니
//   장면에서 같은 문장을 말할 때 참조의 억양을 통째로 베껴, 표정은 살았는데 톤이 연기 느낌이 아니었다.
const FALLBACK_LINE = "정말… 이렇게 될 줄은 몰랐어.";
export function actedLineFor(scenario, key) {
  const c = (scenario?.characters || []).find((x) => x.key === key);
  const lines = new Set((scenario?.shots || []).map((s) => (typeof s?.line === "string" ? s.line.trim() : "")).filter(Boolean));
  const a = typeof c?.audition_line === "string" ? c.audition_line.trim() : "";
  if (a && !lines.has(a)) return a;
  return lines.has(FALLBACK_LINE) ? "그래서… 이제 어떻게 할 건데?" : FALLBACK_LINE;
}

// 한 명 몫의 목소리 참조 길이(초) — 합 15초 안에서 5초까지.
export function castingVoiceSeconds(n) {
  const count = Number(n) || 0;
  if (count * VOICE_MIN > VOICE_TOTAL_MAX) {
    throw new Error(`목소리 참조는 합쳐 ${VOICE_TOTAL_MAX}초까지라 인물은 ${Math.floor(VOICE_TOTAL_MAX / VOICE_MIN)}명까지예요(지금 ${count}명)`);
  }
  return Math.max(VOICE_MIN, Math.min(CASTING_SECONDS, Math.floor(VOICE_TOTAL_MAX / Math.max(1, count))));
}

export function castingCostUsd(characters, resolution) {
  const perSec = adModel("minimax-h3").perSecUsd?.[resolution];
  if (!perSec) throw new Error(`H3 가 모르는 화질이에요: ${resolution}`);
  return perSec * CASTING_SECONDS * (Number(characters) || 0);
}
