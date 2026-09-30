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
export function buildCastingPrompt(character, { line = "안녕하세요, 만나서 반가워요.", lang = "Korean" } = {}) {
  const look = clean(character?.look);
  const voice = clean(character?.voice);
  return [
    `${look}.`,
    "Plain casting footage: the person stands in front of a plain light-grey wall outdoors on an overcast day, soft even daylight, nothing else in the frame.",
    "Framing: a full-length shot from head to shoes, standing still and facing the camera, face clearly visible, still camera.",
    `Duration: about ${CASTING_SECONDS} seconds.`,
    voice ? `Voice: ${voice}.` : "",
    `[The person looks into the camera and speaks naturally] (in ${lang}): ${line}`,
  ].filter(Boolean).join("\n");
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
