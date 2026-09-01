// 영상 만들기(reel)의 시나리오 — **광고와 갈라진 사본**이다.
//
// ★★ 2026-08-28 — feat/scenario-prompt 를 머지하며 갈랐다. 그 브랜치가 광고를 전면
//   개편하면서 lib/ad/scenario.js 를 **광고 전용**으로 다시 썼고(AD_SYSTEM · photoBlocks 로
//   사진을 모델에게 직접 보여 준다), 옛 계보는 lib/film/scenario.js 로 옮겨 갔다.
//   reel 은 그 둘 중 어느 쪽도 그대로 쓸 수 없다:
//     · 광고 쪽에는 reel 이 쓰는 readPhotoVision 이 없다(캐스팅이 vision.person·what 으로 갈린다)
//     · film 쪽에는 reel 이 만든 자리 넷이 없다 — sceneCountRule · conceptLine · note ·
//       narrationRule. 게다가 systemFor() 가 인자를 안 받아 넣을 자리조차 없다.
//   ★ 그래서 **받아온 코드는 한 글자도 고치지 않고**(사장님 지시) 이 사본을 둔다.
//     그쪽이 하나를 둘로 가른 것과 같은 처방이고, 셋째를 더하는 것뿐이다.
//
// ★ 스키마도 이 파일이 들고 있다 — 그쪽 lib/ad/llm.js 의 기본값은 AD_SCENARIO_SCHEMA 라
//   (칸 셋뿐이다) reel 이 요구하는 모양과 다르다. **callJson 에 명시로 넘긴다.**
import { callJson } from "./llm.js";
import { AVATARS } from "../refs.js";
import { describePhoto as defaultDescribePhoto } from "../vlm.js";
import { readRefBytes as defaultReadRefBytes } from "../refs-io.js";
import { AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES } from "../ad/options.js";

// reel 이 요구하는 JSON 모양 — **이 파일이 들고 있다**(2026-08-28).
//
// ★★ 그전에는 lib/ad/llm.js 의 SCENARIO_SCHEMA 였다. 머지로 그 자리가 광고 전용
//   AD_SCENARIO_SCHEMA(칸 셋뿐)로 바뀌어, 안 넘기면 reel 이 요구하는 칸들이 **조용히
//   잘려 나간다**(additionalProperties:false 다). 그래서 generateScenario 가 이 값을
//   **명시로** 넘긴다.
export const REEL_SCENARIO_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          beat: { type: "string" },
          // ★ 이 칸만 영어다 — lib/film/mode.js 의 imagePlanFor 가 이미지 프롬프트의
          //   재료로 쓴다. 여기 없으면 SYSTEM 이 아무리 요구해도 모델이 낼 길이 없다
          //   (additionalProperties:false 라 모르는 칸은 잘린다). 실측 2026-08-19:
          //   저장된 프로젝트 8개 전부 shows 가 0개였고 원인이 이 누락이었다.
          shows: { type: "string" },
          // ★★ 이 장면에 보이는 사람의 **사진**을 고른다(lib/refs.js 의 AVATARS).
          //   "한국인"이라는 말만으로는 컷마다 다른 얼굴이 나오는 것을 못 막는다 —
          //   얼굴을 고정하려면 사진이 있어야 한다. 사람이 없는 장면은 빈 문자열.
          avatar_id: { type: "string" },
          // ★ 누가 말하는가 — 화면에 보이는 사람이면 그 사람, 화면 밖이면 "내레이션".
          //   그 글자가 그대로 판정에 쓰인다(단계별과 같은 규약).
          speaker: { type: "string" },
          // ★ 이 컷이 **앞 컷에서 어떻게 넘어오는가**. 장소를 옮겨도 끊기지 않게 하는 축이다
          //   (사장님 지적: "이동할 수 있긴 한데 부자연스럽다"). 첫 컷은 빈 문자열이다.
          transition: { type: "string" },
          // ★★ **읽는 표기**. line 은 자막에 박히는 글자이고 이 칸은 모델이 소리 내어
          //   읽을 표기다. 실측(2026-08-19): "Giants 에디션"이 "지에이턴스 에디전"으로,
          //   "에스더버니"가 "에스터버리"로 읽혔다. 표기를 바꾸면 발음이 바뀌는데
          //   line 을 바꾸면 자막에도 그 표기가 박힌다 — 그래서 나눈다.
          say_as: { type: "string" },
          camera: { type: "string" },
          lighting: { type: "string" },
          action: { type: "string" },
          sound: { type: "string" },
          line: { type: "string" },
          seconds: { type: "number" },
        },
        required: ["beat", "shows", "avatar_id", "speaker", "transition", "camera", "lighting", "action", "sound", "seconds"],
        additionalProperties: false,
      },
    },
    endpoint: { type: "string" },
    // ★★ 이 영상의 **중심**. 카메라·조명·음향은 장면마다 정하면서 "무엇이 주인공인가"는
    //   아무도 안 정했다 — 그래서 그림을 만들 때 무엇을 지켜야 하는지가 흔들렸다.
    //   lib/film/mode.js 의 imagePlanFor 가 이 값으로 갈라진다.
    focus: { type: "string" },
    // ★★ 나레이션 **목소리**. 환경음·효과음은 장면마다 정하면서 목소리의 성질은 아무도
    //   안 정해서, 영상 모델이 기본값으로 읽었다("AI 가 읽어주는 느낌"). 단계별은
    //   lib/cast.js 가 인물마다 이 값을 정하는데 통짜로 굽는 쪽에는 자리가 없었다.
    // ★ 화자는 하나라 최상위다 — shots 안에 두면 한 영상에서 사람이 바뀐다.
    voice: { type: "string" },
    // ★★ 아래 셋은 단계별(lib/scenario.js·lib/cuts.js)에 있고 여기 없던 것들이다
    //   (2026-08-19). 단계별이 실측으로 쌓은 축을 옮긴다.
    // music — 영상 하나에 **하나**. 장면마다 다르면 컷 경계에서 곡이 바뀐다.
    music: { type: "string" },
    // tone — 색 처리. 전 컷에 같은 글자로 실려 화면 색감이 안 흔들린다.
    tone: { type: "string" },
    // look — 제품 외형 전용 칸(색·부위·소재와 **크기·비례**). shows 에 섞여 있으면
    //   장면 서술에 묻혀 컷마다 다른 크기·색으로 그려진다.
    look: { type: "string" },
    // ★★ 인물 옷차림(2026-08-19). shows 에 옷차림이 없으면 모델이 mood 만 보고 알아서
    //   입힌다 — 야구단 굿즈 광고인데 mood=premium 이라 베이지 코트·정장이 나왔다.
    //   제품의 성격과 어울려야 톤이 안 깨진다. 영상 하나에 하나(컷마다 다르면 갈아입는다).
    wardrobe: { type: "string" },
    // ★★ 무대 — 이 영상 전체의 장소·시간대·조명. **하나만** 정한다(2026-08-19).
    //   실측: 컷마다 다른 장소를 지정해 15초 안에 스튜디오→거리→카페를 점프했다.
    environment: { type: "string" },
    // ★★ 무슨 이야기인가(2026-08-19). 그전에는 "어떻게 찍나"만 있고 서사를 적는 자리가
    //   없어서 format(hero — "등장→클로즈업→쓰는 순간→마무리")의 틀이 그대로 나왔다.
    //   단계별의 angle 과 같은 자리다.
    angle: { type: "string" },
    // ★★ 2026-08-27 — 내레이션 **한 벌**. 화면 밖 목소리를 컷에서 떼어 영상 전체 하나로
    //   올린다(설계: docs/superpowers/specs/2026-08-27-narration-as-one-voice-design.md).
    //   사장님 지시: "컷마다 음성이 끊기고 그 컷을 설명할려고 해 … 영상 전체를 설명하는거야."
    //   뿌리는 **내레이션에 립싱크가 없다**는 것이다 — 컷에 묶을 이유가 애초에 없었다.
    // ★ 여기 없으면 additionalProperties:false 가 잘라 낸다 — SYSTEM 이 아무리 요구해도
    //   모델이 낼 길이 없다(shows 가 저장된 프로젝트 8개에서 0개였던 그 함정, 2026-08-19).
    // ★ **required 에 넣지 않는다** — 광고 갈래는 이 필드를 요구받지도 읽지도 않는다.
    //   넣으면 지시문이 안 시키는 값을 모델이 억지로 지어내고, 광고 회귀 0 이 깨진다.
    narration: {
      type: "object",
      properties: {
        text: { type: "string" },
        say_as: { type: "string" },
      },
      required: ["text", "say_as"],
      additionalProperties: false,
    },
  },
  required: ["text", "shots", "focus", "voice", "music", "tone", "look", "wardrobe", "environment", "angle"],
  additionalProperties: false,
};


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
// 광고의 장면 수 규칙 — **기본값이다.** 이 문구는 한 글자도 바뀌지 않았다(2026-08-24 에
// 상수로 뺐을 뿐이다). 광고 경로는 여전히 이것을 쓴다.
//
// ★★ 왜 뺐는가: reel 은 컷마다 따로 굽고 ffmpeg 가 잇는다 — 아래 **근거가 거기서는
//   거짓이다**("이 영상은 한 번에 통째로 만들어지므로"). 그리고 reel 이 꼭 필요한 45·60초는
//   Seedance 2.0 이 통째로 못 굽는 길이인데, 이 규칙대로면 60초에 장면 넷 = 장면당 15초가
//   된다. 그래서 **부르는 쪽이 자기 규칙을 넘길 수 있게** 자리를 하나 낸다
//   (lib/reel/scenario-rules.js 의 reelSceneCountRule).
//   처방은 이 저장소가 다섯 번 쓴 그것과 같다: **선택 인자 하나 · 안 넘기면 예전과 글자 그대로.**
export const AD_SCENE_COUNT_RULE = `★ **장면 수는 적을수록 좋다.** 15초면 **둘이나 셋**이고, 넷을 넘기지 마라.
  · 장면이 짧을수록 **잇는 자리가 늘어난다.** 이 영상은 한 번에 통째로 만들어지므로
    이음은 모델이 알아서 만드는데, 장면이 잘게 쪼개져 있으면 그 사이를 메우느라
    화면이 자꾸 끊긴다.
  · 실측(2026-08-20): 15초에 장면 넷을 두었더니 같은 음식을 **팬 위 / 그릇 안**으로
    연속 두 컷 보여 주었고, 사장님이 그 전환을 어색하다고 했다.
  · 장면 하나가 5초를 넘어도 괜찮다 — 한 장면 안에서 카메라가 움직이면 된다.`;

// ★★ 2026-08-27 — `narrationRule` 이 있으면 **내레이션 한 벌** 갈래로 간다.
//   대사를 장면마다 흩는 대신 영상 전체를 설명하는 말 한 벌을 따로 낸다(설계:
//   docs/superpowers/specs/2026-08-27-narration-as-one-voice-design.md).
//   ★ 이 지시문은 **광고 갈래와 공유된다** — 줄을 안 넘기면 광고는 글자 그대로 예전이다
//     (sceneCountRule·conceptLine·note 와 같은 처방: 선택 인자 하나).
//   ★ 줄로 받는 이유: 길이 상한이 **목표 초에서 나온다**(15초 → 82자). boolean 으로는
//     그 값을 못 싣고, 여기서 계산하면 계수가 두 곳에 살게 된다(lib/reel/narration.js).
const buildSystem = (sceneCountRule, narrationRule) => `너는 광고 CF 를 연출하는 감독이다.
사장님이 준 설명과 옵션을 읽고, 영상 생성 모델에 그대로 넘길 **하나의 지시문**을 쓴다.

★★ 이 영상은 **한 번에 통째로** 만들어진다 — 컷을 이어 붙이는 것이 아니다.
★★★ **지시문(text)은 "이것이 어떻게 영상이 되는가"를 쓰는 자리다.** 그림은 따로
(shows) 있으니, 여기서는 **무엇이 어떻게 움직이고 변하는가**를 쓴다 — 먹으면 숟가락이
비고, 따르면 잔이 차고, 뜯으면 봉지가 열린다. 시작과 끝이 같은 그림이면 그것은 정지
사진이지 영상이 아니다.
★★ **형식은 네가 정한다.** 장면을 번호로 나눠도 되고 한 흐름으로 이어도 된다. 초를
적어도 되고 안 적어도 된다. 카메라·렌즈·조명·전환을 적어도 되고 영상 모델에게 맡겨도
된다. 이 소재와 이야기에 맞는 쪽을 **네가 골라라**.

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

★ **사람이 보이는 장면에는 사진을 고른다**(avatar_id). 준비된 인물 사진은 아래가 전부다:
${AVATARS.map((a) => `- ${a.id} : ${a.traits}`).join("\n")}
  · **같은 사람이 여러 장면에 나오면 같은 id 를 적는다** — 그래야 컷마다 얼굴이 안 바뀐다.
  · 사람이 안 보이는 장면(제품만·풍경만)은 **빈 문자열**이다.
  · ★ **id 를 적었으면 그 장면의 shows 는 얼굴이 보이게 쓴다.** 손동작만 적으면 모델이
    손만 그려서 그 인물 사진이 쓰이지 않는다(실측 2026-08-19: "clipping the keyring onto
    the handle" → 손만 나왔다). 얼굴을 안 보일 셈이면 id 를 비운다.
  · 맞는 사람이 목록에 없으면 억지로 고르지 말고 **빈 문자열로 비운다** — 엉뚱한 얼굴이
    실리는 것보다 낫다.
  · ★★★ **사람이 제품을 쓰는 장면을 써라 — 다만 얼굴이 화면을 채우게는 쓰지 마라.**
    ★ **먼저 읽을 것은 되는 쪽이다.** 아래는 전부 권장이고, 광고에서 가장 많이 쓰는 그림이다:
      - **손**이 제품을 집고 뜯고 따르고 건넨다
      - **상반신(가슴 위)**으로 먹고 마시고 쓴다 — 턱 아래에서 잘려도 좋다
      - **옆모습 · 뒷모습 · 어깨너머**, 시선은 제품이나 하고 있는 일에 둔다
      - 여럿이 함께 쓰는 장면 — 한 사람 얼굴이 커지지 않는다
    ★ **막는 것은 딱 둘이다**: 얼굴만 꽉 찬 화면, 그리고 카메라를 정면으로 응시하는 것.
      "facing camera" · "looking at camera" · "close-up of her face" · "smiling at the
      camera" 같은 말을 쓰지 않는다.
    ★★ **사람을 빼지 마라.** 참조 이미지에 알아볼 수 있는 얼굴이 크게 들어가면 만드는
      쪽이 초상으로 보고 거절하는데(실측 2026-08-31: "a cheerful young woman facing
      camera, eyes bright, mid-bite smile" → 422), 그것이 무서워 **사람을 통째로 빼면
      광고가 죽는다** — 같은 날 다른 실측(57db7ad6)에서는 다섯 장면이 전부 제품컷만
      되어 사람이 하나도 없었다. 사람은 나오되 **제품이 주인공**이면 그대로 통과한다.

★ **음악도 정한다**(music) — 이 영상 전체에 깔릴 곡을 악기·템포·분위기로 영어 한 줄.
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

${sceneCountRule}

★ **사람이 나오면 옷차림도 정한다**(wardrobe) — 영어 한 줄. ★ **제품의 성격과 어울려야
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
- ★★ **shows 는 정지 화면이다 — 움직임을 적지 마라.** shows 로 만드는 것은 그림 한 장이라,
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
- 전체 길이는 정확히 주어진 초 수다. shots[].seconds 의 합이 그 길이와 같아야 한다
  (그 값은 우리가 자막·그림에 쓰는 것이다)
- 화면 비율이 세로(예: 9:16)면 세로 구도로 짠다. 가로로 찍은 그림을 세로에 밀어넣지 마라 —
  그러면 인물·제품이 프레임 밖으로 잘린다
- 나레이션은 주어진 언어로 쓴다. 대사는 짧게 — 전체 길이에 맞게 문장 수를 조절한다
- ★★ **읽기 어려운 말은 읽는 표기를 따로 적는다**(say_as). line 은 **자막에 그대로 박히는
  글자**이고, say_as 는 모델이 **소리 내어 읽을 표기**다.
  · **필요할 때만 적는다** — 없으면 빈 문자열이고 모델은 line 을 읽는다. 늘 적으면
    자막과 갈릴 위험만 는다.
  · 필요한 자리: 영어 낱말(철자로 읽어 버린다 — "Giants"가 "지에이턴스"가 됐다) ·
    붙여 쓴 고유명사(뭉개진다 — "에스더버니"가 "에스터버리"가 됐다).
  · ★★ **낭독 언어 그대로 쓴다** — 그 언어를 쓰는 사람이 자연스럽게 소리 내는 표기다.
    한국어면 한국어로, 일본어면 일본어로, 영어면 영어로 다시 적는다. 뜻이 바뀌면 안 된다.
    ✓ 한국어: line "Giants 에디션" · say_as "자이언츠 에디션"
    ✓ 한국어: line "에스더버니 키링" · say_as "에스더 버니 키링"
- ★ **대사가 있는 장면에는 누가 말하는지 적는다**(speaker). 화면에 보이는 사람이면 그 사람을
  적고(예: "40대 남성 제빵사"), 화면 밖 목소리면 **"내레이션"** 이라고 적는다 — 그 글자가
  그대로 판정에 쓰인다. 대사가 없으면 빈 문자열이다
${narrationRule ? `- ★★ **화면 밖 목소리는 \`narration\` 에 한 벌로 쓴다 — 장면마다 나누지 마라.**
  그것은 영상 전체를 설명하는 **하나의 이어지는 말**이다. 한 사람이 처음부터 끝까지
  이어서 말하는 한 문단으로 쓴다. **장면을 하나씩 짚지 마라** — "이건 키링이고, 이건
  콜라보고, 이건 가방에 달고"는 한 사람의 말이 아니라 **캡션 여럿**이다.
  · ${narrationRule}
  · 화면 밖 목소리에는 **립싱크가 없다** — 컷에 묶을 이유가 애초에 없다. 컷은 그림의
    단위이지 말의 단위가 아니다
- ★ **장면 서술(shows)과 지시문(text)에 대사를 넣지 마라.** 따옴표 대사를 장면마다 흩으면
  모델이 **장면 하나 = 문장 하나**로 읽고 장면 경계에서 말이 끊긴다(그 자리에서 공백이
  생긴다). 지시문은 **무엇이 보이고 무슨 일이 일어나는가**만 쓴다 — 말은 우리가 따로 싣는다
- ★ **화면 속 인물이 카메라를 보고 말하는 대사**(립싱크가 붙는 말)는 예외다. 그 말은
  그 장면의 \`line\` 에 그대로 두고 \`speaker\` 에 그 사람을 적는다 — 입이 움직여야 하므로
  그 컷에 묶이는 것이 맞다` : `- ★ **대사는 지시문(text) 안에도 그대로 적는다.** 각 장면 자리에서 지문이 흐르는 대로
  the narrator says "오늘도 참았죠" 처럼 **따옴표로 원문 그대로** 넣는다. 번역하거나
  요약하지 말고, shots[].line 과 **글자 그대로 같아야 한다**. "warm narration" 같은
  분위기만 적으면 모델은 무슨 말을 할지 스스로 지어낸다 — 우리가 나중에 붙이는 자막과
  말이 어긋나는 원인이 그것이다. 대사가 없는 장면(line 이 빈 문자열)은 아무것도 안 적는다`}
- ★ 위의 대사는 **말(소리)이지 화면 글자가 아니다.** 대사를 자막·타이틀·캡션으로
  화면에 띄우라고 요구하지 마라 — 들리기만 하면 된다
- 화면에 **글자를 넣으라고 요구하지 마라.** 모델은 글자를 "글자처럼 생긴 무늬"로 그린다.
  자막·로고·카피·엔딩 카드는 우리가 나중에 따로 붙인다 — 시나리오는 글자 없이 성립해야 한다
- 모션그래픽(단면도·인포그래픽)·화면 분할·자막 애니메이션처럼 이 모델이 만들 수 없는 것을
  요구하지 마라
- 사진이 주어졌으면 그 안의 제품·인물·로고를 지키라고 명시한다
- 정보가 모자라도 되묻지 말고, 합리적으로 채워 완성된 시나리오 하나를 낸다

JSON 으로만 답한다:
{
  "text": "모델에 넘길 지시문 전체 (영어로 쓴다). **어떻게 영상이 되는가**를 쓴다 — 무엇이 어떻게 움직이고 변하는가. 형식(장면 나눔·초·카메라)은 네가 고른다. ${narrationRule ? "**화면 밖 목소리의 대사를 여기 적지 마라** — 그것은 narration 한 벌이다" : "각 장면의 대사는 그 자리가 흐르는 대로 따옴표로 원문 그대로 넣는다"}",${narrationRule ? `
  "narration": { "text": "영상 전체에 흐르는 화면 밖 목소리 **한 벌** — 사장님 나라 말로, 한 사람이 이어서 말하는 한 문단", "say_as": "읽기 어려운 말의 발음 표기 — **낭독 언어 그대로**(위 say_as 규칙과 같다). 영어 낱말·붙여 쓴 고유명사가 있으면 반드시 적는다 (없으면 빈 문자열)" },` : ""}
  "angle": "무슨 이야기를 하는가 — 무엇을 중심에 두고 어떤 흐름으로 가는가 (한국어 한두 줄)",
  "focus": "이 영상의 중심 — product · person · info · place 중 하나. 이 넷 밖의 말을 쓰지 않는다",
  "look": "중심이 물건일 때 그 외형 — 색·부위·소재와 크기·비례, 영어 한 줄 (아니면 빈 문자열)",
  "environment": "이 영상 전체의 무대 한 줄 — 장소·시간대·조명, 영어. 하나만 정한다",
  "wardrobe": "사람이 나오면 그 옷차림 한 줄 — 제품과 어울리게, 영어 (사람이 없으면 빈 문자열)",
  "music": "영상 전체에 깔릴 음악 한 줄 — 악기·템포·분위기, 영어 (없는 편이 맞으면 빈 문자열)",
  "tone": "화면 전체의 색 처리 한 줄 — 영어 (안 정하면 빈 문자열)",
  "voice": "나레이션 목소리 — 성별·나이대·음색·속도·거리감을 영어 한 줄로",
  "shots": [{
    "beat": "이 장면이 하는 일(한국어)",
    "shows": "이 장면의 **정지 화면** — 카메라를 그 순간 멈춘 사진 한 장. 영어 한 줄, 한국어를 쓰지 않는다",
  "avatar_id": "이 장면에 사람이 보이면 준비된 사진 중 하나의 id, 없으면 빈 문자열",
    "camera": "앵글·움직임·렌즈감 — **영어**로 쓴다(이 칸은 그림 지문에 그대로 실린다)",
    "lighting": "광원 방향·질·색온도·대비 — **영어**",
    "action": "무엇이 어떻게 움직이나, 속도 — **영어**",
    "sound": "무엇이 들리나, 강조할 소리, 정적을 쓰는 자리 — **영어**",
    "line": "나레이션 대사 (없으면 빈 문자열)",
    "speaker": "이 대사를 누가 말하는가 — 화면 밖이면 \"내레이션\" (대사가 없으면 빈 문자열)",
    "say_as": "읽기 어려운 말이 있을 때 소리 내어 읽을 표기 (필요 없으면 빈 문자열. 자막은 line 을 쓴다)",
    "transition": "비워 둔다 — 이음은 모델이 알아서 만든다 (칸은 옛 문서 때문에 남아 있다)",
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

export function buildScenarioMessages({ settings, material, edits }, opts = {}) {
  // ★★ 구성 줄은 **부르는 쪽이 정할 수 있다**(2026-08-25 · reel 의 컨셉).
  //   reel 은 광고 포맷이 아니라 큰 범주를 고른다(lib/reel/concepts.js) — 그 줄을 여기로
  //   넘긴다. `null` 을 넘기면 그 줄이 **아예 안 실린다**([알아서]가 그 자리다).
  //   ★ 안 넘기면(키 자체가 없으면) 광고는 **글자 그대로 예전**이다 — 이 저장소가
  //     sceneCountRule·note 에 쓴 것과 같은 처방이다(선택 인자 하나).
  //   ★ 넘긴 경우에는 AD_FORMATS 조회 자체를 건너뛴다. 안 그러면 reel 이 안 쓰는 값
  //     (settings.format)이 모르는 값일 때 need() 가 던져, 쓰지도 않는 필드 때문에
  //     시나리오가 통째로 죽는다.
  const ownConcept = Object.prototype.hasOwnProperty.call(opts, "conceptLine");
  const formatLine = ownConcept
    ? opts.conceptLine
    : (() => {
      const fmt = need(AD_FORMATS.find((f) => f.id === settings.format), "광고 포맷", settings.format);
      return `광고 포맷: ${fmt.label} — ${fmt.beat}`;
    })();
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
    // ★ null 이면 자리 자체가 없다 — 아래에서 걸러 낸다(빈 줄을 남기면 모델이 지어내 채운다).
    formatLine,
    `분위기: ${mood.label} — ${mood.line}`,
    `화풍: ${styleLine}`,
    `첨부 사진: ${photos.length}장`,
    // ★★ 사진이 있으면 **사진이 진실**이다(2026-08-19 실측). look 이 "with a pink satin
    //   ribbon" 이라고만 하고 위치를 안 적어 모델이 리본을 고리에도 목에도 새로 달았다 —
    //   원본은 귀에 작은 리본 두 개뿐이다. 글로 또 묘사하면 글이 사진을 이긴다
    //   (CLAUDE.md 실측: 라벤더 토끼가 프롬프트의 cream-white 로 나왔다).
    // ★ 사진이 없으면 반대다 — 글이 유일한 재료라 **부위마다 위치**를 적어야 한다.
    ...(photos.length
      ? [
          "★ 사진이 있으면 제품의 **생김새를 글로 다시 적지 마라.** 사진이 정한다 — 색·모양·부위를",
          "  재서술하면 그 글이 사진을 이겨 없던 것이 그려진다(리본이 귀 아닌 목에 생기는 식이다).",
          '  look 과 shows 에서는 "그 제품"이라고 **가리키기만** 한다. 지켜야 할 것은 글자(lettering)뿐이다.',
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
  // ★★ 사장님이 **말로** 고쳐 달라고 적은 것(2026-08-25). edits 와 다른 축이다 —
  //   edits 는 칸을 직접 고친 것이고, 이것은 "이 문구를 이렇게 바꿔 줘" 다.
  //   둘은 함께 올 수 있고, 둘 다 없으면 이 블록이 통째로 없어 지문이 예전과 글자 그대로다.
  //
  // ★ wiki 원칙(2026-08-19 사장님): "최대한 통제를 자제한다 — 시나리오를 벗어나거나,
  //   제품을 변형시키거나, 인물 일관성이 깨지는 것만 빼고." 그래서 요청을 쟘게
  //   규정하지 않고 **그대로 전한다.** 못 박는 것은 둘뿐이다: 언어와 범위.
  // ★★ 언어를 못 박는 이유: 요청이 **한국어로** 들어오므로 모델이 덤다어 지문까지
  //   한국어로 쓸 위험이 생긴다. 영상 모델은 영어 지문을 읽고, 대사만 그 나라 말이다.
  const note = typeof opts.note === "string" ? opts.note.trim() : "";
  if (note) {
    user.push(
      "",
      "사장님이 고쳐 달라고 한 것 — **이대로 반영한다**:",
      note.slice(0, 1000),
      "",
      "★ 요청한 그 자리만 고친다. 나머지는 지금 시나리오 그대로 둔다 — 통째로 다시 쓰면",
      "  사장님이 만족했던 장면까지 사라진다.",
      "★ 요청은 한국어로 적혀 있지만 **지시문은 지금처럼 영어로** 쓴다. 한국어로 쓰는 것은",
      "  대사(line)뿐이다 — 그것은 영상 모델이 소리로 읽는 말이라 사장님 나라 말 그대로다.",
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

  // ★ sceneCountRule 을 안 넘기면 광고 문구다 — 옛 호출부의 system 이 한 글자도 안 달라진다.
  const system = buildSystem(opts.sceneCountRule || AD_SCENE_COUNT_RULE, typeof opts.narrationRule === "string" ? opts.narrationRule.trim() : "");
  // ★ null 을 걸러 낸다 — 구성 줄이 없는 경우([알아서])가 그 자리다. 안 거르면 join 이
  //   빈 줄을 남기고, 이 저장소는 **빈 줄을 남기면 모델이 그 자리를 지어내 채우는 것**을
  //   이미 겪었다(lib/reel/clip-prompt.js 의 line() 이 같은 이유로 있다).
  return {
    system,
    messages: [{ role: "user", content: user.filter((l) => l !== null && l !== undefined).join("\n") }],
  };
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
    wardrobe: typeof raw?.wardrobe === "string" ? raw.wardrobe.trim().slice(0, 300) : "",
    environment: typeof raw?.environment === "string" ? raw.environment.trim().slice(0, 300) : "",
    angle: typeof raw?.angle === "string" ? raw.angle.trim().slice(0, 400) : "",
    // ★★ 내레이션 한 벌 — **없으면 키 자체가 없다**(2026-08-27). 위의 값들처럼 빈 문자열로
    //   두지 않는 이유: 이 필드의 유무가 **갈래를 가른다**(lib/reel/narration.js 의
    //   reelNarration 이 null 을 주면 옛 길로 간다). 빈 값을 만들어 두면 옛 문서가 새 길로
    //   들어가 `Says exactly: ""` 를 요구하게 된다.
    ...narrationOf(raw),
  };
}

// 한 벌을 살려서 저장한다 — 이 자리를 안 지나면 모르는 필드라 **조용히 사라진다.**
//
// ★ 글이 비었거나 문자열이 아니면 **아무 키도 안 만든다**(위 주석의 갈래 규율).
function narrationOf(raw) {
  const n = raw?.narration;
  const text = typeof n?.text === "string" ? n.text.trim() : "";
  if (!text) return {};
  const sayAs = typeof n?.say_as === "string" ? n.say_as.trim() : "";
  // 상한은 넉넉히 둔다 — 60초 × 5.5자 = 330자가 실제 최대치다. 길이 판정은 여기가 아니라
  // 게이트(lib/scenario-rules.js)가 사장님 말로 한다.
  return { narration: { text: text.slice(0, 1000), say_as: sayAs.slice(0, 1000) } };
}


// SHOTFORM_FAKE=all 일 때 돌려주는 응답 — **reel 이 실제로 쓸 수 있는 모양**이다.
//
// ★★ 2026-08-28 머지 — 그쪽 lib/ad/llm.js 의 가짜 응답은 광고 새 모양(칸 셋: text·angle·
//   shots{beat,line,seconds})이라 reel 의 buildReelCuts 가 읽을 칸(shows·camera·lighting·
//   action·sound)이 통째로 없다. 그대로 받으면 0원 관통에서 빈 컷이 나온다.
// ★ 이 값은 머지 전 lib/ad/llm.js 에 있던 것을 **글자 그대로** 옮긴 것이다 — reel 의
//   가짜 관통이 예전과 같게 돈다(회귀 0).
function fakeReelResponse() {
  return {
    text:
      "가짜 시나리오입니다. 배선을 확인하려고 만든 지시문이라 실제 내용이 아닙니다. " +
      "제품이 테이블 위에 놓이고 천천히 조명이 켜집니다.",
    shots: [
      {
        beat: "제품이 등장한다", camera: "슬로우 푸시인, 아이레벨, 얕은 심도",
        lighting: "탑 라이트 하나, 소프트, 어두운 배경에 제품만 살린다",
        action: "제품이 테이블 위에 놓인다, 실속도", sound: "테이블에 닿는 소리, 낮은 앰비언트",
        line: "가짜 나레이션입니다", seconds: 8,
      },
      {
        beat: "마무리", camera: "정면 고정",
        lighting: "역광이 서서히 밝아진다",
        action: "화면이 부드럽게 밝아진다, 슬로모션", sound: "정적 뒤 낮은 드럼 한 번",
        line: "", seconds: 7,
      },
    ],
    endpoint: "r2v",
  };
}

export async function generateScenario({ project, edits, sceneCountRule, note, deps = {}, ...rest }) {
  const call = deps.callJson || callJson;
  // ★ edits 를 project 와 함께 넘긴다. 여기서 빠뜨리면 화면·라우트·파이프라인이 전부
  // 편집분을 옳게 날라도 **프롬프트에만 안 실려** 아무 일도 안 일어난다(실제로 그랬다).
  // ★ sceneCountRule 은 **부르는 쪽이 정한다**(reel 은 자기 규칙, 광고는 안 넘긴다).
  //   안 넘기면 buildScenarioMessages 가 AD_SCENE_COUNT_RULE 로 떨어져 예전과 글자 그대로다.
  // ★ conceptLine 은 **키가 있느냐**로 갈린다(null 이 "줄 없음"이라는 뜻이라, 값으로는
  //   못 가른다). 그래서 rest 를 그대로 펴 넣는다 — 안 넘긴 광고 경로에는 키가 없다.
  const { system, messages } = buildScenarioMessages({ ...project, edits }, { sceneCountRule, note, ...rest });
  const raw = await call({ system, messages, stage: "광고 시나리오", projectId: project.id, schema: REEL_SCENARIO_SCHEMA, fake: fakeReelResponse });
  const out = validateScenario(raw, (project.material?.photos || []).length);
  if (!out) throw new Error("시나리오를 만들지 못했어요");
  return out;
}
