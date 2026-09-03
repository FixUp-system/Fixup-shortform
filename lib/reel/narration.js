// 내레이션 한 벌 — **판독은 여기 하나다.**
//
// ★★ 2026-08-27 사장님 지시: "컷마다 음성이 끊기고 **그 컷을 설명할려고** 해. …
//   나레이션을 지금은 컷에서 뽑아내고 있는데 **전체 시나리오에서 뽑는 걸로** 수정할려고 해.
//   **영상 전체를 설명하는거야. 그 컷을 설명하는게 아니라.**"
//
//   뿌리: **내레이션은 화면 밖 목소리라 립싱크가 없다 — 컷에 묶을 이유가 애초에 없었다.**
//   컷 분할은 **그림의 단위**이지 말의 단위가 아니다. 컷에 묶었기 때문에 컷 수만큼 조각났고,
//   그 조각 하나하나가 "그 컷을 설명하는 말"이 되어 한 사람의 말이 아니라 **캡션 여럿**이 됐다.
//
// ★ 뒤의 모든 자리(지시문·게이트·자막·화면)가 "이 프로젝트가 새 길인가 옛 길인가"를 묻는다.
//   그 판정이 두 벌이 되면 **지시문은 새 길로 가고 자막은 옛 길로 가는** 어긋남이 생긴다.
// ★ 옛 문서에는 `narration` 이 없다 → null → **예전 길 그대로**다. 회귀 0 이 그 위에 선다.
//
// ★★ **순수해야 한다** — 화면(②시나리오)이 이 파일을 읽는다. import 둘은 스스로 순수하다
//   (실측 2026-08-27: lib/cuts.js 는 import 일곱이 전부 순수하고 fs·env 를 직접 안 쓴다 ·
//   lib/script.js 는 import 0 건이다).
import { splitSentences } from "../cuts.js";
import { CHARS_PER_SEC } from "../script.js";

const one = (v) => (typeof v === "string" ? v.trim() : "");

// 이 프로젝트의 내레이션 한 벌. 없으면 **null**(= 옛 길).
//
// ★ 공백만 있는 것은 **없는 것**이다 — 빈 한 벌을 들고 새 길에 들어가면 지시문이
//   `Says exactly: ""` 를 요구하게 된다.
export function reelNarration(project) {
  const raw = project?.scenario?.narration;
  const text = one(raw?.text);
  if (!text) return null;
  return { text, sayAs: one(raw?.say_as) };
}

// 자막·정렬이 물릴 문장 목록.
//
// ★★ **쪼개기 규칙을 새로 만들지 않는다.** lib/cuts.js 의 splitSentences 를 그대로 쓴다 —
//   두 벌이면 자막이 세는 문장과 정렬이 세는 문장이 갈려, whisper 조각을 엉뚱한 문장에 물린다.
export function narrationSentences(text) {
  return splitSentences(one(text));
}

// 목표 초에 담을 수 있는 글자 수 상한.
//
// ★ 값이 사는 곳은 **lib/script.js 의 CHARS_PER_SEC 하나**다 — 여기 5.5 를 다시 적으면
//   컷 분할이 쓰는 값과 갈린다.
// ⚠️ **언어마다 다르다. 지금 값은 한국어 기준이고 다른 언어는 잰 적이 없다.**
//   재는 법: 한 편 굽고 whisper 가 준 조각의 (글자 수 ÷ 초)를 본다 — 그 장치는 이미 있다
//   (lib/speech-timing.js). 실측 전까지는 **모르는 언어가 한국어 값으로 떨어진다** —
//   계수 표를 미리 지어내면 그 숫자가 실측인 것처럼 굳는다.
const CHARS_PER_SEC_BY_LANG = Object.freeze({ ko: CHARS_PER_SEC });

export function narrationLimit(seconds, lang) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return 0;
  const per = CHARS_PER_SEC_BY_LANG[lang] || CHARS_PER_SEC;
  return Math.floor(s * per);
}

// 시나리오 지시문에 실릴 **줄 하나**. 이 줄이 있으면 시나리오가 한 벌 갈래로 간다
// (lib/ad/scenario.js 의 `narrationRule`).
//
// ★★ 줄로 넘기는 이유: 상한이 **목표 초에서 나온다**(15초 → 82자). boolean 으로는 그 값을
//   못 싣고, lib/ad/scenario.js 안에서 계산하면 계수가 두 곳에 살게 된다.
//   sceneCountRule·conceptLine 이 같은 처방이다 — **안 넘기면 광고는 글자 그대로 예전이다.**
// ★ **왜 넘으면 안 되는지까지 말한다.** 이 저장소의 실측: 이유 없는 상한은 잘 안 지켜진다
//   (그리고 지켜지는지는 어차피 코드가 판정한다 — lib/scenario-rules.js).
// ★ 초를 모르면 **빈 줄**이라 갈래가 안 켜진다 — 상한을 못 재면서 새 길로 보내면
//   게이트가 잴 값이 없는 채로 모델만 새 모양을 낸다.
// 자막이 읽을 **단위 목록**. 한 벌을 문장으로 나누고 초를 글자 수 비례로 나눠 준다.
//
// ★★ 2026-08-27 — 새 길에서는 컷의 `sentence` 가 빈다(말이 `narration` 에 있다). 손대지
//   않으면 **완성본에 자막이 통째로 사라진다.** 그래서 자막 원천을 여기로 옮긴다.
// ★ 모양은 **컷과 같다**(`{ sentence, seconds }`) — lib/subtitles.js 의 buildCues 와
//   lib/speech-timing.js 의 alignSpeech 가 그 두 칸만 읽으므로, 두 함수를 고치지 않고
//   받는 목록만 바꾼다(설계 §3: "하는 일은 같다 — 받는 목록만 바뀐다").
// ★ 시각은 **글자 수 비례**다. 한 벌이 되면 문장이 이어져 컷 경계와 어긋날 자리가 애초에
//   없어진다 — whisper 정렬은 "한 클립에 대사가 여럿일 때 모델이 자기 리듬으로 배치한다"를
//   고치는 장치였고 그 어긋남의 단위가 컷이었다.
//   ⚠️ 새 길에 whisper 를 붙이려면 **컷과 개수가 다른 문장 단위의 저장 자리**가 필요하다.
//     실측으로 어긋남이 확인되기 전에는 만들지 않는다(YAGNI · 이 저장소의 "측정 없이
//     품질을 주장하지 않는다"와 같은 결).
// ★ 한 벌이 없거나 초를 모르면 **null** — 부르는 쪽이 옛 길로 간다.
// **구울 때 실제로 말한 문장.** 없으면 지금 시나리오의 것이다(옛 문서 = 예전 그대로).
//
// ★★★ 2026-09-03 사장님 신고 — *"단계별 두 번째 영상은 아예 다른 자막이 나와."*
//   뿌리는 **각인**이다. 통짜의 각인(`video.of`)은 `scenario.text` 본문 하나만 무는데
//   (lib/reel/pipeline.js), 말할 문장은 프롬프트에만 실려 나간다(lib/reel/oneshot.js 의
//   `Says exactly`). 그래서 내레이션을 고쳐도 **이미 구운 편이 낡음으로 안 잡히고**,
//   ⑥완성은 **지금 시나리오의** 내레이션을 태운다 — 소리는 옛 문장, 자막은 새 문장.
// ★ 고치는 방향이 "다시 굽게 만들기"가 아닌 이유: 한 편이 $4.5 다. 글자를 고쳤다고 이미
//   산 영상을 죽이면 사장님이 값을 두 번 낸다. **자막을 소리에 맞추는 쪽**이 옳다.
// ★ 빈 문자열은 '적힌 것'이 아니다 — 빈 한 벌로 내려가면 자막이 통째로 사라진다.
export function bakedNarration(project) {
  const said = one((Array.isArray(project?.cuts) ? project.cuts : [])[0]?.video?.said);
  if (said) return { text: said, sayAs: "" };
  return reelNarration(project);
}

// 구운 뒤에 내레이션이 **바뀌었나** — 화면이 "다시 만들어야 반영돼요"를 띄울 근거다.
// ★ 안 구운 프로젝트는 거짓이다: 비교할 소리가 없다(바뀐 것이 아니라 아직 없는 것이다).
export function narrationChanged(project) {
  const said = one((Array.isArray(project?.cuts) ? project.cuts : [])[0]?.video?.said);
  if (!said) return false;
  return said !== (reelNarration(project)?.text || "");
}

// ★★★ 2026-09-03 — 시각의 축이 **둘**이 됐다.
//   · 바닥은 그대로 **글자 수 비례**다(못 쟀을 때).
//   · 잰 값(`reel.narration_timing`)이 있으면 그 문장에 얹는다. 그전에는 whisper 가 잰 값이
//     **컷에** 박혀 한 벌 자막이 읽을 자리가 없었고, 그래서 render 라우트가 아예 안 쟀다.
//     저장 자리를 만드는 것은 *"실측으로 어긋남이 확인되기 전에는 만들지 않는다"* 로 미뤄
//     두었는데(tests/reel-narration-subtitles.test.js 머리말) **오늘 그 실측이 나왔다.**
//   ★ 개수가 어긋나면 **남는 문장은 안 건드린다** — 조각이 모자랄 때의 규율과 같다
//     (lib/speech-timing.js 의 alignSpeech). 반쯤 맞은 시각보다 일관된 바닥이 낫다.
export function narrationUnits(project, seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return null;
  const said = bakedNarration(project);
  if (!said) return null;
  const list = narrationSentences(said.text);
  if (!list.length) return null;
  // 공백을 뺀 글자 수로 잰다 — 낭독 시간은 공백이 아니라 글자가 정한다
  // (lib/subtitles.js 의 buildCues 가 조각을 나눌 때 쓰는 자와 같다).
  const weights = list.map((s) => s.replace(/\s/g, "").length);
  const sum = weights.reduce((a, b) => a + b, 0) || list.length;
  const timing = Array.isArray(project?.reel?.narration_timing) ? project.reel.narration_timing : [];
  return list.map((sentence, i) => {
    const unit = { sentence, seconds: (total * (weights[i] || 1)) / sum };
    const start = Number(timing[i]?.start);
    const spoken = Number(timing[i]?.seconds);
    if (Number.isFinite(start) && Number.isFinite(spoken) && spoken > 0) {
      unit.spoken_start = start;
      unit.spoken_seconds = spoken;
    }
    return unit;
  });
}

export function narrationRuleLine(seconds, lang) {
  const limit = narrationLimit(seconds, lang);
  if (!limit) return "";
  return `길이는 **${seconds}초에 ${limit}자**까지다 — 넘으면 말이 화면보다 길어 뒤가 잘린다`;
}
