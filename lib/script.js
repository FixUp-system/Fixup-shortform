// 대본 생성 — 확정된 구성의 장면마다 실제 낭독할 문장을 산출(문단은 장면과 1:1)
import { sourceBlock, synopsisBlock } from "./synopsis";

const SYSTEM = `너는 짧은 영상의 대본 작가다. 확정된 [구성]의 장면마다 실제 낭독할 문장을 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"text":"문장"}]}
숏폼이다 — 군더더기 없이, 짧고 힘있게. 다만 광고 문구가 아니라 사실이 스스로 말하게 한다.
짧다는 것은 군더더기가 없다는 뜻이지 분량이 적다는 뜻이 아니다.
규칙:
- paragraphs는 구성의 장면과 같은 개수·같은 순서다. 장면 하나에 문단 하나. 합치거나 나누지 않는다.
- 장면의 사실을 다 담는다. 짧게 끝내려고 사실을 버리지 않고, 분량을 채우려고 자료에 없는 말을 붙이지도 않는다.
  참고로 한국어 낭독은 초당 5.5자 남짓이라 5초 장면이면 25자 안팎이다. 다만 이 분량은 목표가 아니라 눈금이다 —
  담을 사실이 그것뿐이면 짧게 끝내라. 장면의 초는 네가 쓴 문장에 맞춰 나중에 다시 잡힌다.
- 명사로 끝맺는 광고 카피 투를 쓰지 않는다. 사람이 말하듯 서술어로 끝낸다.
  ✗ "그날의 손맛 그대로." / "집중과 몰입의 시간." / "2주 뒤, 당신의 손에."
  ✓ "그날 만든 걸 그대로 구워서 2주 뒤에 보내드립니다."
- 한 문단 안에서 같은 말을 두 번 하지 않는다. 분량이 모자라도 되풀이로 채우지 않는다 — 짧게 끝내는 편이 낫다.
  ✗ "이 세탁소는 운동화 세탁으로 바쁩니다. 동네에서 운동화 세탁 서비스를 제공합니다."
- 앞 문단과 '근데·그래서'로 이어지게 쓴다. 구성이 잡은 인과를 문장에서도 살린다.
- 각 장면의 '할 말'은 너에게 주는 지시다. 그 표현을 그대로 옮기지 말고 실제 대사로 실현한다.
  조사와 어미만 바꿔 옮기는 것은 실현이 아니라 전사다. 그 사실이 손님에게 무엇인지까지 한 걸음 더 간다.
- 낭독 어체는 '~합니다'로 통일한다. 한 대본 안에서 '~한다'와 '~합니다'가 섞이지 않게 한다.
- 각 장면의 '보여줌'은 화면 설명이다. 나레이션으로 옮기지 않는다 — 보이는 것을 말로 반복하지 않는다.
  ✗ 보여줌이 "세제를 넣는 손 클로즈업, 조작 패널을 누르는 모습"인데 문장을 "세제를 넣고 조작 패널을 누릅니다."로 쓰는 것.
- '보여줌'에 적힌 샷 크기·앵글·조명 용어(클로즈업·광각·로우 앵글·골든아워 등)는 낭독 문장에 한 낱말도 넣지 않는다. 그건 카메라에게 주는 지시이지 사람에게 하는 말이 아니다.
- '강조·유도·차별화·소개·훅·긴장' 같은 연출·기법 단어는 나레이션에 절대 넣지 않는다.
- 사실을 나열하지 않는다. 각 사실을 그 결과·상황·의미로 이어 전개한다("직접 삶습니다"에서 그치지 말고 "그래서 단맛이 다릅니다"까지). 단, 자료가 함의하는 데까지만 — 새 사실을 지어내지 않는다.
- 첫 문단은 스크롤을 멈추게 할 가장 센 한 방으로 연다 — 광고 문구가 아니라 가장 구체적이고 센 사실로.
- 형용사로 부풀리지 않는다. 수치·고유명사·행동 같은 구체적 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 다음 표현은 쓰지 않는다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요.
- 과장·허위 금지 — 구성·자료에 없는 사실을 만들지 않는다.
아래는 톤 참고용 예시다(내용을 베끼지 말 것):
✗ 나쁜 예(기법 전사): "한정된 수량으로 희소성을 강조합니다."
✗ 나쁜 예(촬영 용어 전사): "클로즈업으로 담긴 딸기를 골든아워 빛이 비춥니다."
✗ 나쁜 예(할 말 전사): 할 말이 "새 자전거는 팔지 않고 수리만 한다"인데
   문장을 "새 자전거는 팔지 않고 수리만 합니다."로 쓰는 것 — 조사만 바꾼 복사다.
✓ 같은 할 말을 실현한 예: "새 자전거는 안 팝니다. 굴대만 갈면 3년은 더 타시니까요."
✓ 짧고 센 예: "오전 11시부터, 하루 40잔. 지나면 없습니다."`;

export function buildScriptMessages(project, instruction) {
  const { script, synopsis } = project;
  let user = sourceBlock(project);
  if (synopsis) {
    user += `\n\n[구성 — 이 설계대로 쓴다]\n${synopsisBlock(synopsis)}`;
  }
  if (script && instruction) {
    user += `\n\n[기존 대본]\n${script.paragraphs.map((p, i) => `${i + 1}. ${p.text}`).join("\n")}
[수정 지시] ${instruction}\n지시를 반영해 대본 전체를 다시 출력하라. 장면 개수는 그대로 유지한다.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// 자기 교정 패스 — 초안에서 광고 티·상투어만 걷어낸다. 입력은 초안뿐(원문 자료를 다시 주지 않는다).
const EDIT_SYSTEM = `너는 대본을 다듬는 편집자다. 주어진 대본을 숏폼답게 날카롭게 다듬는다 — 광고 티·상투어·무른 명령형·기법 서술을 걷어낸다.
출력은 JSON 하나로 한다: {"paragraphs":[{"text":"문장"}]}
규칙:
- 대본에 있는 사실을 하나도 빠뜨리지 않는다 — 수치·고유명사·위치·특징 그대로. 새 사실을 만들어 더하지 않는다.
- 인과 사슬을 단문으로 뭉개지 않는다. 사실 간 연결("그래서 …")과 문단의 전개를 그대로 살린다. 분량을 줄이지 않는다.
- 임팩트를 깎지 않는다. 평탄하게 되쓰지 마라 — 여는말이 무디면 더 세게 친다.
- 다음 표현을 없앤다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요. "~해보세요"류 권유도 사실 진술로 바꾼다. '강조·유도·차별화' 같은 기법 서술이 있으면 실제 사실로 되살린다.
- 샷 크기·앵글·조명 용어(클로즈업·광각·로우 앵글·골든아워 등)가 낭독 문장에 섞여 있으면 기법 서술과 똑같이 걷어낸다 — 화면 설명이 새어 들어온 것이니 그 자리를 실제 사실로 되살린다.
- 낭독 어체는 '~합니다'로 통일한다. 문단마다 어체가 다르면 같은 어체로 맞춘다.
- 명사로 끝맺는 광고 카피 투("그날의 손맛 그대로", "집중과 몰입의 시간", "2주 뒤, 당신의 손에")는 서술어로 되돌린다.
  다듬는다는 핑계로 문장을 명사구로 압축하지 않는다 — 그건 다듬는 게 아니라 광고로 만드는 것이다.
- 형용사로 부풀리지 않는다. 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 문단 수와 순서를 대본 그대로 유지한다. 군더더기·기법 서술 제거 외에 내용을 바꾸지 않는다.`;

export function buildScriptEditMessages(draft) {
  const body = draft.paragraphs.map((p, i) => `${i + 1}. ${p.text}`).join("\n");
  return { system: EDIT_SYSTEM, messages: [{ role: "user", content: `[다듬을 대본]\n${body}` }] };
}

// 교정본이 초안의 내용을 지켰는가 — 문단 수가 줄거나 글자 수(공백 제외)가 초안의 80% 미만이면
// 전개가 뭉개진 것으로 보고 초안으로 폴백한다. 사실 유실 추적은 이 두 지표만 본다
// (coverage는 스키마에서 사라졌다 — 어떤 사실을 쓰는지는 구성의 scene.facts가 쥔다).
export function editKeptContent(draft, edited) {
  if (!edited) return false;
  if (edited.paragraphs.length < draft.paragraphs.length) return false;
  const chars = (s) => s.paragraphs.map((p) => (p.text || "").replace(/\s/g, "").length).reduce((a, b) => a + b, 0);
  if (chars(edited) < chars(draft) * 0.8) return false;
  return true;
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

export function copyRatio(source, text) {
  const a = stripMarks(source), b = stripMarks(text);
  if (Math.min(a.length, b.length) < MIN_JUDGED) return 0;
  // 행 두 줄만 들고 도는 LCS — 문단 하나는 길어야 수백 자다.
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[b.length] / b.length;
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

// 이 문단이 무엇을 잘못했는가 — 없으면 null. 판정은 여기 하나뿐이고,
// 지목·병합이 같은 자를 쓴다(다른 자를 쓰면 고쳐 온 문단을 다시 버리게 된다).
export function paragraphFault(scene, text) {
  if (!scene) return null;
  if (copyRatio(scene.says, text) > COPY_LIMIT) return "할 말 전사";
  if (copyRatio(scene.shows, text) > COPY_LIMIT) return "화면 설명 전사";
  if (repeatsWithin(text)) return "같은 말 되풀이";
  return null;
}

// 다시 써야 할 문단과 그 이유. 이유는 되돌리기 프롬프트에 그대로 실린다 —
// 무엇이 잘못됐는지 알려주지 않으면 모델은 같은 자리로 돌아온다.
export function paragraphsToRewrite(synopsis, script) {
  const scenes = synopsis?.scenes;
  const paragraphs = script?.paragraphs;
  if (!Array.isArray(scenes) || !Array.isArray(paragraphs)) return [];
  const out = [];
  paragraphs.forEach((p, i) => {
    const reason = paragraphFault(scenes[i], p.text);
    if (reason) out.push({ idx: i, reason });
  });
  return out;
}

// 되돌리기 결과를 문단 단위로 받는다.
// 처음엔 "지목된 문단 수가 줄었을 때만" 통째로 채택했는데, 풍부한 자료에서 6문단 중 5문단이
// 지목되자 두어 문단이 제대로 고쳐져 와도 전부 버려졌다. 좋아진 문단만 갈아 끼운다.
// 지목하지 않은 문단은 모델이 손댔더라도 초안을 지킨다 — 멀쩡한 자리가 흔들리면 안 된다.
export function mergeRewrite(synopsis, draft, rewritten, targets) {
  const fresh = rewritten?.paragraphs;
  if (!Array.isArray(fresh) || fresh.length !== draft.paragraphs.length) return draft;
  const scenes = synopsis?.scenes || [];
  const wanted = new Set(targets.map((t) => t.idx));
  return {
    ...draft,
    paragraphs: draft.paragraphs.map((p, i) => {
      if (!wanted.has(i)) return p;
      const text = fresh[i]?.text;
      if (typeof text !== "string" || !text.trim()) return p;
      return paragraphFault(scenes[i], text) ? p : fresh[i];
    }),
  };
}

// 지목된 문단만 다시 쓰게 한다 — 멀쩡한 문단까지 다시 뽑으면 승인한 결과가 통째로 흔들린다.
const REWRITE_SYSTEM = `너는 대본을 고쳐 쓰는 작가다. 지목된 문단이 남이 써 준 글을 옮겨 적었거나 같은 말을 되풀이해서 다시 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"text":"문장"}]}
규칙:
- 문단 수와 순서를 그대로 유지한다. 지목되지 않은 문단은 한 글자도 바꾸지 않는다.
- '할 말 전사'로 지목됐으면: 할 말이 가리키는 사실을, 그 사실이 손님에게 무엇인지까지 한 걸음 더 가서 쓴다.
  할 말의 낱말을 그대로 늘어놓지 않는다. 같은 사실을 다른 문장으로 말한다.
- '화면 설명 전사'로 지목됐으면: 보여줌은 카메라에게 주는 지시다. 보이는 것을 말로 읊지 말고, 화면이 말하지 않는 것을 말한다.
- '같은 말 되풀이'로 지목됐으면: 겹치는 문장을 지운다. 분량을 채우려고 같은 말을 다시 하지 않는다 — 짧아지는 편이 낫다.
- 자료와 장면에 없는 사실을 새로 만들지 않는다. 길이를 위해 지어내느니 짧게 끝낸다.
- 낭독 어체는 '~합니다'로 통일한다.
- 광고 문구·명사형 카피로 끝맺지 않는다.`;

export function buildScriptRewriteMessages(project, draft, targets) {
  const scenes = project.synopsis?.scenes || [];
  const byIdx = new Map(targets.map((t) => [t.idx, t.reason]));
  const body = draft.paragraphs
    .map((p, i) => {
      const reason = byIdx.get(i);
      if (!reason) return `${i + 1}. ${p.text}  ← 그대로 둘 것`;
      const scene = scenes[i] || {};
      return `${i + 1}. ${p.text}\n   ← 다시 쓸 것 (${reason}). 이 장면의 할 말: ${scene.says || ""} / 보여줌: ${scene.shows || ""}`;
    })
    .join("\n");
  const list = targets.map((t) => `${t.idx + 1}번(${t.reason})`).join(", ");
  return {
    system: REWRITE_SYSTEM,
    messages: [{ role: "user", content: `[대본]\n${body}\n\n[다시 쓸 문단] ${list}` }],
  };
}

// ── 장면의 초를 대본에 맞춘다
// 구성 단계의 seconds는 문장이 없는 상태의 배분 의도였다. 문장이 정해지면 그 문장이 실측에 더 가깝다.
// (P0의 TTS가 오면 실측이 다시 덮는다.) 구성 version은 올리지 않는다 —
// 사장님이 승인한 구성이 바뀐 게 아니라 같은 구성의 초가 문장에 맞춰진 것뿐이고,
// 버전을 올리면 대본 화면에 "구성이 바뀌었어요"라는 거짓 경고와 유료 재생성 버튼이 뜬다.
export function secondsForText(text) {
  const chars = (text || "").replace(/\s/g, "").length;
  return Math.min(15, Math.max(2, Math.round(chars / CHARS_PER_SEC)));
}

export function syncSceneSeconds(synopsis, script) {
  const paragraphs = script?.paragraphs || [];
  return {
    ...synopsis,
    scenes: synopsis.scenes.map((s, i) =>
      paragraphs[i] ? { ...s, seconds: secondsForText(paragraphs[i].text) } : s
    ),
  };
}

// 대본 낭독 시간 근사 — 표시 전용(프롬프트·파이프라인에 주입하지 않는다).
// 한국어 나레이션은 쉼 포함 대략 초당 5.5자. P0에서 TTS 실측 길이로 교체될 임시 계산.
const CHARS_PER_SEC = 5.5;

export function estimateSeconds(script) {
  const chars = (script?.paragraphs || [])
    .map((p) => (p.text || "").replace(/\s/g, "").length)
    .reduce((a, b) => a + b, 0);
  if (!chars) return 0;
  return Math.max(1, Math.round(chars / CHARS_PER_SEC));
}
