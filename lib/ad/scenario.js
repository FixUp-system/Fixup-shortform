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

★★ **가장 먼저 이 영상의 중심을 정한다.** 넷 중 하나다 — focus 칸에 그 이름을 적는다:
- product — 제품이 주인공이다. 끝까지 **같은 제품**으로 보여야 한다
- person — 사람이 주인공이다. 끝까지 **같은 사람**으로 보여야 한다
- info — 전할 내용이 주인공이다. 지켜야 할 얼굴도 물건도 없다
- place — 공간이 주인공이다(매장·카페·여행지). 끝까지 **같은 곳**으로 보여야 한다

★ **목소리도 함께 정한다**(voice). 나레이션을 누가 어떤 톤으로 읽는가 — 성별·나이대·
음색·속도·거리감을 **영어 한 줄**로 적는다. 영상 모델이 읽는 글이라 한국어를 쓰지 않는다.
  ✓ "a warm, unhurried woman in her late twenties, soft and close-mic, slight smile in the tone"
  ✗ "따뜻한 목소리" · "narration" (무엇을 하라는 것인지 모델이 모른다)
한 영상에 화자는 **하나**다. 장면마다 다른 목소리를 지정하지 마라 — 사람이 바뀐다.

정하고 나면 **모든 장면이 그 중심을 섬기게** 짠다. 중심이 person 인데 제품 클로즈업으로
장면을 채우거나, product 인데 사람 표정만 따라가면 안 된다. 사장님 설명에 제품과 사람이
함께 나와도 **주인공은 하나다** — 무엇이 없으면 이 영상이 성립하지 않는지로 고른다.

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
- ★ **대사는 지시문(text) 안에도 그대로 적는다.** 각 장면 자리에서 지문이 흐르는 대로
  the narrator says "오늘도 참았죠" 처럼 **따옴표로 원문 그대로** 넣는다. 번역하거나
  요약하지 말고, shots[].line 과 **글자 그대로 같아야 한다**. "warm narration" 같은
  분위기만 적으면 모델은 무슨 말을 할지 스스로 지어낸다 — 우리가 나중에 붙이는 자막과
  말이 어긋나는 원인이 그것이다. 대사가 없는 장면(line 이 빈 문자열)은 아무것도 안 적는다
- ★ 위의 대사는 **말(소리)이지 화면 글자가 아니다.** 대사를 자막·타이틀·캡션으로
  화면에 띄우라고 요구하지 마라 — 들리기만 하면 된다
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
  "text": "모델에 넘길 지시문 전체 (영어로 쓴다). 각 장면의 대사를 그 장면 자리에 따옴표로 원문 그대로 넣는다",
  "focus": "이 영상의 중심 — product · person · info · place 중 하나. 이 넷 밖의 말을 쓰지 않는다",
  "voice": "나레이션 목소리 — 성별·나이대·음색·속도·거리감을 영어 한 줄로",
  "shots": [{
    "beat": "이 장면이 하는 일(한국어)",
    "shows": "이 장면에 **보이는 것** — 영어 한 줄. 이미지 모델이 읽는 글이라 한국어를 쓰지 않는다",
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

// 사장님이 화면에서 열 수 있는 필드. **seconds 는 없다** — 장면 초의 합이 전체 길이와
// 같아야 한다는 규칙이 SYSTEM 에만 있고 코드 검증이 없어서, 열면 합이 깨진 채로 흘러간다.
// 화면도 초 배지를 안 연다(app/ads/[id]/page.js) — 두 자리가 같은 목록을 봐야 한다.
// ★ shows 가 들어 있다 — 이 칸만 영어다. 나머지 칸은 사장님이 읽는 한국어인데, shows 는
// 이미지 모델이 그대로 읽는 글이라(lib/film/mode.js) 고칠 자리가 없으면 사장님이 그림을
// 못 고친다. 광고 굽기는 이 필드를 안 읽으므로(scenario.text 만 쓴다) 각인에는 영향이 없다.
const EDITABLE_SHOT_FIELDS = ["beat", "shows", "camera", "lighting", "action", "sound", "line"];

// 사장님이 실제로 고친 장면만 추린다.
//
// ★ **서버가 판정한다.** 화면이 "이걸 고쳤다"고 주장하는 것을 믿지 않는다 — 저장된
// 시나리오와 대조해 다른 필드가 있는 장면만 고른 것으로 본다. 화면의 주장을 믿으면
// 안 고친 장면까지 "지켜라"로 실려 모델의 자유가 통째로 사라진다.
//
// ★ 저장된 장면 수를 넘겨 보내면 **전부 무시한다**. 장면을 늘리거나 줄이는 길은 화면에
// 없다 — 없는 길로 들어온 요청은 고친 것으로 세지 않는다(초 합계가 깨지는 자리이기도 하다).
export function pickEditedShots(savedShots, incomingShots) {
  const saved = Array.isArray(savedShots) ? savedShots : null;
  const incoming = Array.isArray(incomingShots) ? incomingShots : null;
  if (!saved || !incoming) return [];
  if (incoming.length > saved.length) return [];

  const out = [];
  for (const [i, got] of incoming.entries()) {
    if (!got || typeof got !== "object") continue;
    const was = saved[i] || {};
    const changed = EDITABLE_SHOT_FIELDS.some(
      (f) => typeof got[f] === "string" && got[f].trim() !== String(was[f] ?? "").trim()
    );
    if (!changed) continue;
    // 고친 장면은 통째로 싣는다 — 필드 하나만 실으면 모델이 그 장면의 맥락을 잃는다.
    // 단 **초는 저장값을 쓴다**: 편집으로 안 치는 값이니 들어온 값을 실으면 안 된다.
    const shot = { seconds: was.seconds };
    for (const f of EDITABLE_SHOT_FIELDS) {
      const v = typeof got[f] === "string" ? got[f].trim() : was[f];
      if (v) shot[f] = String(v).slice(0, 500);
    }
    out.push({ n: i + 1, shot });
  }
  return out;
}

export function buildScenarioMessages({ settings, material, edits }) {
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
    // ★ 제품에 적힌 글자는 **철자로 준다**(2026-08-18 사장님 지적: KONKUK UNIV. → KONKUK UNVV).
    //   광고는 사진을 한 번도 읽지 않았다 — 장수만 알려 주고 바이트는 참조로만 넘겼다.
    //   그러니 모델이 작게 찍힌 글자를 화면에서 스스로 읽어야 했다. 읽는 것보다 받아쓰는
    //   것이 훨씬 정확하다. 값은 사진 판정(lib/vlm.js describePhoto)이 남겨 둔 것을 쓴다.
    //   ★ 읽은 글자가 하나도 없으면 이 줄들이 통째로 없다 — 지문이 예전과 글자 그대로다.
    ...photos
      .map((ph, i) => ({ n: i + 1, text: ph?.vision?.lettering || "" }))
      .filter((x) => x.text)
      .map((x) => `사진 ${x.n}에 적힌 글자: "${x.text}" — 지시문에 이 철자를 그대로 적는다`),
    "",
    "사장님이 쓴 것:",
    material?.text || "",
  ];

  // 컷 편집 — 고친 장면이 있을 때만 붙는다. 없으면 이 블록이 통째로 없어서 프롬프트가
  // 편집 기능이 생기기 전과 **글자 그대로** 같다(테스트가 그것을 잰다).
  //
  // ★ 고친 장면만 싣는 이유: 안 고친 장면까지 "지켜라"로 실으면 전체 재작성이 아니라
  // 옛 시나리오의 번역이 된다. 사장님은 "여기만 이렇게" 를 원하지 "나머지도 그대로" 를
  // 원한 것이 아니다.
  if (edits?.length) {
    user.push(
      "",
      "사장님이 직접 고친 장면 — 아래 내용은 **그대로 지킨다**:",
      ...edits.map(({ n, shot }) => {
        const fields = EDITABLE_SHOT_FIELDS.filter((f) => shot[f]).map((f) => `${f}: ${shot[f]}`);
        const secs = Number.isFinite(shot.seconds) ? ` (${shot.seconds}초)` : "";
        return `- ${n}번 장면${secs}\n  ${fields.join("\n  ")}`;
      }),
      "",
      "고치지 않은 장면은 위 장면들과 자연스럽게 이어지도록 다시 써도 된다.",
      "장면 수와 각 장면의 초는 지금 그대로 유지한다."
    );
  }

  return { system: SYSTEM, messages: [{ role: "user", content: user.join("\n") }] };
}

// ★ 사진 수가 LLM 선택을 이긴다. 검증이 판정의 마지막 자리다.
// 이 영상의 **중심** — 넷 중 하나다. lib/film/mode.js 의 imagePlanFor 가 이 값으로
// 그림 계획을 가른다(무엇을 여러 장 그리고 무엇을 고정할지).
//
// ★ 컨셉(AD_FORMATS)과 다른 질문이다: 컨셉은 "어떤 형식으로 보여줄까", 이건 "무엇을
//   지켜야 하나"다. 제품 히어로 형식이어도 중심은 인물일 수 있다(사람이 쓰는 장면이
//   주인공인 제품 광고). 그래서 합치지 않는다.
export const FOCUSES = Object.freeze(["product", "person", "info", "place"]);
const DEFAULT_FOCUS = "product";

// ★★ 모르는 값에 **던지지 않는다.** 옵션(normalizeAdOptions)은 사장님이 고른 값이라
//   던지는 것이 맞지만 — 고른 것과 만들어지는 것이 달라지면 아무도 못 알아본다 —
//   이건 **모델이 낸 값**이다. 던지면 시나리오 한 편이 통째로 날아가는데 그 호출값은
//   이미 치렀다. 안전한 쪽으로 떨어뜨린다.
export function pickFocus(v) {
  return FOCUSES.includes(v) ? v : DEFAULT_FOCUS;
}

export function validateScenario(raw, photoCount) {
  const shots = Array.isArray(raw?.shots) ? raw.shots.filter((s) => s && typeof s === "object") : [];
  if (shots.length === 0) return null;
  const text = typeof raw?.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  return {
    text: text.slice(0, 4000),
    shots: shots.slice(0, 12),
    endpoint: pickEndpointKind(photoCount, raw?.endpoint),
    focus: pickFocus(raw?.focus),
    // ★ 빠지면 빈 문자열이다 — 없으면 지시문에 아무 말도 안 붙어 옛 문서와 똑같이 흐른다.
    //   기본 목소리를 코드가 지어내지 않는다(무엇이 어울리는지는 소재가 정한다).
    voice: typeof raw?.voice === "string" ? raw.voice.trim().slice(0, 300) : "",
  };
}

export async function generateScenario({ project, edits, deps = {} }) {
  const call = deps.callJson || callJson;
  // ★ edits 를 project 와 함께 넘긴다. 여기서 빠뜨리면 화면·라우트·파이프라인이 전부
  // 편집분을 옳게 날라도 **프롬프트에만 안 실려** 아무 일도 안 일어난다(실제로 그랬다).
  const { system, messages } = buildScenarioMessages({ ...project, edits });
  const raw = await call({ system, messages, stage: "광고 시나리오", projectId: project.id });
  const out = validateScenario(raw, (project.material?.photos || []).length);
  if (!out) throw new Error("시나리오를 만들지 못했어요");
  return out;
}
