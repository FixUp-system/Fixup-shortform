// 대본 생성 — 처음부터 끝까지 하나로 흐르는 나레이션 원고. 장면으로 끊지 않는다.
// 컷은 이 원고를 잘라서 만든다(lib/cuts.js) — 원고가 원본이고, 승인된 문장이 글자 그대로 살아남는다.
import { sourceBlock, factCount } from "./synopsis";

const SYSTEM = `너는 짧은 영상의 대본 작가다. 사장님이 준 자료로 처음부터 끝까지 이어지는 나레이션 원고를 쓴다.
출력은 JSON 하나로 한다: {"script":"원고 전문"}
숏폼이다 — 군더더기 없이, 짧고 힘있게. 다만 광고 문구가 아니라 사실이 스스로 말하게 한다.
짧다는 것은 군더더기가 없다는 뜻이지 분량이 적다는 뜻이 아니다.
규칙:
- 하나의 글로 쓴다. 장면·컷으로 나누지 않고, 소제목이나 번호도 붙이지 않는다. 성우가 처음부터 끝까지 읽어 내려갈 원고다.
- 문장끼리 이어지게 쓴다. 앞 문장이 뒤 문장을 부르게 — '근데·그래서'로 이어지는 흐름을 만든다.
  사실을 나열하지 않는다. 각 사실을 그 결과·상황·의미로 전개한다
  (자전거방이라면 "체인을 갈았습니다"에서 그치지 말고 "그래서 언덕이 가벼워집니다"까지).
  단, 자료가 함의하는 데까지만 — 새 사실을 지어내지 않는다.
- 첫 문장은 스크롤을 멈추게 할 가장 센 한 방으로 연다 — 광고 문구가 아니라 가장 구체적이고 센 사실로.
  업력("6년째")이나 소개("○○동에 있는 △△입니다")로 열지 않는다.
- 지문의 [분량]을 지킨다. 자료에 담긴 사실이 적으면 짧게 끝낸다 — 짧은 영상은 실패가 아니다.
  분량을 채우려고 자료에 없는 말을 붙이거나 같은 말을 두 번 하지 않는다.
  ✗ "이 세탁소는 운동화 세탁으로 바쁩니다. 동네에서 운동화 세탁 서비스를 제공합니다."
- 화면 묘사를 쓰지 않는다. 이 원고는 귀로 듣는 말이다. 샷 크기·앵글·조명(클로즈업·광각·로우 앵글·골든아워 등)은 한 낱말도 넣지 않는다.
- '강조·유도·차별화·소개·훅·긴장' 같은 연출·기법 단어는 넣지 않는다.
- 명사로 끝맺는 광고 카피 투를 쓰지 않는다. 사람이 말하듯 서술어로 끝낸다.
  ✗ "그날의 손맛 그대로." / "집중과 몰입의 시간." / "2주 뒤, 당신의 손에."
  ✓ "그날 만든 걸 그대로 구워서 2주 뒤에 보내드립니다."
- 낭독 어체는 '~합니다'로 통일한다. 한 원고 안에서 '~한다'와 '~합니다'가 섞이지 않게 한다.
- 형용사로 부풀리지 않는다. 수치·고유명사·행동 같은 구체적 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 자료에서 가장 센 것부터 고른다. 사람이 한 말, 시작한 이유, 손님이 달라진 이야기가 가격·위치·영업시간보다 앞이다.
  다 담으려 하지 않는다 — 버리는 것이 대본이다.
- 다음 표현은 쓰지 않는다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.
아래는 톤 참고용 예시다(내용을 베끼지 말 것):
✗ 나쁜 예(기법 전사): "한정된 수량으로 희소성을 강조합니다."
✗ 나쁜 예(촬영 용어): "클로즈업으로 담긴 딸기를 골든아워 빛이 비춥니다."
✓ 짧고 센 예: "오전 11시부터, 하루 40잔. 지나면 없습니다."`;

// 목표 분량 — 자료가 담은 사실 수로 정한다. 사실 하나에 30자 남짓.
// 상한 220자는 초당 5.5자로 40초다(숏폼 상한). 하한 60자는 11초.
// 장면별로 초를 배분하던 것을 이 숫자 하나가 대신한다 — 총합이 흔들리던 자리다.
export function targetChars(project) {
  return Math.min(220, Math.max(60, factCount(project) * 30));
}

// 지금 자료로 만들 수 있는 길이 — 목표 분량을 초로 되돌린 값(사실 하나에 약 5초).
// 사장님에게 "자료를 더 주면 영상이 길어진다"를 숫자로 보여주는 자리다.
export function capacitySeconds(project) {
  return Math.max(1, Math.round(targetChars(project) / CHARS_PER_SEC));
}

export function buildScriptMessages(project, instruction) {
  const { script } = project;
  const target = targetChars(project);
  let user = sourceBlock(project);
  user += `\n\n[분량] 공백 빼고 ${target}자(한국어 낭독 초당 5.5자 기준 약 ${Math.round(target / CHARS_PER_SEC)}초).
${Math.round(target * UNDER_LIMIT)}자 아래로 내려가지 않는다. 사장님이 기대하는 길이가 이만큼이다.
모자라면 각 사실의 결과·이유·의미까지 한 걸음 더 가서 채운다.
없는 사실을 지어내지 않는다. 같은 말을 되풀이해 채우지도 않는다 — 둘 다 하느니 짧은 채로 둔다.`;
  if (script?.text && instruction) {
    user += `\n\n[기존 원고]\n${script.text}
[수정 지시] ${instruction}\n지시를 반영해 원고 전체를 다시 출력하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// 자기 교정 패스 — 초안에서 광고 티·상투어만 걷어낸다. 입력은 초안뿐(원문 자료를 다시 주지 않는다).
const EDIT_SYSTEM = `너는 대본을 다듬는 편집자다. 주어진 원고를 숏폼답게 날카롭게 다듬는다 — 광고 티·상투어·무른 명령형·기법 서술을 걷어낸다.
출력은 JSON 하나로 한다: {"script":"다듬은 원고 전문"}
규칙:
- 원고에 있는 사실을 하나도 빠뜨리지 않는다 — 수치·고유명사·위치·특징 그대로. 새 사실을 만들어 더하지 않는다.
- 하나로 이어지는 글을 유지한다. 장면·번호·소제목으로 쪼개지 않는다.
- 인과 사슬을 단문으로 뭉개지 않는다. 사실 간 연결("그래서 …")과 전개를 그대로 살린다. 분량을 줄이지 않는다.
- 임팩트를 깎지 않는다. 평탄하게 되쓰지 마라 — 여는말이 무디면 더 세게 친다.
- 다음 표현을 없앤다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요. "~해보세요"류 권유도 사실 진술로 바꾼다. '강조·유도·차별화' 같은 기법 서술이 있으면 실제 사실로 되살린다.
- 샷 크기·앵글·조명 용어(클로즈업·광각·로우 앵글·골든아워 등)가 낭독 문장에 섞여 있으면 기법 서술과 똑같이 걷어낸다 — 화면 설명이 새어 들어온 것이니 그 자리를 실제 사실로 되살린다.
- 낭독 어체는 '~합니다'로 통일한다. 문단마다 어체가 다르면 같은 어체로 맞춘다.
- 명사로 끝맺는 광고 카피 투("그날의 손맛 그대로", "집중과 몰입의 시간", "2주 뒤, 당신의 손에")는 서술어로 되돌린다.
  다듬는다는 핑계로 문장을 명사구로 압축하지 않는다 — 그건 다듬는 게 아니라 광고로 만드는 것이다.
- 형용사로 부풀리지 않는다. 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 문단 수와 순서를 대본 그대로 유지한다. 군더더기·기법 서술 제거 외에 내용을 바꾸지 않는다.`;

export function buildScriptEditMessages(draft) {
  return { system: EDIT_SYSTEM, messages: [{ role: "user", content: `[다듬을 원고]\n${draft.text}` }] };
}

// 교정본이 초안의 내용을 지켰는가 — 글자 수(공백 제외)가 초안의 80% 미만이면
// 전개가 뭉개진 것으로 보고 초안으로 폴백한다.
export function editKeptContent(draft, edited) {
  if (!edited?.text) return false;
  const chars = (s) => (s.text || "").replace(/\s/g, "").length;
  return chars(edited) >= chars(draft) * 0.8;
}

// ── 베낌 판정 — 대본이 남이 써 준 글을 조사만 바꿔 옮겼는가
// 프롬프트로는 못 막았다. 라이브 세 라운드에서 막을 때마다 옆으로 샜다:
// 광고 카피 → '할 말' 전사 → '보여줌' 전사 → 같은 말 되풀이. 그래서 코드가 같은 척도로 셋 다 잡는다.
// 척도는 최장 공통 부분수열 / 문장 길이 — "이 문장이 제 몫을 얼마나 말하는가"다.
// 원본(할 말·보여줌) 길이로 나누면 안 된다. 할 말을 짧은 명사구로 줄이자 제대로 쓴 문장까지
// 1.00으로 잡혔다("남은 음식은 경로당에 기부" → 그 낱말들이 다 들어가면서 뒤에 사실을 더 붙인 문장).
// 물어야 할 것은 원본이 얼마나 복사됐나가 아니라, 문장이 원본 말고 무엇을 더 말하느냐다.
// 다만 아주 짧은 쪽은 우연히 겹치므로 8자 미만이면 판정하지 않는다.
const stripMarks = (s) => (typeof s === "string" ? s.replace(/[\s.,!?~'"]/g, "") : "");
const MIN_JUDGED = 8;

// 행 두 줄만 들고 도는 LCS — 원고 하나는 길어야 수천 자다.
function lcsLength(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[b.length];
}

export function copyRatio(source, text) {
  const a = stripMarks(source), b = stripMarks(text);
  if (Math.min(a.length, b.length) < MIN_JUDGED) return 0;
  return lcsLength(a, b) / b.length;
}

// 임계는 라이브 출력을 재서 잡았다. 문장 기준으로 재면 할 말·보여줌이 같은 눈금에 놓인다:
//   전사 0.55~0.75 (할 말을 옮긴 것, 화면을 읊은 것, 수사만 덧댄 것)
//   정상 0.16~0.44 (같은 장면을 제 말로 쓴 것)
// 그 사이를 가른다. 0.44짜리(화면을 반쯤 읊되 사실도 말한 문장)는 살려 둔다.
export const COPY_LIMIT = 0.5;
// 되풀이: 같은 말을 다시 할 때는 낱말을 바꿔 말해 글자 겹침이 오히려 덜하다.
// 실제 되풀이 0.57 / 서로 다른 사실을 말한 두 문장 0.27~0.36 → 0.5.
export const REPEAT_LIMIT = 0.5;

// 한 문단 안에서 같은 말을 두 번 하는가 — 분량을 채우라니까 되풀이로 채운 자리를 잡는다.
// 짧은 문장(10자 미만)은 겹쳐 보이기 쉬워 세지 않는다("네."·"그렇습니다." 같은 것들).
export function repeatsWithin(text) {
  const sentences = (text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => stripMarks(s).length >= 10);
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      const [shortOne, longOne] =
        stripMarks(sentences[i]).length <= stripMarks(sentences[j]).length
          ? [sentences[i], sentences[j]]
          : [sentences[j], sentences[i]];
      if (copyRatio(shortOne, longOne) > REPEAT_LIMIT) return true;
    }
  }
  return false;
}

// 원고가 무엇을 잘못했는가 — 없으면 빈 배열.
// '할 말 전사'·'화면 설명 전사'는 사라졌다. 옮겨 적을 원본(scene.says·shows)이 없어졌기 때문이다.
// 원고가 원본이 되면서 그 판정 자체가 필요 없어진 것이 이 구조 변경의 가장 큰 소득이다.
// 남는 것은 원고 스스로 판정할 수 있는 둘이다.
export function scriptFaults(project, script) {
  const text = script?.text;
  if (typeof text !== "string" || !text.trim()) return [];
  const out = [];
  if (repeatsWithin(text)) out.push("같은 말 되풀이");
  if (overTarget(project, text)) out.push("분량 초과");
  if (underTarget(project, text)) out.push("분량 미달");
  return out;
}

// 목표는 눈금이지 자가 아니다. 위로는 1.3배, 아래로는 0.85배까지 둔다.
// 아래쪽이 더 좁은 이유: 10초를 고른 사장님에게 5초를 주면 그건 자료 부족이 아니라 실패다.
// 낭독 시간은 TTS 전까지 초당 5.5자 추정이므로 ±15%는 어차피 추정 오차 안이다.
export const LENGTH_SLACK = 1.3;
export const UNDER_LIMIT = 0.85;

export function overTarget(project, text) {
  const chars = (text || "").replace(/\s/g, "").length;
  return chars > targetChars(project) * LENGTH_SLACK;
}

// 자료에 있는데 원고가 아직 쓰지 않은 사실 — 미달을 채울 재료다.
// 판정 기준은 copyRatio를 원본 쪽으로 뒤집은 것: 그 사실이 원고 안에 얼마나 들어와 있는가.
export function unusedFacts(project, text) {
  const points = (project?.briefing?.key_points || []).filter((k) => typeof k === "string" && k.trim());
  return points.filter((k) => {
    const src = stripMarks(k);
    if (!src.length) return false;
    return lcsLength(src, stripMarks(text)) / src.length < 0.6;
  });
}

// 미달 판정에 글자 수만 쓰면 안 된다. 두 줄짜리 자료에서 하한을 요구했더니 모델이
// 자료에 없는 말("직접 삶아 세탁", "고객 만족도가 높습니다")을 지어내 채웠다.
// 물어야 할 것은 "짧은가"가 아니라 "채울 재료가 남았는가"다 —
// 자료의 사실을 이미 다 썼는데도 짧다면 그건 자료가 짧은 것이지 원고의 잘못이 아니다.
// (그 경우는 사장님에게 자료를 더 달라고 물어야 한다.)
export function underTarget(project, text) {
  const chars = (text || "").replace(/\s/g, "").length;
  if (chars >= targetChars(project) * UNDER_LIMIT) return false;
  return unusedFacts(project, text).length > 0;
}

// 원고는 통짜라 문단 단위로 갈아 끼울 수 없다 — 결함이 줄었을 때만 통째로 채택한다.
const REWRITE_SYSTEM = `너는 대본을 고쳐 쓰는 작가다. 원고에 지적된 문제를 고쳐 전체를 다시 쓴다.
출력은 JSON 하나로 한다: {"script":"고친 원고 전문"}
규칙:
- 하나로 이어지는 글을 유지한다. 장면·번호·소제목으로 쪼개지 않는다.
- '같은 말 되풀이'로 지적됐으면: 겹치는 문장을 지운다. 분량을 채우려고 같은 말을 다시 하지 않는다 — 짧아지는 편이 낫다.
- '분량 초과'로 지적됐으면: 지문의 목표 분량 안에 들어오게 줄인다. 담을 것이 많으면
  사람이 한 말·시작한 이유·손님이 달라진 이야기를 남기고, 가격·위치·영업시간부터 버린다.
  다 담으려다 늘어지면 숏폼이 아니다.
- '분량 미달'로 지적됐으면: 지문의 [아직 안 쓴 사실]을 원고에 넣어 채운다. 그것이 채울 재료다.
  다 넣고도 모자라면 이미 쓴 사실의 결과·이유·의미까지 한 걸음 더 간다.
  없는 사실을 지어내거나 같은 말을 되풀이해 늘리지 않는다 — 그럴 바에는 짧은 채로 둔다.
- 지적되지 않은 자리는 그대로 둔다. 고치는 김에 다시 쓰지 않는다.
- 자료에 없는 사실을 새로 만들지 않는다. 길이를 위해 지어내느니 짧게 끝낸다.
- 낭독 어체는 '~합니다'로 통일한다. 광고 문구·명사형 카피로 끝맺지 않는다.`;

export function buildScriptRewriteMessages(project, draft, faults) {
  const target = targetChars(project);
  let content = `[원고]\n${draft.text}\n\n[지적된 문제] ${faults.join(", ")}\n[목표 분량] 공백 빼고 ${target}자 안팎`;
  // 채우라고만 하면 지어낸다 — 무엇으로 채울지 자료에서 뽑아 함께 준다
  if (faults.includes("분량 미달")) {
    const unused = unusedFacts(project, draft.text);
    if (unused.length) content += `\n[아직 안 쓴 사실]\n${unused.map((u) => `- ${u}`).join("\n")}`;
  }
  return { system: REWRITE_SYSTEM, messages: [{ role: "user", content }] };
}

// 낭독 시간 근사 — 한국어 나레이션은 쉼 포함 대략 초당 5.5자.
// P0의 TTS 실측이 오면 교체될 임시 계산이고, 컷의 seconds도 이 자로 잰다.
export function secondsForText(text) {
  const chars = (text || "").replace(/\s/g, "").length;
  return Math.min(15, Math.max(2, Math.round(chars / CHARS_PER_SEC)));
}

const CHARS_PER_SEC = 5.5;

// 원고 전체 낭독 시간 근사 — 화면 표시용.
// 구성 시절 프로젝트는 paragraphs를 갖고 있으므로 그것도 읽는다.
export function estimateSeconds(script) {
  const text = script?.text ?? (script?.paragraphs || []).map((p) => p.text || "").join(" ");
  const chars = (text || "").replace(/\s/g, "").length;
  if (!chars) return 0;
  return Math.max(1, Math.round(chars / CHARS_PER_SEC));
}
