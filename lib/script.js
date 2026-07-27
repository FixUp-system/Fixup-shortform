// 대본 생성 — 확정된 구성의 장면마다 실제 낭독할 문장을 산출(문단은 장면과 1:1)
import { sourceBlock, synopsisBlock } from "./synopsis";

const SYSTEM = `너는 짧은 영상의 대본 작가다. 확정된 [구성]의 장면마다 실제 낭독할 문장을 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"text":"문장"}]}
숏폼이다 — 군더더기 없이, 짧고 힘있게. 다만 광고 문구가 아니라 사실이 스스로 말하게 한다.
규칙:
- paragraphs는 구성의 장면과 같은 개수·같은 순서다. 장면 하나에 문단 하나. 합치거나 나누지 않는다.
- 각 장면의 '할 말'은 너에게 주는 지시다. 그 표현을 그대로 옮기지 말고 실제 대사로 실현한다.
- 각 장면의 '보여줌'은 화면 설명이다. 나레이션으로 옮기지 않는다 — 보이는 것을 말로 반복하지 않는다.
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
- 임팩트를 깎지 않는다. 평탄하게 되쓰지 마라 — 여는말이 무디면 더 세게 punch-up 한다.
- 다음 표현을 없앤다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요. "~해보세요"류 권유도 사실 진술로 바꾼다. '강조·유도·차별화' 같은 기법 서술이 있으면 실제 사실로 되살린다.
- 샷 크기·앵글·조명 용어(클로즈업·광각·로우 앵글·골든아워 등)가 낭독 문장에 섞여 있으면 기법 서술과 똑같이 걷어낸다 — 화면 설명이 새어 들어온 것이니 그 자리를 실제 사실로 되살린다.
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
