// 구간 지문 — H3 에 보내는 글 한 벌. 순서가 규칙이다(스펙 「고정 블록」 규칙 ④):
//   본문(이 구간에서 일어나는 일) → 고정 블록 → 이 구간 출연 → 참조 이름 → 대사
// 뒤에 올수록 모델이 강하게 받는다 — 말이 맨 끝이다(buildOneShotPrompt 와 같은 규약).
import { adRefLabel } from "../ad/models.js";
// ★★★ 판 머리말은 단계별 것을 **그대로** 쓴다(본문을 비우면 머리말만 돌려준다 — lib/reel 무수정).
//   실제 구간 1(romance-busstop, 2026-09-30)의 0~4초가 2×2 판을 그대로 움직인 분할 화면이었다.
//   그 머리말(격자 배치 · 읽는 순서 · 분할 화면 금지)을 빼고 판 설명을 중간에 한 줄만 둔 탓이다.
//   단계별 주석: "이 문장이 없으면 모델이 격자를 그대로 움직일 위험이 크다".
import { buildOneShotPrompt } from "../reel/oneshot.js";
import { NARRATION_ID } from "./plan.js";
import { segmentCharacters } from "./bible.js";

const H3 = "minimax-h3";
const clean = (v) => (typeof v === "string" ? v.trim().replace(/\.+$/, "") : "");

export function segmentShots(scenario, seg) {
  return (scenario?.shots || []).filter((s) => Number(s?.segment) === seg);
}

export function segmentSeconds(scenario, seg) {
  return segmentShots(scenario, seg).reduce((t, s) => t + (Number(s?.seconds) || 0), 0);
}

function shotLine(s, i) {
  const what = [clean(s.shows), clean(s.action)].filter(Boolean).join(". ");
  const how = [["Camera", s.camera], ["Lighting", s.lighting], ["Sound", s.sound]]
    .map(([k, v]) => (clean(v) ? `${k}: ${clean(v)}.` : ""))
    .filter(Boolean)
    .join(" ");
  return `Shot ${i + 1} (${Number(s.seconds) || 0}s): ${what}.${how ? ` ${how}` : ""}`;
}

function refLine(r, n) {
  const label = adRefLabel(H3, n);
  if (r.kind === "sheet") {
    return `${label} is the storyboard for this part — follow its shot order and framing, but never show a grid, panel borders or a split screen.`;
  }
  if (r.kind === "anchor") {
    const who = r.keys?.length ? ` showing ${r.keys.join(", ")}` : "";
    return `${label} is a still from the previous part${who} — keep every person's face, hair, build and clothing identical to it.`;
  }
  if (r.kind === "last") return `${label} is the last frame of the previous part — continue naturally from it.`;
  return `${label} ${r.roleEn || "is a reference photo of the subject — keep it unchanged"}.`;
}

export function buildSegmentPrompt({ scenario, seg, bible, refs = [], grid = null, langLine = "Korean" }) {
  const shots = segmentShots(scenario, seg);
  // 판이 실릴 때만, 그리고 **맨 앞에**(단계별과 같은 자리) — 없는 판을 설명하면 모델이 없는 것을 찾는다.
  const head = grid && refs.some((r) => r.kind === "sheet") ? buildOneShotPrompt(grid, shots.length, "") : "";
  const keys = segmentCharacters(scenario, seg);
  const body = shots.map(shotLine).join("\n");
  const cast = keys.length
    ? `In this part only ${keys.join(", ")} appear — no other people, including in the background.`
    : "No people appear in this part.";
  const refLines = refs.map((r, i) => refLine(r, i + 1)).join("\n");

  const voiceOf = new Map((scenario?.characters || []).map((c) => [c.key, clean(c.voice)]));
  const said = shots
    .filter((s) => typeof s?.line === "string" && s.line.trim())
    .map((s) => {
      const text = s.line.trim();
      if (s.speaker_id === NARRATION_ID) {
        // ★★ 최종 리뷰(2026-09-30) — 인물 대사처럼 내레이션에도 목소리 묘사를 붙인다.
        const nv = clean(scenario?.voice);
        return `A narrator${nv ? ` (${nv})` : ""} says off-screen, in ${langLine}: "${text}"`;
      }
      const v = voiceOf.get(s.speaker_id);
      return `${s.speaker_id}${v ? ` (${v})` : ""} says, with natural lip sync, in ${langLine}: "${text}"`;
    });
  const speech = said.length
    ? `${said.join("\n")}\nEvery line is spoken by native ${langLine} speakers with natural, fluent pronunciation — never a foreign accent, never spelled out letter by letter.`
    : "";

  return [head, body, bible, cast, refLines, speech].filter(Boolean).join("\n\n");
}
