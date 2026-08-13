// 시나리오 — 옵션+프롬프트+사진을 받아 Seedance 에 그대로 넘길 지시문을 쓴다.
//
// 이 파일은 서버 전용이다(lib/ad/llm.js 를 부른다). 화면은 이것을 import 하지 않는다.
// ★ lib/llm.js(OpenAI)가 아니라 lib/ad/llm.js(Claude Fable)다 — 광고 경로만 갈아탔다.
import { callJson } from "./llm.js";
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

// ★★ 2026-08-13 다시 씀 — 사용자가 Claude 앱(Fable)에 같은 소재(농구화 광고)를 직접 물었을 때
// 로우앵글 푸시인·슬로모션·매치컷·저음 드럼·마찰음 강조·명암 대비·정적 뒤 한 방 같은 연출을
// 알아서 냈다. 우리 SYSTEM 은 "연출자다"라고만 말하고 카메라·조명·음향을 감독처럼 설계하라고
// 시키지 않았다 — 모델이 못 하는 게 아니라 안 시킨 것이었다. 넷(카메라·조명·모션·음향)을
// 장면마다 명시로 요구한다.
const SYSTEM = `너는 광고 CF 의 연출·촬영·조명·음향을 함께 보는 감독이다.
장면을 "무엇이 보이나"가 아니라 **"어떻게 찍고 어떻게 들리게 하나"** 로 설계한다.
사장님이 준 설명과 옵션을 읽고, 영상 생성 모델에 그대로 넘길 **하나의 지시문**을 쓴다.

장면마다 아래 넷을 반드시 말로 적는다. 빠뜨리면 모델 재량이 되어 밋밋해진다:
- **카메라**: 앵글(로우/하이/아이레벨/오버헤드) · 움직임(푸시인·풀백·트래킹·오빗·핸드헬드·고정) · 렌즈감(광각/망원, 얕은 심도)
- **조명**: 광원의 방향과 질(하드/소프트) · 색온도 · 대비(예: 어두운 배경에 피사체만 살리기)
- **모션**: 피사체가 무엇을 어떻게 움직이나 · 속도(슬로모션/실속도)
- **음향**: 무엇이 들리나(환경음·효과음·나레이션) · 강조할 소리 · **정적을 쓰는 자리**

지켜야 할 것:
- 전체 길이는 정확히 주어진 초 수다. 각 장면에 대략 몇 초인지 적고, 합이 그 길이와 같아야 한다
- 화면 비율이 세로(예: 9:16)면 세로 구도로 짠다. 가로로 찍은 그림을 세로에 밀어넣지 마라 —
  그러면 인물·제품이 프레임 밖으로 잘린다
- 나레이션은 주어진 언어로 쓴다. 대사는 짧게 — 전체 길이에 맞게 문장 수를 조절한다
- 화면에 **글자를 넣으라고 요구하지 마라.** 모델은 글자를 "글자처럼 생긴 무늬"로 그린다.
  자막·로고·카피·엔딩 카드는 우리가 나중에 따로 붙인다 — 시나리오는 글자 없이 성립해야 한다
- **컷 편집을 지시하지 마라.** 편집 단계가 없다 — 영상 모델이 한 번의 생성 안에서 장면을
  이어 붙인다("평균 컷 1.5초로 편집" 같은 건 우리가 실행할 수 없다)
- 모션그래픽(단면도·인포그래픽)·화면 분할·자막 애니메이션처럼 이 모델이 만들 수 없는 것을
  요구하지 마라
- 사진이 주어졌으면 그 안의 제품·인물·로고를 지키라고 명시한다
- 정보가 모자라도 되묻지 말고, 합리적으로 채워 완성된 시나리오 하나를 낸다

JSON 으로만 답한다:
{
  "text": "모델에 넘길 지시문 전체 (영어로 쓴다)",
  "shots": [{
    "beat": "이 장면이 하는 일(한국어)",
    "camera": "앵글·움직임·렌즈감",
    "lighting": "광원 방향·질·색온도·대비",
    "action": "무엇이 어떻게 움직이나, 속도",
    "sound": "무엇이 들리나, 강조할 소리, 정적을 쓰는 자리",
    "line": "나레이션 대사 (없으면 빈 문자열)",
    "seconds": "이 장면의 길이(초, 숫자)"
  }],
  "endpoint": "i2v 또는 r2v (사진이 정확히 1장일 때만 의미가 있다)"
}`;

// 넷(포맷·분위기·언어·화풍)을 같은 방식으로 실패시킨다.
//
// ★ 전에는 셋(fmt·mood·lang)은 .find() 가 못 찾으면 undefined 가 되고 이후
// .label 접근에서 TypeError 로 시끄럽게 죽었는데, style 만 AD_STYLE_LINES[style]
// 로 대괄호 조회해 못 찾아도 undefined 로 조용히 흘러갔다 — "화풍: undefined" 가
// 그대로 프롬프트에 실려 $3.63 이 쓰레기 지시문에 나갈 뻔했다. 넷 다 여기서 던진다.
//
// normalizeAdOptions 가 입구를 지키는 것과 별개다 — 여기 오는 settings 는 저장된
// 프로젝트 문서에서 읽은 값이다. 문서는 오래 살아 옵션 목록이 나중에 바뀌어도
// 옛 값을 그대로 든 채 온다.
function need(found, what, v) {
  if (!found) throw new Error(`모르는 ${what} 예요: ${v}`);
  return found;
}

export function buildScenarioMessages({ settings, material }) {
  const fmt = need(AD_FORMATS.find((f) => f.id === settings.format), "광고 포맷", settings.format);
  const mood = need(AD_MOODS.find((m) => m.id === settings.mood), "분위기", settings.mood);
  const lang = need(AD_LANGS.find((l) => l.id === settings.narration_lang), "나레이션 언어", settings.narration_lang);
  // Object.keys() 는 자기 소유의 열거 가능한 키만 준다 — "constructor"·"__proto__" 같은
  // 프로토타입 체인의 키는 여기 안 걸린다(lib/ad/options.js 의 normalizeAdOptions 와 같은 방식).
  const styleLine = need(
    Object.keys(AD_STYLE_LINES).includes(settings.style) ? AD_STYLE_LINES[settings.style] : null,
    "화풍", settings.style
  );
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
