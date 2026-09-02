// 광고 시나리오 — 사장님이 준 것(설명·사진·옵션)을 Fable 에 넘겨 **영상 생성 모델에
// 그대로 들어갈 영어 프롬프트 한 편**을 받는다.
//
// ★★★ 2026-08-27 에 구조가 뒤집혔다. 그전에는 칸을 스무 개 받아 코드가 프롬프트 꼬리에
//   절 일곱 개를 덧붙였다 — 그 절들이 text 와 중복되거나, 한국어가 영어 프롬프트 안에
//   섞이거나, 말이 안 되는 영어를 만들었다("the person wears ___" 에 두 사람이 들어갔다).
//   근거는 사장님이 다른 곳에서 **실제로 잘 나온** 프롬프트 4편이다(referenece/) —
//   넷 다 꼬리에 절을 달지 않은 **한 덩어리**였고, 길이가 1,467~4,192자였다.
//
// ★★ 이 파일에는 이제 **광고만** 있다. film("한 번에 굽는 영상")은 lib/film/scenario.js 로
//   갈라져 나갔다(2026-08-27) — 두 흐름이 요구하는 것이 완전히 달라졌는데 한 파일에 두니
//   광고 지문을 손볼 때마다 film 조각을 피해 다녀야 했고, 실제로 film 전용 줄이 광고
//   지문에 섞여 나간 적이 두 번 있다.
//
// 이 파일은 서버 전용이다(lib/ad/llm.js 를 부른다). 화면은 이것을 import 하지 않는다.
// ★ lib/llm.js(OpenAI)가 아니라 lib/ad/llm.js(Claude Fable)다.
import { callJson, AD_SCENARIO_SCHEMA } from "./llm.js";
import { readRefBytes as defaultReadRefBytes } from "../refs-io.js";
import { AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES } from "./options.js";
import { adRefLabel } from "./models.js";
import { photoRole } from "../photos.js";

// 배치는 **코드가 정한다. 사진 수만 본다**(2026-08-27 사장님 확정).
//
// ★ 그전에는 사진이 **정확히 1장**일 때만 LLM 이 i2v/r2v 를 골랐다. 그 분기를 걷었다 —
//   i2v 는 사진을 첫 프레임으로 박아 버려서 제품 사진 한 장으로 광고를 만들 때 화면이
//   그 사진에서 출발하는 것 말고는 못 한다. 규칙은 이제 둘뿐이다:
//     사진 0장  → t2v (text-to-video)
//     사진 1장~ → r2v (reference-to-video)
//   그래서 시나리오 JSON 의 `endpoint` 칸도 광고에서는 사라졌다 — 물어볼 것이 없다.
export function pickEndpointKind(photoCount) {
  return (Number(photoCount) || 0) === 0 ? "t2v" : "r2v";
}

// ★★★ 광고 지문 — 2026-08-27 에 통째로 다시 썼다.
//
// 왜: 사장님이 다른 곳에서 **실제로 잘 나온** 영상 프롬프트 4편을 주었다(referenece/).
// 넷을 나란히 놓고 재니 우리 지문이 시키던 것과 정면으로 어긋나는 자리가 다섯이었다:
//   · 우리 "장면에 번호·초를 적지 마라"      ↔ 넷 중 둘이 `Scene 1 (0-5s)` 로 적었다
//   · 우리 "연출을 일일이 지정하지 마라"      ↔ 넷 다 카메라·조명을 절로 못 박았다
//   · 우리 "15초면 장면 둘이나 셋"           ↔ 15초에 다섯, 30초에 일곱이었다
//   · 우리 text 상한 4,000자                ↔ 최장 4,192자 — 우리 코드에서 **잘렸다**
//   · 우리에게 없던 것                      ↔ 넷 다 참조 보존 지시와 Negative 를 들고 있었다
// 실측 길이: 1,522 / 1,467 / 4,192 / 3,018자.
//
// ★ 구조가 뒤집혔다. 그전에는 칸(cast·wardrobe·environment·look·tone·music·focus)을
//   따로 받아 **코드가 프롬프트 꼬리에 절 일곱 개를 덧붙였다**(lib/ad/generate.js).
//   그 절들은 text 와 중복되거나(environment), 한국어가 영어 프롬프트 안에 섞이거나(angle),
//   말이 안 되는 영어를 만들었다("the person wears ___" 에 두 사람이 들어갔다).
//   이제 **Fable 이 처음부터 한 편을 쓰고 코드는 아무것도 안 붙인다** — 사장님의 성공
//   프롬프트가 전부 그 모양이다.
//
// ⚠️ **예시 문장을 넣지 않는다.** 이 저장소는 예시 오염을 두 번 겪었다 — 목소리 ✓ 예시를
//   6/8 이 글자 그대로 베꼈고(4cf7af0 옷차림도 3/3), 그래서 결과가 늘 같은 사람이었다.
//   단 이름과 무엇이 들어가는지만 말하고, 어떻게 쓰는지는 모델에 맡긴다.
export const AD_SYSTEM = `너는 세계 최고의 CF 감독이다. 연출·촬영·카피를 혼자 다 한다.

사장님이 준 것(설명·사진·옵션)을 읽고, 영상 생성 모델에 **그대로 넘길 영어 프롬프트 한 편**
을 쓴다. 우리는 네가 쓴 글을 **한 글자도 손대지 않고** 모델에 넣는다 — 그 글 하나로 완성된
광고가 나와야 한다.

프롬프트는 아래 일곱 단으로 쓴다.
★ **단마다 줄을 바꾼다.** 한 덩어리로 붙여 쓰지 마라 — 사장님이 시나리오 화면에서 이 글을
읽고 고치는데, 3,000자가 한 문단이면 읽을 수가 없다. 모델은 줄바꿈이 있어도 똑같이 읽는다.

1. **총괄 한 문장** — 무엇을 만드는지 한 문장에. 길이(초)·화면 비율·형식·화풍·분위기를
   여기 다 담는다. 첫 문장이 가장 세게 작용하니 가장 공들여 쓴다.

2. **참조 사진** — 사진이 있을 때만 쓴다. 사진마다 **무엇으로 쓰는지**(인물·제품·장소)와
   **무엇을 그대로 지켜야 하는지**를 짝지어 적는다. 사람이면 얼굴·머리·체형이고 물건이면
   모양·색·소재·비례·거기 적힌 글자다. 사진이 없으면 이 단을 통째로 뺀다.

3. **인물과 옷** — 사람이 나올 때만 쓴다. 나이대·성별·머리·체형·인상, 그리고 옷을 색과
   소재까지. 처음부터 끝까지 같은 사람·같은 옷이어야 한다고 못 박는다. 사람이 안 나오면 뺀다.

4. **장면 진행과 대사** — 여기가 본문이고 가장 길다. 무슨 일이 어떤 순서로 일어나는지 쓴다.
   · 대사는 **그 장면 안에 녹여** 쓴다 — 누가 어떤 태도로 말하는지와 한 문장으로 묶는다.
     대사 원문은 주어진 나레이션 언어 그대로, 따옴표 안에 한 글자도 바꾸지 않고 적는다.
   · 화면에 안 보이는 목소리인지, 화면 속 인물이 입을 열어 말하는지를 분명히 한다.
   · ★ **읽히는 대로 적는다.** 영어 낱말은 모델이 철자대로 읽어 뭉개고("Giants" 가
     "지에이턴스"), 붙여 쓴 고유명사도 뭉갠다("에스더버니" 가 "에스터버리"). 그런 자리는
     한글로 풀어 쓰거나 띄어 써서 소리 나는 대로 적는다. 뜻이 바뀌면 안 된다.
   · 시간 구간을 적어도 되고 안 적어도 된다 — 이야기에 맞는 쪽을 고른다.
   · 장면 수에 상한은 없다. 다만 장면이 잘게 쪼개질수록 잇는 자리가 늘고, 그 사이를 메우느라
     화면이 끊긴다. 이야기가 필요로 하는 만큼만 나눈다.

5. **카메라·조명·색** — 어떻게 찍고 어떻게 보이는가. 렌즈감·움직임·광원·대비·색 처리.
   · ★ 움직임은 제품의 **실제 물성과 상태**를 따른다 — 닫힌 용기의 내용물은 흐르지 않고,
     갓 조리된 것이 아니면 음식에서 과한 김이 피어오르지 않으며, 실내의 신발 곁에서
     흙먼지가 일지 않는다. 과장된 연출은 제품을 가짜로 보이게 한다 — 자연스러운 움직임이
     먼저다.

6. **소리** — 앰비언스·음악, 그리고 **나레이션 목소리**.
   목소리는 신상 명세가 아니라 **어떻게 들려야 하는가**로 적는다. 이 이야기를 누가 어떤
   태도로 말해야 믿기는지로 정하고, **어떤 소리는 아니어야 하는지**도 함께 적는다.
   습관처럼 한쪽 성별·나이대를 고르지 마라 — 소재가 정한다.

7. **Negative** — 이 영상에 나오면 안 되는 것. 아래 넷은 **반드시** 넣는다.
   · 화면에 뜨는 글자·자막·워터마크
   · 손가락 수가 틀리거나 일그러진 손
   · 도중에 얼굴이나 옷이 바뀌는 것
   · 제품에 없던 글자·로고를 지어내는 것

지켜야 할 것:
- 프롬프트는 **영어**로 쓴다. 대사만 주어진 나레이션 언어 그대로다.
- 길이는 **1,500자에서 4,500자 사이**다. 짧으면 모델이 빈 자리를 제멋대로 채우고, 너무 길면
  앞부분이 묻힌다.
- **화면에 글자를 넣으라고 요구하지 마라.** 이 모델들은 글자를 "글자처럼 생긴 무늬"로 그려
  오타가 난다. 자막·로고·카피는 우리가 나중에 따로 붙인다.
- 사진이 있으면 **그 안에 보이는 것을 글로 다시 묘사하지 마라.** 가리키고 지키라고만 한다.
  글로 다시 적으면 그 글이 사진을 이겨 없던 것이 그려진다. 다만 **제품이 변하는 연출**이라면
  무엇에서 무엇으로 변하는지는 적어라 — 막는 것은 없는 것을 지어내는 것이지 이야기가 아니다.
- 이 모델이 못 만드는 것을 요구하지 마라 — 인포그래픽·단면도·화면 분할·자막 애니메이션,
  그리고 컷 편집 지시("평균 컷 1.5초로 편집" 같은 것. 편집 단계가 없다).
- **한국어 나레이션은 맞춤법·띄어쓰기·고유명사 표기가 정확해야 한다.** 오타나 번역투를 쓰지
  않는다. 사장님이 적어 준 제품명·브랜드명은 철자 그대로 쓴다.
- ★★ **사장님이 쓴 글과 아래 고른 값이 어긋나면, 쓴 글이 이긴다.** 고른 값에는 기본값이
  있어서 "그냥 놔둔 것"일 수 있지만, 쓴 글은 직접 적은 것이라 뜻이 분명하다.
  예를 들어 형식이 "제품 히어로"인데 글에 "쓰는 사람의 하루를 따라가 달라"고 적혀 있으면
  그 이야기로 만든다. 분위기·화풍·언어도 같다.
  · 다만 **길이(초)·화면 비율·화질·모델 넷은 고른 값이 이긴다.** 그 넷은 글이 아니라 우리가
    영상 모델에 따로 넘기는 값이라, 글만 바꾸면 화면과 실제가 어긋난다.
- 사장님이 적어 주신 이야기가 있으면 **그것이 이야기다.** 광고 형식의 틀이 그 이야기를
  덮으면 안 된다 — 형식은 담는 그릇이지 내용이 아니다.
- **사장님이 장소를 적으셨으면 그곳이다.** "집에서"·"매장에서"·"야구장에서"라고 적혀
  있으면 그대로 쓴다. 광고 관습으로 **스튜디오화하지 마라** — 깔끔한 무배경 촬영장 같은
  말을 덧붙이면 사장님이 말한 집이 촬영장이 된다.
- 정보가 모자라도 되묻지 말고, 합리적으로 채워 완성된 한 편을 낸다.

JSON 으로만 답한다:
{
  "text": "위 일곱 단으로 쓴 영어 프롬프트 전체. 이 값이 그대로 영상 모델에 들어간다",
  "angle": "이 영상이 무슨 이야기를 하는가 — 한국어 한두 줄. 사장님이 읽는 값이다",
  "shots": [{
    "beat": "이 장면이 하는 일 (한국어 한 줄)",
    "line": "이 장면의 나레이션 대사 — text 안에 적은 것과 글자 그대로 같아야 한다 (없으면 빈 문자열)",
    "seconds": "이 장면의 길이(초, 숫자). 합이 전체 길이와 같아야 한다"
  }]
}

★ shots 는 **자막을 태우려고 우리가 쓰는 목록**이다. text 를 다 쓴 뒤에 그 내용을 장면별로
옮겨 적는 것이지, 여기서 새로 지어내는 것이 아니다. 영상 모델은 이 목록을 보지 않는다.`;

// 디테일이 뭉개지는 화질 — 대소문자 두 표기를 다 담는다(Seedance 는 소문자, H3 는 대문자).
// ★ 720p 는 여기 없다: 클로즈업이 멀쩡히 나오는 화질이라 주의를 붙이면 시끄럽기만 하다.
const LOW_RESOLUTIONS = new Set(["480p", "480P"]);

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
// ★★ 2026-08-27 — **둘로 줄었다.** 광고 시나리오에 남은 장면 칸이 beat·line·seconds
//   뿐이기 때문이다(카메라·조명·동작·소리는 이제 영상 프롬프트 text 안에 있다).
//   `shows` 도 뺐다 — 그림 단계가 있는 film 만 읽는 값인데, 그 경로에는 장면을 고치는
//   화면 자체가 없다(data-global·plan-field 를 그리는 화면은 app/ads/[id] 하나뿐이다).
const EDITABLE_SHOT_FIELDS = ["beat", "line"];

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

// ★ kind 를 받는다 — 그림 단계가 있는 경로(film)와 없는 경로(ad)가 다른 지문을 받는다
//   (systemFor 머리말 참고). generateScenario 가 project 를 통째로 펼쳐 넘기므로
//   `project.kind` 가 그대로 여기 온다.
// 사장님이 **영상 전체 값**을 고쳤을 때 그것을 고른다 — 장면(pickEditedShots)과 같은 결이다.
//
// ★★ 왜 필요한가: 그전에는 고칠 수 있는 것이 장면 칸뿐이었다. AI 가 "20대 여성"으로
//   잡았는데 사장님이 40대 남성을 원하면 [다시 쓰기]로 **통째로** 새로 뽑는 수밖에 없었고,
//   그러면 마음에 들던 장면과 대사까지 다 바뀌었다. 영상 한 편이 $2~7 이라 시나리오
//   단계에서 맞추는 것이 가장 싼 길인데, 맞출 손잡이가 없었다.
//
// ★ **서버가 판정한다.** 화면이 "이걸 고쳤다"고 주장하는 것을 믿지 않는다 — 저장된
//   시나리오와 대조해 실제로 다른 것만 고른 것으로 본다(pickEditedShots 와 같은 이유).
//   안 고친 값까지 "그대로 쓴다"로 실으면 전체 재작성이 아니라 옛 시나리오의 번역이 된다.
//
// ★ music·focus 는 **없다.** 화면이 그 둘을 안 그리므로 사장님이 고칠 길이 없고,
//   목록에만 두면 "화면에 없는데 서버는 받는" 자리가 생긴다(두 벌이 갈리는 씨앗이다).
//
// ⚠️ 이 목록은 화면(app/ads/[id]/page.js)이 그리는 칸과 **같아야 한다**. 화면은 이 파일을
//   import 할 수 없다(여기는 서버 전용이다 — vlm.js 를 통해 fs 가 딸려 온다). 그래서
//   목록이 두 벌인데, tests/ad-scenario-globals.test.js 가 둘을 대조해 어긋나면 실패한다.
// ★★ 2026-08-27 — **하나로 줄었다.** cast·wardrobe·environment·look·tone·voice 는 광고
//   시나리오가 더는 만들지 않는 칸이다(전부 영상 프롬프트 text 안으로 들어갔다). 목록에만
//   남겨 두면 "화면에는 있는데 서버가 어디에도 못 쓰는" 값이 되고, 사장님이 공들여 고친
//   것이 말없이 사라진다. 남은 하나는 이야기(angle) — 사장님이 읽는 한국어 한 줄이다.
export const EDITABLE_GLOBAL_FIELDS = ["angle"];

// 길이 상한 — validateScenario 의 칸별 상한 중 **가장 큰 값**(angle 400)으로 통일한다.
// 여기서 나온 값은 지문에 실릴 뿐이고 문서에 그대로 저장되지 않는다(다시 생성된 값이
// 저장된다) — 그래서 칸마다 다른 상한을 또 적을 이유가 없다.
const GLOBAL_EDIT_MAX = 400;

export function pickEditedGlobals(savedScenario, incoming) {
  if (!savedScenario || !incoming || typeof incoming !== "object") return {};
  const out = {};
  for (const f of EDITABLE_GLOBAL_FIELDS) {
    const got = incoming[f];
    if (typeof got !== "string") continue;
    const now = got.trim();
    if (now === String(savedScenario[f] ?? "").trim()) continue;
    // ★ 빈 값도 **고침으로 본다** — "이 영상에는 사람이 안 나온다"는 사장님의 판단이다.
    //   다만 지문에는 그 뜻을 말로 적는다(빈 줄을 실으면 모델이 무슨 뜻인지 모른다).
    out[f] = now.slice(0, GLOBAL_EDIT_MAX);
  }
  return out;
}

export function buildScenarioMessages({ settings, material, edits, globalEdits }) {
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

  // ★ 여기에 **규칙을 적지 않는다.** 규칙은 지문(AD_SYSTEM)이 한 벌로 들고 있고, 이 메시지는
  //   사장님이 고른 값과 쓴 글을 **재료로** 넘길 뿐이다. 두 곳에 규칙을 적었더니 한쪽만
  //   낡아서, 없는 칸을 가리키는 지시가 프롬프트에 실려 나간 적이 있다(2026-08-21·08-27).
  const user = [
    `길이: ${settings.seconds}초`,
    `화면 비율: ${settings.aspect_ratio}`,
    // ★★ 화질(2026-08-21) — **규칙이 아니라 재료다**: 480p 에서 "실오라기가 보이는 매크로"
    //   를 요구하면 그 자리는 뭉개진 화면이 되고, 그 요구를 쓰느라 쓴 자리는 그대로 낭비다.
    //   값만 주고 판단은 모델에 맡긴다.
    // ★ 낮은 화질일 때만 한 줄을 더 붙인다 — 높은 화질에 쓸데없는 주의를 안 남긴다.
    ...(settings.resolution ? [`화질: ${settings.resolution}`] : []),
    ...(LOW_RESOLUTIONS.has(settings.resolution)
      ? ["★ 화질이 낮다 — 실오라기·미세 질감 같은 아주 작은 것은 뭉개진다. 클로즈업은 알아볼 수 있는 크기로 잡는다."]
      : []),
    `나레이션 언어: ${lang.line} (${lang.label})`,
    `광고 포맷: ${fmt.label} — ${fmt.beat}`,
    `분위기: ${mood.label} — ${mood.line}`,
    `화풍: ${styleLine}`,
    `첨부 사진: ${photos.length}장`,
    // ★★★ **참조 사진은 프롬프트가 이름으로 불러야 쓰인다** — 세 모델 다 그렇다(2026-08-21).
    //   fal 스키마 원문:
    //     Seedance "Refer to them in the prompt as **@Image1, @Image2**, etc."
    //     H3       "referenced in the prompt as **Image 1, Image 2**, and so on."
    //   ⚠️ 이 줄이 H3 에만 붙어 있었다. 그래서 **Seedance 로 사진을 올려도 프롬프트가 그것을
    //     한 번도 안 가리켰다** — 사장님이 사진 4장으로 만든 첫 광고가 그 상태였다.
    //     표기까지 모델마다 다르므로(@ 유무·띄어쓰기) 이름은 lib/ad/models.js 의
    //     adRefLabel 하나가 만든다. 여기서 손으로 적으면 모델이 늘 때 그 자리가 낡는다.
    //   ★ 사진이 없으면 이 줄도 없다 — 가리킬 것이 없는데 규칙만 남으면 모델이 없는
    //     이름을 지어낸다.
    ...(photos.length
      ? [
          "★ 이 모델은 참조 사진을 **프롬프트 안에서 이름으로 가리켜야** 쓴다.",
          `  첨부한 순서대로 ${photos.map((_, i) => adRefLabel(settings?.model, i + 1)).join(" · ")} 다.`,
          `  그 사진이 쓰이는 자리에서 "${adRefLabel(settings?.model, 1)}" 이라고 **영어로 그대로** 적는다.`,
          "  안 가리키면 사진이 통째로 무시된다.",
          // ★★ 2026-08-31 사장님 지시 — 사진마다 **종류**(로고·제품·인물)를 준다.
          //   그전에는 순서만 알려 줘서, 모델이 **어느 것이 로고이고 어느 것이 제품인지
          //   몰랐다.** 종류와 함께 "변하면 안 된다"를 못 박는다.
          // ★ 종류를 든 사진만 적는다 — 옛 문서는 이 줄이 통째로 없어 프롬프트가 **글자
          //   그대로**다(각인이 이 글 위에 서 있다).
          // ★ 이름은 여기서 손으로 안 적는다 — adRefLabel 이 모델마다 만든다.
          ...photos
            .map((ph, i) => ({ n: i + 1, role: photoRole(ph?.role) }))
            .filter((x) => x.role)
            .map(({ n, role }) => `  ${adRefLabel(settings?.model, n)} = ${role.label}: ${role.ko}.`),
        ]
      : []),
    "",
    "사장님이 쓴 것:",
    material?.text || "",
  ];

  // 사장님이 고친 값 — 고친 것이 있을 때만 붙는다. 없으면 이 블록이 통째로 없어서
  // 프롬프트가 편집 기능이 생기기 전과 **글자 그대로** 같다(테스트가 그것을 잰다).
  //
  // ★ 고친 것만 싣는 이유: 안 고친 것까지 "지켜라"로 실으면 전체 재작성이 아니라 옛
  //   시나리오의 번역이 된다. 사장님은 "여기만 이렇게" 를 원한 것이지 "나머지도 그대로" 를
  //   원한 것이 아니다.
  const globalRows = Object.entries(globalEdits || {});
  if (globalRows.length) {
    user.push(
      "",
      "사장님이 직접 고친 값 — **이대로 쓴다**(다시 지어내지 마라):",
      ...globalRows.map(([f, v]) =>
        v ? `- ${f}: ${v}` : `- ${f}: (비웠다 — 이 영상에는 해당 없음. 빈 문자열로 둔다)`
      ),
      "",
      "고친 값에 **맞게 나머지를 다시 쓴다.** 고친 값 자체는 한 글자도 바꾸지 마라."
    );
  }

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
      "장면 수와 각 장면의 초는 지금 그대로 유지한다.",
      "★ 고친 대사는 **영상 프롬프트(text) 안에도** 그 글자 그대로 들어가야 한다."
    );
  }

  return { system: AD_SYSTEM, messages: [{ role: "user", content: user.join("\n") }] };
}

// 모델이 낸 값을 우리가 쓰는 모양으로 정리한다. **칸은 셋뿐이다.**
export function validateScenario(raw, photoCount) {
  const shots = Array.isArray(raw?.shots) ? raw.shots.filter((s) => s && typeof s === "object") : [];
  if (shots.length === 0) return null;
  const text = typeof raw?.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  return {
    // ★ 상한 6,000자(2026-08-27, 그전에는 4,000). 사장님이 준 성공 프롬프트 넷 중 최장이
    //   **4,192자**라 옛 상한에서는 잘려 나갔다. 여유를 두되 무한은 아니다 — 지문이
    //   1,500~4,500자를 시키므로 이 상한에 닿는 것은 이미 비정상이다.
    text: text.slice(0, 6000),
    shots: shots.slice(0, 12),
    // ★ 배치는 **코드가 정한다** — 모델이 낸 값을 안 본다(위 pickEndpointKind).
    endpoint: pickEndpointKind(photoCount),
    // ★ 사장님이 읽는 한 줄. 빠지면 빈 문자열이라 화면이 그 칸을 안 그린다.
    angle: typeof raw?.angle === "string" ? raw.angle.trim().slice(0, 400) : "",
  };
}

// 확장자에서 Anthropic 이 받는 media_type 을 고른다. 모르는 확장자는 null 이고, 그 사진은
// 안 붙인다 — 틀린 media_type 을 보내면 요청 전체가 400 이다.
const IMAGE_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
// Anthropic 은 이미지 한 장에 5MB 상한을 둔다. 넘는 사진은 **붙이지 않고 건너뛴다** —
// 그래도 지시문의 "@Image1" 안내는 그대로 남으므로 Fable 은 그 자리가 있다는 것은 안다.
// 한 장 때문에 시나리오 생성 전체가 400 으로 죽는 것보다 낫다.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// ★★ 사진을 **Fable 에 직접 붙인다**(2026-08-27). 그전에는 gpt-4o(lib/vlm.js)가 사진을 읽어
//   글자·색·크기를 글로 옮기고, 그 글만 지문에 실었다 — 더 잘 보는 모델 앞에 덜 보는 모델을
//   통역으로 세운 꼴이었다(Fable 5 는 비전 최고 성능 모델이다). 이제 원본을 그대로 준다.
// ★ 실패는 흘려보낸다 — 사진 하나를 못 읽었다고 시나리오를 못 만들 이유가 없다.
export async function photoBlocks(project, deps = {}) {
  const photos = project?.material?.photos || [];
  if (!photos.length) return [];
  const readBytes = deps.readRefBytes || defaultReadRefBytes;
  const out = [];
  for (const ph of photos) {
    const key = ph?.url?.split("/").pop();
    const media_type = IMAGE_TYPES[String(key || "").split(".").pop()?.toLowerCase()];
    if (!key || !media_type) continue;
    const bytes = await readBytes({ source: "upload", key }).catch(() => null);
    if (!bytes || bytes.length > IMAGE_MAX_BYTES) continue;
    out.push({ type: "image", source: { type: "base64", media_type, data: Buffer.from(bytes).toString("base64") } });
  }
  return out;
}

export async function generateScenario({ project, edits, globalEdits, deps = {} }) {
  const call = deps.callJson || callJson;
  // ★ edits 를 project 와 함께 넘긴다. 여기서 빠뜨리면 화면·라우트·파이프라인이 전부
  //   편집분을 옳게 날라도 **프롬프트에만 안 실려** 아무 일도 안 일어난다(실제로 그랬다).
  const { system, messages } = buildScenarioMessages({ ...project, edits, globalEdits });
  // ★ 사진을 **글보다 앞에** 둔다. Anthropic 문서의 권장 순서이고, 글이 사진을 가리키는
  //   구조("@Image1 의 제품")라 사진이 먼저 와야 그 이름이 무엇을 가리키는지 분명하다.
  //   사진이 없으면 content 는 예전 그대로 **문자열**이다(옛 호출 자리가 안 바뀐다).
  const blocks = await photoBlocks(project, deps);
  const content = blocks.length
    ? [...blocks, { type: "text", text: messages[0].content }]
    : messages[0].content;
  const raw = await call({
    system, messages: [{ role: "user", content }], stage: "광고 시나리오",
    projectId: project.id, schema: AD_SCENARIO_SCHEMA,
  });
  const out = validateScenario(raw, (project.material?.photos || []).length);
  if (!out) throw new Error("시나리오를 만들지 못했어요");
  return out;
}
