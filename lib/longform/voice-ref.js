// 목소리 참조 — 구간 1 에서 H3 가 낸 인물별 목소리 구간을 받는다(--voice-at).
//   형식: "A=1.18-2.52+9.68-10.96;B=6.8-8.22+12.42-14.84"  (초 · 인물마다 구간 여럿을 + 로 잇는다)
//
// ★ 사장님 결정(2026-09-30): TTS·립싱크 길은 접었다(네 엔진 다 "발음·연기·질감·호흡"이 걸렸고,
//   립싱크는 LatentSync 가 입가를 뭉갰다). **H3 가 직접 말한다.** 그러면 남는 걱정은 구간마다
//   목소리가 바뀌는 것 — 구간 1 의 목소리를 구간 2 에 **처음부터** 싣는다.
// ★★ 제약은 fal 문서(minimax/h3/reference-to-video)의 것이다 — "2-15 seconds each, combined
//   duration at most 15 seconds". 짧은 대사(「하필 오늘…」 0.74초)는 혼자서 2초가 안 되므로
//   앞뒤 여유를 붙이고 같은 인물의 대사를 이어 붙인다.
// ★ 순수 함수다(fs 없음) — 자르는 일은 ffmpeg.js 의 voiceClipArgs 가 한다.
export const H3_AUDIO_MIN_S = 2;
export const H3_AUDIO_MAX_TOTAL_S = 15;

const round2 = (n) => Math.round(n * 100) / 100;

export function parseVoiceAt(value, { keys = [] } = {}) {
  if (value == null || value === "") return { ok: true, voices: [] };
  const voices = [];
  for (const part of String(value).split(";").map((x) => x.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq < 1) return { ok: false, reason: `--voice-at 형식이 아니에요: "${part}" (예: A=1.2-2.5+9.7-11)` };
    const key = part.slice(0, eq).trim();
    if (!keys.includes(key)) return { ok: false, reason: `--voice-at 의 "${key}" 는 인물 목록에 없어요(${keys.join(", ")})` };
    const ranges = [];
    for (const r of part.slice(eq + 1).split("+")) {
      const [a, b] = r.split("-").map((x) => Number(x.trim()));
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a) {
        return { ok: false, reason: `--voice-at ${key} 의 구간 "${r}" 이 이상해요(시작-끝, 끝이 더 뒤)` };
      }
      ranges.push([a, b]);
    }
    const seconds = round2(ranges.reduce((t, [a, b]) => t + (b - a), 0));
    if (seconds < H3_AUDIO_MIN_S) {
      return { ok: false, reason: `${key} 목소리가 ${seconds}초예요 — H3 는 ${H3_AUDIO_MIN_S}초 이상만 받아요(앞뒤 여유를 붙이거나 대사를 더 이어요)` };
    }
    voices.push({ key, ranges, seconds });
  }
  const total = round2(voices.reduce((t, v) => t + v.seconds, 0));
  if (total > H3_AUDIO_MAX_TOTAL_S) {
    return { ok: false, reason: `목소리를 모두 합쳐 ${total}초예요 — H3 는 합쳐서 ${H3_AUDIO_MAX_TOTAL_S}초까지 받아요` };
  }
  return { ok: true, voices };
}
