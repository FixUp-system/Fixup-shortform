// 시나리오 — 옵션+프롬프트+사진을 받아 Seedance 에 그대로 넘길 지시문을 쓴다.
//
// 이 파일은 서버 전용이다(lib/ad/llm.js 를 부른다). 화면은 이것을 import 하지 않는다.
// ★ lib/llm.js(OpenAI)가 아니라 lib/ad/llm.js(Claude Fable)다 — 광고 경로만 갈아탔다.
import { callJson, scenarioSchemaFor } from "./llm.js";
import { AVATARS } from "../refs.js";
import { describePhoto as defaultDescribePhoto } from "../vlm.js";
import { readRefBytes as defaultReadRefBytes } from "../refs-io.js";
import { AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES } from "./options.js";
import { adRefLabel } from "./models.js";

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
// ★★★ **그림 단계가 있는 경로(film)만 쓰는 토막**이다 — 광고(kind:"ad")에는 안 실린다.
//
// 광고 굽기는 `scenario.text` 하나만 fal 에 넘긴다(lib/ad/generate.js). shows·avatar_id 는
// **그림 계획**(lib/film/mode.js 의 imagePlanFor)이 읽는 값이고, 광고 화면도 그 둘을 안
// 그린다(app/ads/[id]/page.js 에 0건). 그런데 지문은 그 둘을 잘 쓰라고 1,289자를 들여
// 설명하고 스키마는 required 로 강제하고 있었다 — **지문 전체의 15.8%** 다.
// 아무도 안 보는 값을 만드느라 쓰는 주의는 그대로 손해다(2026-08-21 실측).
//
// ★ 두 벌이 되는 것이 아니다 — 지문은 여전히 한 벌이고, film 전용 토막만 조건부로 끼운다.
//   그래서 film 쪽 지문은 **글자 그대로 예전과 같다**(테스트가 그것을 잰다).
const AVATAR_BLOCK = `★ **사람이 보이는 장면에는 사진을 고른다**(avatar_id). 준비된 인물 사진은 아래가 전부다:
${AVATARS.map((a) => `- ${a.id} : ${a.traits}`).join("\n")}
  · **같은 사람이 여러 장면에 나오면 같은 id 를 적는다** — 그래야 컷마다 얼굴이 안 바뀐다.
  · 사람이 안 보이는 장면(제품만·풍경만)은 **빈 문자열**이다.
  · ★ **id 를 적었으면 그 장면의 shows 는 얼굴이 보이게 쓴다.** 손동작만 적으면 모델이
    손만 그려서 그 인물 사진이 쓰이지 않는다(실측 2026-08-19: "clipping the keyring onto
    the handle" → 손만 나왔다). 얼굴을 안 보일 셈이면 id 를 비운다.
  · 맞는 사람이 목록에 없으면 억지로 고르지 말고 **빈 문자열로 비운다** — 엉뚱한 얼굴이
    실리는 것보다 낫다.

`;

const SHOWS_RULES = `- ★★ **shows 는 정지 화면이다 — 움직임을 적지 마라.** shows 로 만드는 것은 그림 한 장이라,
  "흔들린다 · 회전한다 · 걸어간다" 같은 말을 적으면 모델이 그것을 **모션 블러**로 그린다.
  실측(2026-08-19): "gently swaying" 한 마디에 제품이 흔들린 채 생성됐고, 그 그림이 굽기에
  참조로 가서 영상까지 흔들린다.
  움직임은 **action 칸이 받는다**(그 칸이 따로 있는 이유가 이것이다) — 속도도 거기 적는다.
    ✗ shows: "the keyring gently swaying on the bag strap"
    ✓ shows: "the keyring hanging on the bag strap" · action: "sways gently, slow motion"
- ★★ **한 장면에는 초점 대상이 하나다.** shows 에 볼거리를 쉼표로 **나열하지 마라** —
  모델이 그것을 **분할 화면·콜라주**로 그린다. 실측(2026-08-19)에서 매크로 컷이 두 번
  연속 깨졌다: "리본, 털, 금속 고리…"라고 적었더니 한 번은 고리가 화면을 가렸고 한 번은
  화면이 세 조각으로 갈렸다.
    ✗ "extreme close-up details: pink ribbon, soft fur fibers, the metal clasp"
    ✓ "extreme close-up of the pink satin ribbon on the bunny's ear"
  여러 곳을 보여 주고 싶으면 **장면을 나눈다**(그것이 장면이 여럿인 이유다).
`;

const SHOWS_FIELD = `    "shows": "이 장면의 **정지 화면** — 카메라를 그 순간 멈춘 사진 한 장. 영어 한 줄, 한국어를 쓰지 않는다",
  "avatar_id": "이 장면에 사람이 보이면 준비된 사진 중 하나의 id, 없으면 빈 문자열",
`;

const TRANSITION_FIELD = `    "transition": "비워 둔다 — 이음은 모델이 알아서 만든다 (칸은 옛 문서 때문에 남아 있다)",
`;

export function systemFor(kind) {
  // 그림 단계가 있는가 — 광고만 없다. 모르는 kind 는 그림이 있는 쪽(예전 그대로)으로 둔다.
  const draws = kind !== "ad";
  return `너는 광고 CF 를 연출하는 감독이다.
사장님이 준 설명과 옵션을 읽고, 영상 생성 모델에 그대로 넘길 **하나의 지시문**을 쓴다.

★★ 이 영상은 **한 번에 통째로** 만들어진다 — 컷을 이어 붙이는 것이 아니다. 그래서
지시문은 **끊기지 않는 하나의 흐름**이어야 한다. 장면에 번호를 매기거나 초를 적어
쪼개지 마라: 모델은 그 초를 지키지 않으면서 **경계만** 만들고, 그 자리에서 화면도
소리도 끊긴다(실측 2026-08-19).
★★ 연출을 일일이 지정하지 마라. 앵글·렌즈·조명·전환을 장면마다 못 박을수록 모델의
자유도가 줄고 결과가 뻣뻣해진다 — **무엇이 보이고 무슨 일이 일어나는가**를 쓰면
영상 모델이 어떻게 찍을지 정한다. 꼭 필요한 연출(예: 제품을 크게 보여야 하는 자리)만
말로 적는다.

★★ **가장 먼저 무슨 이야기를 할지 정한다**(angle) — 무엇을 중심에 두고 어떤 흐름으로
가는가를 한국어 한두 줄로. 장면은 그 다음이다.
  · **사장님이 적어 주신 이야기가 있으면 그것이 이야기다.** 광고 포맷의 틀(등장→클로즈업→
    마무리 같은)이 그 이야기를 덮으면 안 된다 — 포맷은 담는 그릇이지 내용이 아니다.
    e.g. 사장님이 "마스코트가 키링으로 변해 야구장과 일상을 함께한다"고 적었으면 그것이
    angle 이고, 장면은 그 흐름을 따라간다.
  · 사장님이 이야기를 안 적었으면 소재에서 하나를 세운다 — 나열이 아니라 **흐름**이어야 한다.

★★ **그 다음 이 영상의 중심을 정한다.** 넷 중 하나다 — focus 칸에 그 이름을 적는다:
- product — 제품이 주인공이다. 끝까지 **같은 제품**으로 보여야 한다
- person — 사람이 주인공이다. 끝까지 **같은 사람**으로 보여야 한다
- info — 전할 내용이 주인공이다. 지켜야 할 얼굴도 물건도 없다
- place — 공간이 주인공이다(매장·카페·여행지). 끝까지 **같은 곳**으로 보여야 한다

${draws ? AVATAR_BLOCK : ""}★ **음악도 정한다**(music) — 이 영상 전체에 깔릴 곡을 악기·템포·분위기로 영어 한 줄.
  e.g. "slow piano, sparse and calm" · "warm lo-fi beat, steady and light"
  · 영상 하나에 **하나**다. 장면마다 다른 음악을 적으면 컷 경계에서 곡이 바뀐다.
  · **가사·목소리가 있는 음악을 적지 마라** — 낭독과 겹쳐 둘 다 안 들린다.
  · 정적이 연출인 경우에는 빈 문자열로 둔다.

★ **색 처리도 정한다**(tone) — 화면 전체의 색감을 영어 한 줄. e.g. "warm film grain,
  muted shadows". 이 값은 처음부터 끝까지 같게 유지되어 컷이 바뀌어도 색이 안 튄다.

★ **제품 외형을 따로 적는다**(look) — 중심이 물건일 때, 색·부위·소재와 **크기·비례**
  (다른 사물에 견주어 얼마나 큰지)를 영어 한 줄로. e.g. "pink plush bunny keyring,
  palm-sized, white jersey and navy skirt". 크기를 안 적으면 장면마다 다른 크기로 그려진다.
  중심이 물건이 아니면 빈 문자열이다.

★ **무대를 정한다**(environment) — 이 영상 전체의 장소·시간대·조명을 영어 한 줄로.
  e.g. "a sunlit minimal cafe, late afternoon, warm window light"
  · 영상 하나에 **하나**다. 장면마다 다른 곳을 적으면 15초 안에 여러 곳을 점프해 이질적이다.
  · ★★ **사장님이 장소를 적으셨으면 그곳이다.** "집에서", "매장에서", "야구장에서"라고
    적혀 있으면 그대로 쓴다. **광고 관습으로 스튜디오화하지 마라** — "clean pale counter
    like a studio backdrop" 같은 말을 덧붙이면 사장님이 말한 집이 촬영장이 된다.
    (실측 2026-08-19: 소재가 "퇴근하고 집에서 조리해 먹는"인데 무대에 스튜디오가 섞였다.
     "제품이 주인공"이라는 말이 세 겹으로 쌓여 제품 촬영 관습을 끌어온 것이다.)
  · ★ **제품의 성격과 어울려야 한다.** 야구단 굿즈를 미니멀 화이트 갤러리에 두면 물건과
    자리가 다른 이야기를 한다 — 옷차림과 같은 규칙이다.
  · 꼭 옮겨야 한다면 옮겨도 되지만, 그때는 **한 곳에서 다른 곳으로 가는 것이 화면에
    보이게** 만든다. 없는 이동을 말로 때우지 마라.

★ **장면 수는 적을수록 좋다.** 15초면 **둘이나 셋**이고, 넷을 넘기지 마라.
  · 장면이 짧을수록 **잇는 자리가 늘어난다.** 이 영상은 한 번에 통째로 만들어지므로
    이음은 모델이 알아서 만드는데, 장면이 잘게 쪼개져 있으면 그 사이를 메우느라
    화면이 자꾸 끊긴다.
  · 실측(2026-08-20): 15초에 장면 넷을 두었더니 같은 음식을 **팬 위 / 그릇 안**으로
    연속 두 컷 보여 주었고, 사장님이 그 전환을 어색하다고 했다.
  · 장면 하나가 5초를 넘어도 괜찮다 — 한 장면 안에서 카메라가 움직이면 된다.

★ **사람이 나오면 그 사람이 어떻게 생겼는지 적는다**(cast) — 영어 한 줄.
  · ★★ **이 칸이 없으면 옷차림 칸이 사람까지 떠맡는다.** 실측(2026-08-21, 3/3 재현):
    등장인물이 둘인 소재에서 wardrobe 가 "the climber…; the instructor…" 처럼 두 사람을
    한 칸에 우겨 넣었고, 그 값이 굽기의 "the person wears ___" 틀에 들어가 **말이 안 되는
    영어**로 fal 에 나갔다. 사람을 적는 자리가 따로 있어야 옷 칸이 제 몫만 한다.
  · 적을 것 **다섯**: 나이대 · 성별 · 머리(길이·색·묶었는지) · 체형 · 인상.
    옷은 여기 안 적는다(wardrobe 가 맡는다).
    ✗ "a young woman, friendly look" (다섯 중 셋이 비어 순간마다 다른 얼굴이 된다)
  · 영상 하나에 **하나**다. 사람이 둘 이상 나와도 **주인공 한 사람만** 적는다.
  · ⚠️ 사장님이 **사진을 올렸으면 얼굴을 글로 다시 적지 마라** — 사진이 정한다(look 과 같은
    규칙). 그때는 "the person in the reference photo" 라고 가리키기만 한다.
  · 사람이 안 나오는 영상이면 빈 문자열이다.

★ **사람이 나오면 옷차림도 정한다**(wardrobe) — 영어 한 줄. **옷만 적는다** — 나이·머리·
  체형은 cast 가 맡는다(두 칸이 같은 것을 말하면 갈린다). ★ **제품의 성격과 어울려야
  한다.** 이것이 톤이 깨지는 자리다: 야구단 굿즈 광고인데 모델이 정장 코트를 입고 나오면
  제품과 사람이 다른 이야기를 한다. 제품이 캐주얼하면 사람도 캐주얼하게, 단정하면 단정하게.
  · ★ **사장님이 적으셨으면 그것이다** — "정장 차림으로", "운동복으로"처럼 적혀 있으면
    그대로 쓴다. 무대와 같은 규칙이다.
  · ★★ **색까지 적는다** — 색·소재를 안 적으면 그림마다 모델이 색을 새로 고른다.
    ✓ "charcoal wool blazer over a white cotton shirt, sleeves rolled, hair tied back"
    ✗ "a soft knit top, relaxed look" (같은 옷이 크림·회색으로 갈린다)
    얼굴은 사진으로 고정되는데 옷은 글이라, 여기만 흐리면 인물이 반쯤만 고정된다.
    ⚠️ **예시를 베끼지 마라 — 이 옷을 쓰라는 뜻이 아니다.** 소재에 맞는 옷을 고르고,
       그것을 이만큼 **구체적으로** 적으라는 뜻이다.
  · 영상 하나에 **하나**다 — 장면마다 다르게 적으면 인물이 중간에 옷을 갈아입는다.
  · ★ 다만 **옷이 바뀌는 연출**이라면 무엇에서 무엇으로 바뀌는지 적어라 — 막는 것은
    **없는 것을 지어내는 것**이지 이야기가 아니다(look 과 같은 규칙이다).
  · 사람이 안 나오는 영상이면 빈 문자열이다.

★ **목소리도 함께 정한다**(voice). 나레이션을 누가 어떤 톤으로 읽는가 — 성별·나이대·
음색·속도·거리감을 **영어 한 줄**로 적는다. 영상 모델이 읽는 글이라 한국어를 쓰지 않는다.
  ✓ "a warm, unhurried woman in her late twenties, soft and close-mic, slight smile in the tone"
  ✗ "따뜻한 목소리" · "narration" (무엇을 하라는 것인지 모델이 모른다)
한 영상에 화자는 **하나**다. 장면마다 다른 목소리를 지정하지 마라 — 사람이 바뀐다.

정하고 나면 **모든 장면이 그 중심을 섬기게** 짠다. 중심이 person 인데 제품 클로즈업으로
장면을 채우거나, product 인데 사람 표정만 따라가면 안 된다. 사장님 설명에 제품과 사람이
함께 나와도 **주인공은 하나다** — 무엇이 없으면 이 영상이 성립하지 않는지로 고른다.

컷 칸(camera·lighting·action·sound)은 **사장님이 화면에서 읽고 고치는 값**이다 —
채울 수 있으면 채우되, 지시문(text) 에서 그것을 장면마다 되풀이하지 마라.

지켜야 할 것:
${draws ? SHOWS_RULES : ""}- 전체 길이는 정확히 주어진 초 수다. shots[].seconds 의 합이 그 길이와 같아야 한다
  (그 값은 우리가 자막·그림에 쓰는 것이다 — **지시문(text) 에는 초를 적지 마라**)
- 화면 비율이 세로(예: 9:16)면 세로 구도로 짠다. 가로로 찍은 그림을 세로에 밀어넣지 마라 —
  그러면 인물·제품이 프레임 밖으로 잘린다
- 나레이션은 주어진 언어로 쓴다. 대사는 짧게 — 전체 길이에 맞게 문장 수를 조절한다
- ★★ **읽기 어려운 말은 읽는 표기를 따로 적는다**(say_as). line 은 **자막에 그대로 박히는
  글자**이고, say_as 는 모델이 **소리 내어 읽을 표기**다.
  · **필요할 때만 적는다** — 없으면 빈 문자열이고 모델은 line 을 읽는다. 늘 적으면
    자막과 갈릴 위험만 는다.
  · 필요한 자리: 영어 낱말(철자로 읽어 버린다 — "Giants"가 "지에이턴스"가 됐다) ·
    붙여 쓴 고유명사(뭉개진다 — "에스더버니"가 "에스터버리"가 됐다).
  · 고칠 때는 **한글로 풀어 쓰거나 띄어 쓴다**. 뜻이 바뀌면 안 된다.
    ✓ line "Giants 에디션" · say_as "자이언츠 에디션"
    ✓ line "에스더버니 키링" · say_as "에스더 버니 키링"
- ★ **대사가 있는 장면에는 누가 말하는지 적는다**(speaker). 화면에 보이는 사람이면 그 사람을
  적고(예: "40대 남성 제빵사"), 화면 밖 목소리면 **"내레이션"** 이라고 적는다 — 그 글자가
  그대로 판정에 쓰인다. 대사가 없으면 빈 문자열이다
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
  "text": "모델에 넘길 지시문 전체 (영어로 쓴다). **하나로 이어지는 흐름**으로 — 장면 번호도 초도 적지 않는다. 각 장면의 대사는 그 자리가 흐르는 대로 따옴표로 원문 그대로 넣는다",
  "angle": "무슨 이야기를 하는가 — 무엇을 중심에 두고 어떤 흐름으로 가는가 (한국어 한두 줄)",
  "focus": "이 영상의 중심 — product · person · info · place 중 하나. 이 넷 밖의 말을 쓰지 않는다",
  "look": "중심이 물건일 때 그 외형 — 색·부위·소재와 크기·비례, 영어 한 줄 (아니면 빈 문자열)",
  "environment": "이 영상 전체의 무대 한 줄 — 장소·시간대·조명, 영어. 하나만 정한다",
  "cast": "사람이 나오면 그 사람의 생김새 한 줄 — 나이대·성별·머리·체형·인상, 영어 (사람이 없으면 빈 문자열)",
  "wardrobe": "사람이 나오면 그 옷차림 한 줄 — 옷만, 제품과 어울리게, 영어 (사람이 없으면 빈 문자열)",
  "music": "영상 전체에 깔릴 음악 한 줄 — 악기·템포·분위기, 영어 (없는 편이 맞으면 빈 문자열)",
  "tone": "화면 전체의 색 처리 한 줄 — 영어 (안 정하면 빈 문자열)",
  "voice": "나레이션 목소리 — 성별·나이대·음색·속도·거리감을 영어 한 줄로",
  "shots": [{
    "beat": "이 장면이 하는 일(한국어)",
${draws ? SHOWS_FIELD : ""}    "camera": "앵글·움직임·렌즈감",
    "lighting": "광원 방향·질·색온도·대비",
    "action": "무엇이 어떻게 움직이나, 속도",
    "sound": "무엇이 들리나, 강조할 소리, 정적을 쓰는 자리",
    "line": "나레이션 대사 (없으면 빈 문자열)",
    "speaker": "이 대사를 누가 말하는가 — 화면 밖이면 \"내레이션\" (대사가 없으면 빈 문자열)",
    "say_as": "읽기 어려운 말이 있을 때 소리 내어 읽을 표기 (필요 없으면 빈 문자열. 자막은 line 을 쓴다)",
${draws ? TRANSITION_FIELD : ""}    "seconds": "이 장면의 길이(초, 숫자)"
  }],
  "endpoint": "i2v 또는 r2v (사진이 정확히 1장일 때만 의미가 있다)"
}`;
}

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
export const EDITABLE_GLOBAL_FIELDS = ["angle", "cast", "wardrobe", "environment", "look", "tone", "voice"];

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

export function buildScenarioMessages({ kind, settings, material, edits, globalEdits }) {
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
  // 그림 단계가 있는 경로인가 — systemFor 와 **같은 판정**이다(두 곳이 갈리면 지문 안에서
  // 앞뒤가 안 맞는 말을 하게 된다).
  const draws = kind !== "ad";

  const user = [
    `길이: ${settings.seconds}초`,
    `화면 비율: ${settings.aspect_ratio}`,
    // ★★ 화질(2026-08-21) — 그전에는 안 실렸다. **규칙이 아니라 재료다**: 480p 에서
    //   "실오라기가 보이는 매크로" 를 요구하면 그 자리는 뭉개진 화면이 되고, 그 요구를
    //   쓰느라 쓴 자리는 그대로 낭비다. 값만 주고 판단은 모델에 맡긴다.
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
    // ★★ 사진이 있으면 **사진이 진실**이다(2026-08-19 실측). look 이 "with a pink satin
    //   ribbon" 이라고만 하고 위치를 안 적어 모델이 리본을 고리에도 목에도 새로 달았다 —
    //   원본은 귀에 작은 리본 두 개뿐이다. 글로 또 묘사하면 글이 사진을 이긴다
    //   (CLAUDE.md 실측: 라벤더 토끼가 프롬프트의 cream-white 로 나왔다).
    // ★ 사진이 없으면 반대다 — 글이 유일한 재료라 **부위마다 위치**를 적어야 한다.
    // ★★★ **참조 사진은 지시문이 이름으로 불러야 쓰인다** — 세 모델 다 그렇다(2026-08-21).
    //   fal 스키마 원문:
    //     Seedance "Refer to them in the prompt as **@Image1, @Image2**, etc."
    //     H3       "referenced in the prompt as **Image 1, Image 2**, and so on."
    //   ⚠️ 이 줄이 H3 에만 붙어 있었다. 그래서 **Seedance 로 사진을 올려도 지시문이 그것을
    //     한 번도 안 가리켰다** — 사장님이 사진 4장으로 만든 첫 광고가 그 상태였다.
    //     표기까지 모델마다 다르므로(@ 유무·띄어쓰기) 이름은 lib/ad/models.js 의
    //     adRefLabel 하나가 만든다. 여기서 손으로 적으면 모델이 늘 때 그 자리가 낡는다.
    //   ★ 사진이 없으면 이 줄도 없다 — 가리킬 것이 없는데 규칙만 남으면 모델이 없는
    //     이름을 지어낸다.
    ...(photos.length
      ? [
          "★ 이 모델은 참조 사진을 **지시문 안에서 이름으로 가리켜야** 쓴다.",
          `  첨부한 순서대로 ${photos.map((_, i) => adRefLabel(settings?.model, i + 1)).join(" · ")} 다.`,
          `  그 사진이 쓰이는 자리에서 "${adRefLabel(settings?.model, 1)}" 이라고 **영어로 그대로** 적는다`,
          `  (예: "the product from ${adRefLabel(settings?.model, 1)} sits on the table").`,
          "  안 가리키면 사진이 통째로 무시된다.",
        ]
      : []),
    ...(photos.length
      ? [
          "★ 사진이 있으면 제품의 **생김새를 글로 다시 적지 마라.** 사진이 정한다 — 색·모양·부위를",
          "  재서술하면 그 글이 사진을 이겨 없던 것이 그려진다(리본이 귀 아닌 목에 생기는 식이다).",
          // ★ 2026-08-21 — 여기서 `shows` 를 가리키던 줄이 **광고에도 실리고 있었다.**
          //   광고 지문에는 shows 칸이 없다(systemFor 가 걷어낸다) — 없는 칸을 가리키는
          //   지시는 모델을 헷갈리게 할 뿐이다. 경로에 따라 칸 이름을 바꾼다.
          //   ⚠️ SYSTEM 만 검사하던 테스트는 이걸 못 잡았다 — 이 줄은 user 메시지다.
          `  ${draws ? "look 과 shows 에서는" : "look 에서는"} "그 제품"이라고 **가리키기만** 한다. 지켜야 할 것은 글자(lettering)뿐이다.`,
          "★ 다만 **제품이 변하는 연출**(마스코트가 키링이 되는 식)이라면 무엇에서 무엇으로",
          "  변하는지는 적어라 — 막는 것은 **없는 것을 지어내는 것**이지 이야기가 아니다.",
        ]
      : [
          "★ 사진이 없으니 **글이 유일한 재료**다. look 에 부위를 적을 때는 **어디에 있는지**를 함께",
          '  적는다 — "a pink ribbon" 이 아니라 "a pink ribbon on each ear". 위치를 빼면 모델이',
          "  아무 데나 만든다.",
        ]),
    // ★ 제품에 적힌 글자는 **철자로 준다**(2026-08-18 사장님 지적: KONKUK UNIV. → KONKUK UNVV).
    //   광고는 사진을 한 번도 읽지 않았다 — 장수만 알려 주고 바이트는 참조로만 넘겼다.
    //   그러니 모델이 작게 찍힌 글자를 화면에서 스스로 읽어야 했다. 읽는 것보다 받아쓰는
    //   것이 훨씬 정확하다. 값은 사진 판정(lib/vlm.js describePhoto)이 남겨 둔 것을 쓴다.
    //   ★ 읽은 글자가 하나도 없으면 이 줄들이 통째로 없다 — 지문이 예전과 글자 그대로다.
    ...photos
      .map((ph, i) => ({ n: i + 1, text: ph?.vision?.lettering || "" }))
      .filter((x) => x.text)
      .map((x) => `사진 ${x.n}에 적힌 글자: "${x.text}" — 지시문에 이 철자를 그대로 적는다`),
    // ★★ 색과 크기도 싣는다(2026-08-19). 광고는 글자만 실었는데, 단계별의 실측이
    //   그것으로 부족하다고 말한다: "참조 사진은 라벤더 토끼·검은 리본인데 클립에
    //   크림색 토끼·분홍 리본이 나왔다" — 사진은 제대로 읽혔는데 그 값이 지문에 안
    //   실려서, LLM 이 소재 글의 브랜드명만 보고 그 브랜드의 흔한 제품을 상상했다.
    //   크기도 같다 — 모르면 컷마다 다른 크기로 그려진다.
    // ★ 값이 없으면 그 줄이 통째로 없다 — 옛 프로젝트의 지문이 글자 그대로다.
    ...photos
      .map((ph, i) => ({ n: i + 1, text: ph?.vision?.what || "" }))
      .filter((x) => x.text)
      .map((x) => `사진 ${x.n}에 보이는 것: "${x.text}" — 색을 지어내지 말고 이대로 쓴다`),
    ...photos
      .map((ph, i) => ({ n: i + 1, text: ph?.vision?.scale || "" }))
      .filter((x) => x.text)
      .map((x) => `사진 ${x.n}의 크기: "${x.text}"`),
    // ★★ **사람 사진인지도 싣는다**(2026-08-21). lib/vlm.js 는 `person`(사람인가)과
    //   `who`(나이대·성별)를 이미 판정해 두는데, 지문에는 lettering·what·scale 셋만
    //   싣고 있었다 — **판정해 놓고 절반을 안 쓰던 자리**다.
    //   이것이 없으면 인물 사진이 그냥 "사진 N에 보이는 것"으로만 실려, 모델이 그 사람이
    //   주인공인지 배경인지 모른 채 cast 를 새로 지어낸다.
    // ★ 값이 없으면 그 줄이 통째로 없다 — 옛 프로젝트의 지문이 글자 그대로다.
    ...photos
      .map((ph, i) => ({ n: i + 1, who: ph?.vision?.person ? ph?.vision?.who || "" : "" }))
      .filter((x) => x.who)
      .map((x) => `사진 ${x.n}은 **인물 사진**이다 (${x.who}) — 이 사람이 화면에 나온다면 cast 에 얼굴을 글로 지어내지 말고 그 사진을 가리킨다`),
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
  // 전역 값 편집 — 장면보다 **먼저** 싣는다. 이 값들이 장면이 무엇을 담을지 정한다.
  const globalRows = Object.entries(globalEdits || {});
  if (globalRows.length) {
    user.push(
      "",
      "사장님이 직접 고친 값 — **이대로 쓴다**(다시 지어내지 마라):",
      ...globalRows.map(([f, v]) =>
        v ? `- ${f}: ${v}` : `- ${f}: (비웠다 — 이 영상에는 해당 없음. 빈 문자열로 둔다)`
      ),
      "",
      "고친 값에 **맞게 나머지를 다시 쓴다** — 예를 들어 인물이 바뀌었으면 그 사람이 나오는",
      "장면으로 고치고, 무대가 바뀌었으면 그곳에서 일어나는 일로 고친다.",
      "고친 값 자체는 한 글자도 바꾸지 마라."
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
      "장면 수와 각 장면의 초는 지금 그대로 유지한다."
    );
  }

  return { system: systemFor(kind), messages: [{ role: "user", content: user.join("\n") }] };
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

// 사진을 한 번 읽어 photos[].vision 에 붙인다 — **광고와 film 이 같은 함수를 쓴다**.
//
// ★★ 원래 lib/ad/pipeline.js 안에 인라인으로 있었고 film 라우트는 그 경로를 안 지나서
//   **사진을 한 번도 안 읽었다**(2026-08-19 실측). 그래서 시나리오가 제품의 글자도 색도
//   크기도 모른 채 쓰였다. 베끼면 두 벌이 되므로 여기로 뺀다.
// ★ 아직 안 본 사진만 읽는다 — 다시 쓰기를 눌러도 사진값이 다시 안 든다.
// ★ 실패는 흘려보낸다 — 사진 하나를 못 읽었다고 시나리오를 못 만들 이유가 없다.
// ★ 아무것도 못 읽었으면 **받은 project 를 그대로** 돌려준다(문서를 헛되이 안 바꾼다).
export async function readPhotoVision(project, deps = {}) {
  const photos = project?.material?.photos || [];
  if (!photos.length) return project;
  const describe = deps.describePhoto || defaultDescribePhoto;
  const readBytes = deps.readRefBytes || defaultReadRefBytes;

  const out = [];
  let readAny = false;
  for (const ph of photos) {
    const key = ph.url?.split("/").pop();
    if (ph.vision || !key) { out.push(ph); continue; }
    const bytes = await readBytes({ source: "upload", key });
    if (!bytes) { out.push(ph); continue; }
    const vision = await describe({ photoBytes: bytes, photoKey: key, projectId: project.id });
    const judged = vision?.person || vision?.what || vision?.lettering;
    if (judged) readAny = true;
    out.push(judged ? { ...ph, vision } : ph);
  }
  return readAny ? { ...project, material: { ...project.material, photos: out } } : project;
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
    // ★ 셋 다 "없으면 빈 문자열"이다 — 값이 없으면 프롬프트에 그 절이 통째로 안 붙어
    //   옛 문서가 글자 그대로 예전처럼 흐른다(각인 보호. 단계별이 세 번 쓴 규칙이다).
    music: typeof raw?.music === "string" ? raw.music.trim().slice(0, 200) : "",
    tone: typeof raw?.tone === "string" ? raw.tone.trim().slice(0, 200) : "",
    look: typeof raw?.look === "string" ? raw.look.trim().slice(0, 300) : "",
    // ★ cast — 사람의 생김새. 없으면 빈 문자열이라 굽기에서 그 절이 통째로 안 붙고,
    //   옛 문서는 예전과 글자 그대로 흐른다(다른 칸과 같은 규율).
    cast: typeof raw?.cast === "string" ? raw.cast.trim().slice(0, 300) : "",
    wardrobe: typeof raw?.wardrobe === "string" ? raw.wardrobe.trim().slice(0, 300) : "",
    environment: typeof raw?.environment === "string" ? raw.environment.trim().slice(0, 300) : "",
    angle: typeof raw?.angle === "string" ? raw.angle.trim().slice(0, 400) : "",
  };
}

export async function generateScenario({ project, edits, globalEdits, deps = {} }) {
  const call = deps.callJson || callJson;
  // ★ edits 를 project 와 함께 넘긴다. 여기서 빠뜨리면 화면·라우트·파이프라인이 전부
  // 편집분을 옳게 날라도 **프롬프트에만 안 실려** 아무 일도 안 일어난다(실제로 그랬다).
  const { system, messages } = buildScenarioMessages({ ...project, edits, globalEdits });
  // ★ 지문과 스키마가 **같은 kind 를 본다.** 갈리면 지문은 안 시키는데 스키마가 강제하는
  //   (또는 그 반대) 자리가 생긴다 — 그러면 모델이 빈 값을 지어내 채운다.
  const raw = await call({
    system, messages, stage: "광고 시나리오", projectId: project.id,
    schema: scenarioSchemaFor(project.kind),
  });
  const out = validateScenario(raw, (project.material?.photos || []).length);
  if (!out) throw new Error("시나리오를 만들지 못했어요");
  return out;
}
