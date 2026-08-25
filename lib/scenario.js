// 시나리오 — 사장님 설명 한 덩어리를 읽고 영화처럼 전체 틀을 짠다.
//
// ★ 이 파일은 서버 전용이다(lib/llm.js 를 부른다). 화면은 이것을 import 하지 않는다 —
//   화면이 쓰는 판정은 lib/scenario-rules.js 에 있다.
//
// ★ 광고(lib/ad/scenario.js)와 갈라 두는 이유: 그쪽 지문은 "컷 편집을 지시하지 마라 —
//   편집 단계가 없다"를 못박는다(영상 모델이 한 번의 생성 안에서 장면을 잇는다).
//   여기는 편집 단계가 있어서 그 줄이 정확히 뒤집힌다. 한 파일을 공유하면 한쪽 요구가
//   다른 쪽을 망가뜨린다. 광고 파일은 건드리지 않는다.
//
// ★ 카메라·조명·움직임은 여기서 묻지 않는다 — 화면 설계(2패스)가 답한다.
//   여기서 미리 받으면 값이 두 벌이 되고, 2패스의 재시도가 사장님이 고친 시나리오를 덮는다.
import { clipProfileForProject, sceneMinSecondsFor, maxSecondsFor } from "./clip-limits.js";
import { speechLangOf, langLabelOf } from "./subtitle-langs.js";
import { CONTENT_MAX_SECONDS } from "./cuts.js";
import { callJson } from "./llm.js";
import { checkScenario } from "./scenario-rules.js";
import { describePhoto as defaultDescribePhoto } from "./vlm.js";
import { readRefBytes } from "./refs-io.js";

const FOCUS_MODES = ["사람", "물건", "정보"];
const str = (v) => (typeof v === "string" ? v.trim() : "");

// ★★ 2026-08-17 — 이 지문은 칸마다 **누가 읽는가**로 언어를 가른다.
//
//   영어: subject·look(→ lib/cuts.js subjectOf 가 이미지 프롬프트에 그대로 싣는다) ·
//         narrator_voice(→ speechFor 가 `Voice:` 절로 싣는다). 그림·영상 모델의 말이다.
//   한국어: topic·angle·beat·speaker — 사장님이 읽고 고치는 값이고 다음 단계 LLM 도
//         한국어로 읽는다. speaker 는 "내레이션"이라는 **그 낱말**이 판정에 쓰인다
//         (isNarrationSpeaker). 번역하면 화면 밖 목소리 표시가 통째로 사라진다.
//   대사(line)만은 영상 모델이 읽는데도 한국어다 — 그 글자가 **그대로 자막이 된다**
//         (lib/subtitles.js 가 ffmpeg 로 태운다).
//
// ★ 예시 값이 출력 언어를 정하는 가장 강한 신호다. 그래서 지시만 바꾸지 않고 **예시까지**
//   영어로 바꿨다 — 한국어 예시를 남기면 지시와 예시가 싸우고, 모델은 예시를 따른다.
//
// ★ 같은 손에서 gpt-4o 시절의 강조(`반드시`)를 걷었다. 저장소는 claude-opus-5 로 갈아탔고
//   (lib/llm.js) Opus 5 는 지시를 훨씬 문자 그대로 따른다 — 밀어붙이려 넣은 강조가 그대로
//   남으면 과도하게 작동한다. **걷은 것은 강조 표시뿐이고 요구사항은 한 줄도 안 바뀌었다.**
//
// ★ 이 정책은 낡음을 만들지 않는다 — 앞으로 LLM 이 낼 값만 바뀐다. validateScenario 는
//   값의 언어를 보지 않으므로 이미 저장된 한국어 값은 그대로 읽히고 각인도 안 움직인다.
// ★ 지문이 **함수**다(2026-08-18). 대사 언어가 첫 화면에서 고른 값에 딸리기 때문이다 —
//   상수 템플릿에 `${speechLabel}` 을 넣으면 그 자리에서 죽는다(모듈 스코프에 그 이름이 없다).
//   ★ 한국어를 고른 프로젝트에서는 이 글이 예전과 **글자 그대로** 같아야 한다 — 지문이
//     달라지면 같은 자료에서 다른 시나리오가 나온다.
const systemFor = (speechLabel) => `너는 짧은 영상의 연출을 총괄하는 감독이다.
사장님이 준 설명을 읽고 **이 영상을 어떻게 전달할지** 전체 틀을 짠다.

너가 정하는 것은 셋이다:
- **무엇을 중심에 둘 것인가** — 이 영상이 따라가는 대상(사람·물건·정보 중 하나)
- **어떤 흐름으로 갈 것인가** — 시작에서 끝까지의 형태. 무엇으로 붙잡고 무엇으로 닫는가
- **장면을 어떻게 나눌 것인가** — 각 장면이 이야기에서 하는 일, 그 장면의 대사, 길이

지켜야 할 것:
- **영상을 장면으로 나눈다.** 장면 하나가 그림 한 장으로 만들어진다 — 한 장면 안에서
  장소나 구도가 바뀌면 안 된다.
- 장면 초의 **합이 주어진 길이와 정확히 같아야** 한다.
- 장면 하나는 **주어진 하한 이상, ${CONTENT_MAX_SECONDS}초 이하**다. 그림 한 장이 그보다
  오래 화면에 머물면 정지 화면처럼 보인다.
- **대사는 짧게. 영상 길이를 말로 다 채우지 마라** — 쉬는 자리가 있어야 숨이 트인다.
  말이 없는 장면을 넣어도 된다(그때는 line 을 빈 문자열로 둔다).
- **대사가 있는 장면에는 누가 말하는지를 적는다.** 화면에 보이는 사람이면 그 사람을
  적고(예: "40대 남성 제빵사"), 화면 밖 목소리면 "내레이션"이라고 적는다.
- **내레이션 장면이 하나라도 있으면 \`narrator_voice\` 에 그 목소리를 적는다** — 음색과 톤을
  글로 쓴다(e.g. "calm man in his 30s, low and steady tone"). 장면마다 따로 만들면
  내레이터가 중간에 바뀐다. 내레이션이 없으면 빈 문자열로 둔다.
- **\`music\` 에 이 영상 전체에 깔릴 음악을 한 줄로 적는다** — 악기·템포·분위기(e.g. "slow
  piano, sparse and calm" · "warm lo-fi beat, steady and light"). 영상 하나에 **하나**다:
  장면마다 다른 음악을 적으면 컷 경계에서 곡이 바뀐다. 음악이 없는 편이 맞으면(정적이 연출인
  경우) 빈 문자열로 둔다.
  · **가사·목소리가 있는 음악을 적지 마라** — 낭독과 겹쳐 둘 다 안 들린다.
- 화면에 **글자를 넣으라고 요구하지 마라.** 모델은 글자를 "글자처럼 생긴 무늬"로 그린다.
  자막·로고는 우리가 나중에 따로 붙인다.
- **화면 설명(무엇이 어떻게 보이는가)은 적지 마라.** 그것은 다음 단계가 정한다.
  너는 "이 장면이 이야기에서 하는 일"만 적는다.
- 정보가 모자라도 **되묻지 말고**, 합리적으로 채워 완성된 시나리오 하나를 낸다.

칸마다 쓰는 말이 다르다:
- **subject·look·narrator_voice·music 은 영어로 적는다.** 이 값들은 그림·영상 모델에 그대로
  실린다 — 번역 단계가 없다. 예시도 영어다: e.g. "a freshly baked loaf of sourdough",
  "golden-brown crust, open crumb", "calm man in his 30s, low and steady tone", "slow piano, sparse and calm".
- **topic·angle·beat·speaker 는 한국어로 적는다.** 사장님이 읽고 고치는 값이고, 다음 단계도
  한국어로 읽는다. 화면 밖 목소리는 "내레이션"이라는 그 말이 그대로 판정에 쓰인다.
- **대사(line)는 ${speechLabel}로 적는다.** 이 글자가 **그대로 자막이 되고**, 영상 모델이
  그 말로 소리 내어 읽는다 — 다른 언어로 쓰면 사장님 영상에 그 언어 자막이 박힌다.

JSON 으로만 답한다:
{
  "topic": "이 영상이 무엇에 대한 것인지 한 줄 (한국어)",
  "focus": {"mode": "사람|물건|정보 중 하나", "subject": "그 갈래의 대상 한 줄 — 영어로", "look": "물건이면 생김새 — 색·부위·소재, 그리고 **크기·비례**(다른 사물에 견주어 얼마나 큰지), 영어로 (아니면 빈 문자열)"},
  "angle": "이 영상을 어떻게 전달하는가 — 무엇을 중심에 두고 어떤 흐름으로 가는가 (한국어)",
  "narrator_voice": "화면 밖 목소리의 음색과 톤 — 영어로 (내레이션 장면이 없으면 빈 문자열)",
  "music": "영상 전체에 깔릴 음악 한 줄 — 악기·템포·분위기, 영어로 (음악이 없는 편이 맞으면 빈 문자열)",
  "shots": [{
    "beat": "이 장면이 이야기에서 하는 일 (한국어)",
    "line": "이 장면의 대사 — ${speechLabel}로. 이 글자가 그대로 자막이 된다 (없으면 빈 문자열)",
    "speaker": "이 대사를 누가 말하는가 (한국어, 대사가 없으면 빈 문자열)",
    "seconds": 이 장면의 길이(정수)
  }]
}`;

// ★★ 사진에서 읽은 값을 한 줄로 옮긴다 (2026-08-18).
//
//   사고 실측: 참조 사진은 **라벤더 토끼·검은 리본**인데 클립에 크림색 토끼·분홍 리본이
//   나왔다. 사진은 제대로 읽혀 있었다(`vision.what` = "가방에 달린 보라색 토끼 인형").
//   그런데 이 파일에 `vision` 이 한 번도 안 나와서 그 값이 시나리오 LLM 에게 안 갔고,
//   LLM 은 소재 글의 브랜드명("에스더버니")만 보고 **그 브랜드의 흔한 크림색 토끼**를
//   상상해 `focus.look` 을 썼다. 그 값이 subjectOf 를 지나 클립 프롬프트로 실려 나간다.
//
//   ★ 새 호출을 만들지 않는다 — describePhoto 가 남겨 둔 값을 옮겨 적을 뿐이다.
//   ★ **읽은 것이 없으면 빈 문자열이다.** 그래야 못 읽은 프로젝트의 지문이 예전과
//     **글자 그대로** 같다 — 지문이 흔들리면 같은 자료에서 다른 시나리오가 나오고,
//     각인을 타고 이미 값을 치른 산출물이 낡는다(이 저장소가 반복해 밟은 함정).
const visionLineOf = (p) => {
  const v = p?.vision;
  if (!v) return "";
  const parts = [];
  if (str(v.what)) parts.push(str(v.what));
  // 사람이면 나이대·성별까지 — 시나리오가 화자를 적을 때 쓰는 값이다
  if (str(v.who)) parts.push(str(v.who));
  // 제품에 인쇄된 글자는 철자 그대로 — 짐작한 브랜드명이 아니라 사진에 박힌 글자다
  if (str(v.lettering)) parts.push(`적힌 글자 "${str(v.lettering)}"`);
  // ★ 크기는 사진에서 읽은 것만 싣는다(2026-08-19). 옛 vision 에는 이 칸이 아예 없어
  //   str() 이 빈 문자열을 주고, 그러면 이 줄이 통째로 없어 지문이 예전 그대로다.
  if (str(v.scale)) parts.push(`크기 ${str(v.scale)}`);
  return parts.length ? ` — 사진에서 본 것: ${parts.join(" · ")}` : "";
};

export function buildScenarioMessages(project) {
  const profile = clipProfileForProject(project);
  // ★ 지시문의 하한도 판정과 **같은 함수**를 본다 — 갈리면 모델에게 못 지킬 규칙을
  //   요구하고 그 결과를 checkScenario 가 결함으로 잡는다(2026-08-25, 2.5 에서 그런다).
  const min = sceneMinSecondsFor(project);
  const max = maxSecondsFor(profile);
  const target = Number(project?.settings?.target_seconds) || 0;
  const aspect = project?.settings?.aspect_ratio || "9:16";
  const photoList = project?.material?.photos || [];
  const photos = photoList.map((p) => `- id:${p.id} ${p.filename}${visionLineOf(p)}`).join("\n") || "(없음)";
  // 한 장이라도 읽힌 사진이 있을 때만 붙는다 — 없으면 아래 지문이 예전과 글자 그대로다.
  const seenBlock = photoList.some((p) => visionLineOf(p))
    ? `
[사진에서 본 것을 따른다]
- 위 "사진에서 본 것"은 우리가 그 사진을 실제로 읽어 적어 둔 값이다. \`look\` 은 거기서 나온다.
- 사진에 안 보이는 색·부위·소재를 지어내지 마라.
- **사장님 설명에 브랜드명이 있어도 사진이 이긴다.** 그 브랜드의 흔한 제품을 떠올려 적으면
  안 된다 — 사장님이 파는 것은 올린 사진 속 **그 물건**이다.
- **크기도 사진에서 본 그대로다.** "크기"가 적혀 있으면 \`look\` 에 그 비례를 그대로 옮긴다.
  작은 물건을 크게 적지 마라 — 이 영상의 주인공이라고 해서 실제보다 커지는 것이 아니다.
`
    : "";

  const user = `[사장님 설명]
${project?.material?.text || ""}

[올린 사진]
${photos}
${seenBlock}
[영상 길이] ${target}초 — 장면 초의 합이 정확히 이 값이어야 한다
[화면 비율] ${aspect} ${aspect === "9:16" ? "(세로 — 세로 구도로 짠다)" : ""}
[장면 길이] 하한 ${min}초 · 상한 ${CONTENT_MAX_SECONDS}초 (영상 모델 상한은 ${max}초지만 그림 한 장의 상한이 더 낮다)
[담을 수 있는 장면 수] 최대 ${Math.max(1, Math.floor(target / min))}개`;

  return {
    system: systemFor(langLabelOf(speechLangOf(project))),
    messages: [{ role: "user", content: user }],
  };
}

// 모양만 본다 — 규칙(합·상한·하한·화자)은 lib/scenario-rules.js 의 checkScenario 가 본다.
// 둘을 한 함수에 넣으면 "모양은 맞는데 규칙에 걸린 답"을 사장님에게 보여 줄 수 없다.
export function validateScenario(obj) {
  if (!obj || !Array.isArray(obj.shots)) return null;
  const shots = [];
  for (const s of obj.shots) {
    const beat = str(s?.beat);
    // beat 가 없으면 화면 설계가 무엇을 그릴지 모른다 — 그 장면은 버린다
    if (!beat) continue;
    const line = str(s?.line);
    shots.push({
      beat,
      line,
      // 대사가 없으면 화자도 없다 — 말하지 않는 장면에 "누가 말하는가"는 뜻이 없다.
      // (checkScenario 는 그 조합을 아예 안 본다. 여기서 지우는 이유는 그쪽이 헷갈려서가
      //  아니라, 남겨 두면 **컷의 화면 밖 목소리 표시**(lib/cuts.js shotsToCuts)와 화면의
      //  화자 칸이 말없이 서로 다른 것을 가리키기 때문이다.)
      speaker: line ? str(s?.speaker) : "",
      seconds: Math.round(Number(s?.seconds) || 0),
    });
  }
  if (!shots.length) return null;

  const mode = str(obj?.focus?.mode);
  const subject = str(obj?.focus?.subject);
  const focus = FOCUS_MODES.includes(mode) && subject
    ? { mode, subject, look: str(obj?.focus?.look) }
    : null;

  // ★ narrator_voice 는 **보존한다.** 화면에 칸이 있는데 여기서 버리면 사장님이 고친 값이
  //   PATCH 에서 말없이 사라진다 — 이 저장소가 이미 겪은 "고칠 수 있는 척하는 칸"이다.
  //   컷마다 따로 부르는 fal 호출에 실리는 유일한 내레이터 목소리 원천이기도 하다
  //   (lib/cuts.js speechFor). 없으면 빈 문자열 — 없는 것과 빈 것을 가르지 않는다.
  return { topic: str(obj.topic), focus, angle: str(obj.angle), narrator_voice: str(obj.narrator_voice), shots };
}

// SHOTFORM_FAKE=all 에서 ②시나리오가 받는 답.
//
// ★ 왜 lib/llm.js 가 아니라 여기인가: 이 답은 **checkScenario 를 실제로 통과해야** 한다
//   (합 = 고른 길이, 장면마다 모델 하한 이상 CONTENT_MAX_SECONDS 이하, 대사에는 화자).
//   그러려면 목표 초와 모델 하한을 알아야 하는데 그것을 아는 곳은 프로젝트를 쥔 여기다.
//   가짜 모드 **판정**은 여전히 lib/fake.js 한 곳이고(llm.js 가 부른다), 여기는 값만 만든다.
//
// 나누는 법: 장면 수를 상한(그림 한 장이 머물 수 있는 시간)으로 먼저 정하고, 하한에 걸리면
// 줄인다. 나머지는 앞 장면부터 1초씩 얹어 **합이 정확히 목표와 같게** 한다 — 반올림으로
// 1초가 새면 그것만으로 사장님이 안 겪어도 될 결함 문구를 본다.
export function fakeScenario(project) {
  const min = sceneMinSecondsFor(project);
  const target = Number(project?.settings?.target_seconds) || 0;
  // 길이를 안 고른 프로젝트도 관통은 돼야 한다 — 그때 합 규칙은 아예 안 걸린다(checkScenario)
  const total = target > 0 ? target : min;

  let n = Math.max(1, Math.ceil(total / CONTENT_MAX_SECONDS));
  while (n > 1 && Math.floor(total / n) < min) n -= 1;
  const base = Math.floor(total / n);
  const extra = total - base * n;

  const shots = Array.from({ length: n }, (_, i) => ({
    beat: `가짜 장면 ${i + 1} — 배선만 확인한다`,
    line: `가짜 대사 ${i + 1}.`,
    // ★ 화자를 "내레이션"으로 두지 않는다 — 다만 이유가 2026-08-17 에 바뀌었다.
    //   내레이션은 이제 클립이 읽으므로(projectSpeaks 가 면제한다) 그렇게 두면 가짜 모드가
    //   **말하는 갈래**를 밟는다. 하지만 그러면 ③목소리(TTS) 전체가 가짜 관통에서 빠진다 —
    //   지금 가짜 모드가 실제로 밟는 유일한 소리 경로가 그쪽이다(캐스팅 호출에 fake 인자가
    //   없어 cast:[] 라, 화면 속 대사 쪽은 어차피 못 밟는다). 넓은 쪽을 지킨다.
    speaker: "40대 남성 사장님",
    seconds: base + (i < extra ? 1 : 0),
  }));
  return {
    topic: "가짜 시나리오 주제",
    // ★ subject 는 **영어다** — 진짜 모드가 내는 것과 같은 말이어야 한다(SYSTEM 의 언어 규칙).
    //   한국어로 두면 $0 관통에서 눈에 보이는 값이 진짜 모드와 달라, 관통이 언어 정책을
    //   한 번도 재지 않는다. "fake" 를 남겨 가짜임은 그대로 알아볼 수 있게 둔다.
    focus: { mode: "물건", subject: "a fake product (wiring check)", look: "" },
    angle: "가짜 모드 — 값이 아니라 배선을 본다",
    // 내레이션 장면이 없어도 채운다 — 이 값이 **저장까지 살아남는지**(validateScenario →
    // PATCH)를 가짜 관통에서 보려면 값이 있어야 한다.
    // ⚠️ 그 이상은 아니다: 위 화자가 화면 속 인물이라 내레이션 장면이 없고, 그러면 화면의
    //    칸은 숨겨지고(hasNarration false) 어떤 컷도 narration 표시를 안 받는다 —
    //    이 값은 가짜 모드에서 클립 프롬프트·각인에 **닿지 않는다**.
    //    subject 와 같은 이유로 **영어다** — 이 값은 클립 프롬프트의 `Voice:` 절에 실린다.
    narrator_voice: "a fake narrator, calm male voice",
    shots,
  };
}

// ★ 두 번까지만 부른다. 세 번째를 두지 않는 이유는 이 저장소가 컷 분할에서 이미 겪었다 —
//   되물었더니 모델이 같은 답을 다시 냈고 값(시간·호출)만 치렀다.
//   두 번째도 걸리면 **그대로 사장님에게 보여 준다**. 코드가 초를 몰래 주무르지 않는다:
//   합을 맞추려고 마지막 장면을 늘리면 사장님이 안 시킨 편집이 되고, 무엇이 왜 바뀌었는지
//   화면이 설명할 수 없다.
// 아직 안 본 사진만 읽는다 — 사진당 값이 든다(gpt-4o 비전 호출).
//
// ★ 단계별 흐름에서 이 판정은 지금까지 **컷 분할**에서 처음 돌았다(lib/pipeline.js splitCuts).
//   그런데 그것은 시나리오 **뒤**라, 정작 `focus.look` 을 짓는 자리는 사진을 못 본 채였다.
//   여기로 한 걸음 당긴다. 새 지출은 아니다 — splitCuts 는 이미 본 사진을 건너뛰므로,
//   같은 호출이 한 단계 앞에서 일어날 뿐이다(부르는 쪽이 읽은 값을 문서에 남기면).
// ★ 광고 경로(lib/ad/pipeline.js runScenarioStep)와 **같은 함수·같은 저장 자리**(photo.vision)다.
//   판정이 두 벌이 되면 두 흐름의 결과가 갈린다.
// ★ 판정 실패(사람도 아니고 무엇인지도 못 알아낸 답)는 흘려보낸다 — 저장하면 그 실패가
//   굳어 다음 실행이 다시 보지 않고, 지문에는 빈 값이 실린다.
async function readPhotoVision(project, { describePhoto, readBytes }) {
  const list = project?.material?.photos || [];
  const photos = [];
  let read = false;
  for (const ph of list) {
    const key = ph?.url?.split("/").pop();
    if (ph?.vision || !key) { photos.push(ph); continue; }
    const bytes = await readBytes({ source: "upload", key });
    // 볼 파일이 없으면 판정하지 않는다 — 못 보고 내리는 판정에 값을 치를 이유가 없다
    if (!bytes) { photos.push(ph); continue; }
    const vision = await describePhoto({ photoBytes: bytes, photoKey: key, projectId: project?.id });
    const judged = vision?.person || vision?.what || vision?.lettering;
    if (judged) read = true;
    photos.push(judged ? { ...ph, vision } : ph);
  }
  return { photos, read };
}

// ★ 읽은 사진값이 있으면 `photos` 를 함께 돌려준다 — 부르는 쪽(시나리오 라우트·빠른 생성)이
//   문서에 남긴다. 안 남기면 다시 쓸 때마다 사진을 또 읽어 사진당 값이 또 든다.
export async function generateScenario(
  project,
  { call = callJson, describePhoto = defaultDescribePhoto, readBytes = readRefBytes } = {}
) {
  const seen = await readPhotoVision(project, { describePhoto, readBytes });
  const built = buildScenarioMessages(
    seen.read ? { ...project, material: { ...project.material, photos: seen.photos } } : project
  );
  let scenario = null;
  let problems = [];
  // 살아남은 시나리오의 규칙 사유. problems 는 **다음 호출에 줄 지시**로도 쓰이므로 갈라 둔다.
  let kept = [];
  let calls = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = problems.length
      ? [...built.messages, { role: "user", content: `[다시] ${problems.join(" ")}\n같은 형식으로 전부 다시 낸다.` }]
      : built.messages;
    calls += 1;
    const got = validateScenario(
      // fake 는 가짜 모드에서만 쓰인다(lib/llm.js) — 주입된 call 로 도는 테스트는 이 키를
      // 읽지 않으므로 계약이 그대로다.
      await call({
        system: built.system, messages, stage: "시나리오", projectId: project?.id,
        fake: () => fakeScenario(project),
      })
    );
    if (!got) {
      // ★ **여기서 scenario 를 비우지 않는다.** 첫 답이 모양은 맞고 규칙만 어긋났는데 둘째
      //   답의 모양이 깨지면, 지우는 순간 사장님은 **고칠 수 있었던 시나리오**를 잃는다 —
      //   화면은 오류만 남고(2026-08-16 리뷰 Important 3 의 [다시 시도] 이전에는 새로고침이
      //   유일한 복구였다) LLM 딸꾹질 한 번이 벽이 된다. 규칙 위반은 사장님이 고칠 수 있고,
      //   그것이 이 화면의 존재 이유다.
      problems = ["형식이 맞지 않았어요."];
      continue;
    }
    scenario = got;
    // 살아남은 시나리오와 **짝이 맞는** 사유만 돌려준다 — 아래에서 형식 오류 문구를 덮는다.
    const checked = checkScenario(got, project);
    problems = checked.problems;
    kept = checked.problems;
    if (checked.ok) break;
  }

  // 모양이 깨진 답 때문에 남은 "형식이 맞지 않았어요."는 화면에 내보내지 않는다 —
  // 사장님이 보는 것은 살아남은 시나리오이고, 그 시나리오의 문제는 규칙 쪽이다.
  return { scenario, problems: scenario ? kept : problems, calls, ...(seen.read ? { photos: seen.photos } : {}) };
}
