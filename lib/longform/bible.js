// 고정 블록 — 모든 구간에 **한 글자도 안 다르게** 붙는 설정(스펙 「고정 블록」).
//
// ★★★ 왜 코드가 조립하나. 무대·의상·색감은 지금 영상 지문에 코드로 실리는 곳이 0건이다
//   (LLM 이 글에 녹여 줬을 때만 간다). 롱폼은 그 글을 구간으로 잘라 구간 2 가 "여기가
//   어디이고 그녀가 누구인지"를 모른다. 그래서 구조화된 칸에서 **문자열 하나**를 만든다.
// ★ 같은 입력이면 같은 문자열이어야 한다 — 그것이 seg2 의 잠금 판정(run-state.js)의 전제다.
// ★ 영어다 — 영상 모델이 읽는 글이다.
import { AD_STYLE_LINES } from "../ad/options.js";
import { NARRATION_ID } from "./plan.js";

const clean = (v) => (typeof v === "string" ? v.trim().replace(/\.+$/, "") : "");

function line(label, v) {
  const t = clean(v);
  return t ? `${label}: ${t}.` : "";
}

export function buildBible(scenario, { style }) {
  const people = (scenario?.characters || []).map((c) => {
    const face = [clean(c.who), clean(c.look)].filter(Boolean).join(" — ");
    const voice = clean(c.voice);
    return `- ${c.key}: ${face}${voice ? ` — voice: ${voice}` : ""}.`;
  });
  return [
    "Fixed setting for every part of this film — keep all of it identical in every part:",
    line("Style", AD_STYLE_LINES[style]),
    line("Setting", scenario?.environment),
    line("Wardrobe", scenario?.wardrobe),
    line("Color treatment", scenario?.tone),
    line("Subject", scenario?.look),
    // ★★ 최종 리뷰(2026-09-30) — 화면 밖 목소리(내레이터)도 구간마다 따로 뽑히면 안 된다.
    //   인물 목소리는 Characters 에 실리는데 내레이터 것(scenario.voice)만 어디에도 없었다.
    // ★★★ 다만 **내레이션 장면이 있을 때만**이다(같은 날 첫 실제 plan 에서 드러났다). 대화만 있는
    //   편에서 LLM 은 voice 칸에 "대사 전체의 말투"를 적는데, 그것을 Narrator voice 로 실으면
    //   영상 모델이 **없던 내레이터를 끼워 넣을** 수 있다.
    hasNarration(scenario) ? line("Narrator voice", scenario?.voice) : "",
    people.length ? `Characters:\n${people.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

function hasNarration(scenario) {
  return (scenario?.shots || []).some((s) => s?.speaker_id === NARRATION_ID);
}

// 그 구간에 보이거나 말하는 인물 key — 인물 목록의 순서를 따른다(같은 입력 → 같은 문장).
export function segmentCharacters(scenario, seg) {
  const seen = new Set();
  for (const s of scenario?.shots || []) {
    if (Number(s?.segment) !== seg) continue;
    for (const k of Array.isArray(s?.on_screen) ? s.on_screen : []) seen.add(k);
    const sp = typeof s?.speaker_id === "string" ? s.speaker_id.trim() : "";
    if (sp && sp !== NARRATION_ID) seen.add(sp);
  }
  return (scenario?.characters || []).map((c) => c.key).filter((k) => seen.has(k));
}
