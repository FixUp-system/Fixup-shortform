// 시나리오 — 옵션+프롬프트+사진을 받아 Seedance 에 그대로 넘길 지시문을 쓴다.
//
// 이 파일은 서버 전용이다(llm.js 를 부른다). 화면은 이것을 import 하지 않는다.
import { callJson } from "../llm.js";
import { AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES } from "./options.js";

// 자동 배치 — 코드가 먼저 좁힌다.
//
// ★ LLM 에 통째로 안 맡기는 이유: 이 판정 하나가 $3.63 을 가른다. 결정 지점을
// "사진 1장" 하나로 좁히고 나머지는 코드가 정한다. 모르는 값은 r2v 다 —
// 사진이 있는데 t2v 로 가면 올린 사진이 통째로 버려진다.
export function pickEndpointKind(photoCount, llmChoice) {
  const n = Number(photoCount) || 0;
  if (n === 0) return "t2v";
  if (n >= 2) return "r2v";
  return llmChoice === "i2v" ? "i2v" : "r2v";
}

const SYSTEM = `너는 15초짜리 광고 영상의 연출자다.
사장님이 준 설명과 옵션을 읽고, 영상 생성 모델에 그대로 넘길 **하나의 지시문**을 쓴다.

지켜야 할 것:
- 전체 길이는 정확히 주어진 초 수다. 장면을 나눠도 합이 그 길이다
- 장면마다 카메라(앵글·움직임)·액션·분위기를 말로 적는다. "슬로우 푸시인", "로우 트래킹" 처럼 사람이 쓰는 말로 쓴다
- 나레이션은 주어진 언어로 쓴다. 대사는 짧게 — 15초에 두 문장을 넘기지 않는다
- 화면에 **글자를 넣으라고 요구하지 마라.** 모델은 글자를 "글자처럼 생긴 무늬"로 그린다
- 사진이 주어졌으면 그 안의 제품·인물·로고를 지키라고 명시한다

JSON 으로만 답한다:
{
  "text": "모델에 넘길 지시문 전체 (영어로 쓴다)",
  "shots": [{ "beat": "이 장면이 하는 일(한국어)", "camera": "...", "action": "...", "line": "나레이션 대사" }],
  "endpoint": "i2v 또는 r2v (사진이 정확히 1장일 때만 의미가 있다)"
}`;

export function buildScenarioMessages({ settings, material }) {
  const fmt = AD_FORMATS.find((f) => f.id === settings.format);
  const mood = AD_MOODS.find((m) => m.id === settings.mood);
  const lang = AD_LANGS.find((l) => l.id === settings.narration_lang);
  const styleLine = AD_STYLE_LINES[settings.style];
  const photos = material?.photos || [];

  const user = [
    `길이: ${settings.seconds}초`,
    `화면 비율: ${settings.aspect_ratio}`,
    `나레이션 언어: ${lang.line} (${lang.label})`,
    `광고 포맷: ${fmt.label} — ${fmt.beat}`,
    `분위기: ${mood.label} — ${mood.line}`,
    `화풍: ${styleLine}`,
    `첨부 사진: ${photos.length}장`,
    "",
    "사장님이 쓴 것:",
    material?.text || "",
  ].join("\n");

  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// ★ 사진 수가 LLM 선택을 이긴다. 검증이 판정의 마지막 자리다.
export function validateScenario(raw, photoCount) {
  const shots = Array.isArray(raw?.shots) ? raw.shots.filter((s) => s && typeof s === "object") : [];
  if (shots.length === 0) return null;
  const text = typeof raw?.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  return {
    text: text.slice(0, 4000),
    shots: shots.slice(0, 12),
    endpoint: pickEndpointKind(photoCount, raw?.endpoint),
  };
}

export async function generateScenario({ project, deps = {} }) {
  const call = deps.callJson || callJson;
  const { system, messages } = buildScenarioMessages(project);
  const raw = await call({ system, messages, stage: "광고 시나리오", projectId: project.id });
  const out = validateScenario(raw, (project.material?.photos || []).length);
  if (!out) throw new Error("시나리오를 만들지 못했어요");
  return out;
}
