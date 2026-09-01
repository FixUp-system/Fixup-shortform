// 클립 길이 눈금 — 화면(클라이언트)과 i2v(서버)가 함께 본다.
//
// lib/i2v.js 에 두면 안 된다. 그 모듈은 costs.js 를 거쳐 fs 를 끌고 오는데,
// "use client" 화면이 import 하면 번들에 fs 가 들어가 빌드가 깨진다.
// ★ import 는 lib/tiers.js 하나뿐이고, 그 파일은 lib/ad/models.js(순수 데이터) 하나만
//   끌어온다 — 사슬 끝에 fs 가 없다. 등급이 모델 목록을 가르므로 필요한 자리다.
import { TIERS, DEFAULT_TIER } from "./tiers.js";
// (lib/voices.js 가 같은 이유로 분리돼 있다.)
//
// 클립 모델마다 받는 길이가 다르다. PRICE_TABLE 과 같은 방식으로 prefix 로 고른다.
//
// 왜 표로 옮겼는가: 모델은 바뀌는데 눈금은 코드에 박혀 있었다. 모델을 바꾸는 순간
// 코드가 모르는 눈금으로 요청이 갔다. 주석으로 경고해 두었지만 적어 둔 것은 판정이 아니다.
//
// 눈금은 두 종류다:
//   steps 열거 — LTX 계열. 임의의 초를 보내면 422 로 거절한다:
//     Input should be 6, 8, 10, 12, 14, 16, 18 or 20
//   min~max 범위 — Kling v3. 정수 초를 그 사이에서 자유롭게 받는다.
//     낭독을 그대로 살 수 있어 올림 손실이 사라진다(07-30 실측: 32초 낭독에 40초를 샀다)
//
// ⚠️ prefix 순서가 곧 로직이다 — 더 구체적인 것이 위에 온다. PRICE_TABLE 과 같은 함정이다.
//
// ⚠️⚠️ **해상도 목록에는 짝이 있다 — `lib/ad/models.js` 의 `AD_MODELS`.**
// 광고 축이 **같은 fal 엔드포인트**(`bytedance/seedance-2.0/image-to-video`)에 대해 이미
// `resolutions: ["480p","720p","1080p"]` 와 `DEFAULT_AD_RESOLUTION = "720p"` 를 들고 있다.
// 두 벌인 것을 알고 둔다 — 광고 쪽은 필드 구조가 다르고(seconds·perSecUsd·t2v/r2v 축을 함께
// 든다) 스펙이 광고 경로를 범위 밖으로 못 박았다. **fal 이 해상도를 열거나 닫으면 양쪽을
// 함께 고쳐야 한다.** 한쪽만 고치면 같은 모델이 화면마다 다른 선택지를 보인다.
export const CLIP_PROFILES = [
  // ★★★ MiniMax H3 (2026-08-31 — 사장님 지시로 단계별에도 배선했다. 원클릭과 같은 모델·
  //   같은 이름·같은 화질이다).
  //
  // ★★ **소리를 낸다 — 사장님 실측 확인(2026-08-31).**
  //   fal 스키마에는 `generate_audio` 같은 토글이 없고 출력 필드도 `video` 하나뿐이라
  //   처음에 "소리가 없다"고 읽었는데 **틀렸다**: 토글이 없다는 것은 **항상 켜져 있다**는
  //   뜻일 수 있고, mp4 자체가 오디오 트랙을 담는다. 스키마는 그것을 말해 주지 않는다.
  //   → reel 이 서 있는 전제(speaks:true)를 만족한다.
  // ⚠️ **아직 모르는 것**: 프롬프트의 따옴표 대사를 **그 글자 그대로** 말하는지는 실측된
  //   적이 없다. Seedance 는 그렇게 동작하고 그 위에 자막 정렬이 서 있다 — H3 가 다르게
  //   말하면 자막이 어긋난다. 첫 한 편에서 눈으로 확인할 자리다.
  //
  // ★ `extra` 가 **null 이다** — 있는 줄 알고 `generate_audio` 를 보내면 모르는 필드라
  //   거절될 수 있다(Kling 과 같은 판단). 소리는 끄고 켜는 것이 아니다.
  // ★ 씨앗은 연다 — 스키마에 `seed` 가 있다(i2v·r2v 둘 다 실측). 컷마다 같은 값을 보내
  //   목소리를 붙들어 두는 그 장치가 이 모델에도 그대로 쓰인다.
  {
    prefix: "minimax/h3",
    steps: null, min: 5, max: 15,
    speaks: true,
    resolutions: ["768P", "2K"],
    // ★ 표기가 **대문자다**(Seedance 는 소문자). 같은 필드에 두 표기가 섞여 사는 이유이고,
    //   그래서 목록은 처음부터 모델별이다(resolutionsForModel).
    defaultResolution: "2K",
    seeded: true,
    extra: null,
    // ★★ 참조 사진의 **파라미터 이름이 다르다**(Seedance 는 image_urls). 광고 축이
    //   2026-08-21 에 겪고 표로 옮긴 그 일이다 — 코드가 손으로 적으면 모델이 늘 때
    //   그 줄이 낡고, 낡으면 **사진이 통째로 무시된 채 값만 나간다.**
    refsField: "reference_image_urls",
    // ★★★ **참조 이미지의 가로세로비 한계**(2026-08-31 프로덕션 실측). fal 이 런타임에
    //   422 로 답한다 — **스키마에는 없는 제약이다**:
    //     `loc:["body","reference_image_urls",0]` ·
    //     *"The aspect ratio of the image should be between 0.4 and 2.5."*
    //   duration·resolution·필드 이름은 OpenAPI 가 말해 주지만 이것은 안 말해 준다.
    //   배선하면서 스키마만 읽고 넘어간 자리가 정확히 여기다.
    // ★ 통짜 굽기가 넘기는 **스토리보드 한 장**이 이 한계에 걸린다 — 컷이 다섯이면
    //   격자가 1행×5열이라 판이 2.81 이 된다(lib/reel/oneshot.js 의 planReelBake 가 본다).
    refAspect: { min: 0.4, max: 2.5 },
  },
  {
    prefix: "bytedance/seedance-2.0",
    steps: null, min: 4, max: 15,
    // ★ 이 모델은 **클립이 직접 말한다**(입모양까지). 그래서 오디오를 켠다.
    // 켜도 단가가 같다(끄든 켜든 $0.3024/s) — 켜서 잃는 것이 없다.
    // 대신 우리 TTS 를 만들지 않는다. 둘 다 만들면 소리가 두 겹이 된다.
    speaks: true,
    // ★ 해상도는 여기 고정하지 않는다 — 사장님이 고른 값을 lib/i2v.js 가 싣는다.
    //   목록은 fal 이 실제로 여는 것만 둔다(안 여는 값을 두면 고른 순간 거절된다).
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    refsField: "image_urls",
    // ★ 씨앗을 여는 모델. 이 모델은 컷마다 나레이션 목소리를 미묘하게 다르게 만든다
    //   (2026-08-18 사용자 실측). fal 응답 최상위에 seed 가 오므로 받는 값이고,
    //   컷마다 같은 값을 보내면 목소리가 안정될 가능성이 크다.
    // ★ 값은 여기 두지 않는다 — extra 는 **정적** 객체라 프로젝트별 값을 담을 수 없다.
    //   담으면 상수가 요청마다 달라지는 값을 들게 되고(모듈 로드 시 한 번 굳는다) 프로젝트가
    //   전부 같은 씨앗을 쓴다. 그래서 여기는 **여는가**만 쥐고(resolutions 와 같은 방식),
    //   값은 요청 시점에 lib/i2v.js 가 seedForProject 로 판다.
    seeded: true,
    extra: { generate_audio: true },
  },
  {
    // ★★ Seedance 2.5 (2026-08-25 — 사장님이 "등급에 따라서 사용 가능하게" 해서 열렸다).
    //   값은 lib/ad/models.js 의 같은 모델 항목에서 옮겨 왔다 — **두 표가 갈리면 안 된다.**
    // ⚠️ **컷 최소가 15초다**(2.0 은 4초). 컷별로 떨어지면 3컷에 45초를 굽는다 —
    //   그래서 통짜 상한을 모델이 정하게 함께 고쳤다(lib/reel/oneshot.js 의 oneShotMaxFor).
    // ⚠️ **한 번도 불러본 적이 없다.** 엔드포인트도 원가도 문서에서 본 값이고 실측이
    //   아니다(lib/ad/models.js 의 그 주석). 첫 호출에서 404/422 가 나면 그때 고친다.
    prefix: "bytedance/seedance-2.5",
    // ★★★ 2026-09-01 실측 — **판 비율에도 걸린다.** 컷 5개짜리 프로젝트가 1행×5열
    //   (비율 2.83)로 나갔다가 거절됐는데, 문구가 **초상**이었다("likenesses of real
    //   people"). 같은 비율을 H3 는 "aspect ratio should be between 0.4 and 2.5" 라고
    //   정확히 말한다 — 2.5 는 원인을 잘못 가리키는 문구를 돌려준다.
    //   ⚠️ 숫자는 **H3 의 공개 한계를 그대로 빌린 것**이다. 2.5 의 진짜 한계는 모른다
    //   (문서에 없다). 2.83 이 막혔고 0.56·0.84·1.36 이 통과한 것만 실측이다.
    refAspect: { min: 0.4, max: 2.5 },
    // ★★★ **참조 이미지에 사람 얼굴이 있으면 무조건 막는다**(2026-08-31 실측 5건:
    //   큰 얼굴 · 작게 · 단독 인물 카드 · 배경에 2% · 전부 거절. 얼굴 없는 판만 통과).
    //   그래서 이 모델에서는 **처음부터 얼굴 없는 판을 그린다** — 한 번 거절당한 뒤에
    //   다시 그리면 판값($0.401)을 헛되이 한 번 더 낸다.
    //   ★ 다른 모델은 이 값을 안 둔다: H3 는 **미검증**이고, 2.0 은 얼굴 든 판을
    //     실제로 통과시켰다(78cc092e — 얼굴 넷). 모르는 것을 막으면 되는 것까지 막는다.
    facesInRefs: false,
    steps: null, min: 15, max: 30,
    // ★ 네이티브 오디오 — 2.0 과 같이 클립이 직접 말한다. reel 이 서 있는 전제다.
    speaks: true,
    resolutions: ["480p", "720p"],
    defaultResolution: "720p",
    refsField: "image_urls",
    // ★ 씨앗을 안 싣는다 — 이 모델이 seed 를 받는지 확인된 적이 없고, 모르는 필드를
    //   보내면 거절될 수 있다(Kling 과 같은 판단).
    seeded: false,
    extra: { generate_audio: true },
  },
  {
    prefix: "fal-ai/kling-video/v3",
    steps: null, min: 3, max: 15,
    // ★ 이 모델에는 resolution 파라미터가 없다(2026-08-13 fal 스키마·모델 페이지 확인,
    //   원장의 성공 5건도 resolution 없이 돌았다). 빈 목록이라 화면에 선택지가 안 뜬다.
    resolutions: [],
    // 오디오를 끄는 것이 코드 보장이어야 단가가 $0.084 다(켜면 $0.126). 무엇보다 클립에
    // 소리가 실리면 우리 낭독과 두 겹이 되고, 낭독이 컷 길이를 정하는 뼈대와 어긋난다.
    // ★ 립싱크 품질이 검증되지 않아 이 모델은 아직 말하지 않는다.
    speaks: false,
    // 씨앗을 싣지 않는다 — 이 모델이 seed 를 받는지 확인된 적이 없고, 모르는 필드를 보내면
    // 거절될 수 있다. 게다가 클립이 말하지 않으므로(speaks:false) 목소리를 고정할 이유도 없다.
    seeded: false,
    extra: { generate_audio: false },
  },
  { prefix: "fal-ai/ltx-2", steps: [6, 8, 10, 12, 14, 16, 18, 20], speaks: false, resolutions: [], seeded: false, extra: null },
];

// 사장님이 고를 수 있는 모델. 엔드포인트 문자열이 사는 유일한 자리다.
//
// ⚠️ **이 문자열과 lib/i2v.js 의 요청 엔드포인트는 반드시 같아야 한다.** 둘이 갈리면
//    프로필과 실제 모델이 어긋난다 — Kling 을 부르면서 LTX 프로필을 쓰면
//    `generate_audio:false` 가 빠져 오디오가 켜진 채 청구되고($0.084→$0.126)
//    클립 소리가 우리 낭독과 두 겹이 된다. 그래서 문자열을 여기 하나만 둔다.
//
// label·hint 는 화면이 그대로 쓴다 — 화면에 문구를 적으면 두 군데가 되고 언젠가 갈린다.
export const I2V_MODELS = [
  // ★★ 순서가 곧 칩 순서다 — **기본이 프로보다 앞**(2026-08-31, 원클릭과 같은 규칙).
  {
    id: "minimax-h3",
    endpoint: "minimax/h3/image-to-video",
    refEndpoint: "minimax/h3/reference-to-video",
    label: "기본",
    hint: "값이 가장 싸요. 768P·2K",
  },
  {
    id: "seedance-2.0",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    // ★ 참조를 여러 장 넘기는 경로(2026-08-21). **i2v 와 뜻이 다르다** — i2v 의 그림은
    //   첫 프레임이고, 여기 그림들은 생김새 참조다. 그래서 꼬리 문장도 갈린다
    //   (lib/cuts.js 의 buildClipPrompt opts.attach).
    // ★ Kling 에는 안 둔다 — 그 모델의 r2v 경로를 확인한 적이 없고, 모르는 경로를 적으면
    //   404 인데 그때는 이미 값을 치른 뒤다.
    refEndpoint: "bytedance/seedance-2.0/reference-to-video",
    // ★★ 2026-08-31 — **숨긴 모델이 됐다**(REEL_MODEL_IDS 에서 빠졌다). 그래서 등급
    //   이름(기본·프로)을 도로 뺐다 — 광고 표의 2.0 과 같은 규율이다: 이 이름이 보이는
    //   곳은 **이미 그것으로 만든 옛 문서**뿐이라 모델 이름이 맞다.
    //   (몇 시간 전 "기본"이었던 것은 H3 가 아직 reel 에 배선되기 전이라 그랬다.)
    // ★★★ 2026-09-01 — **프로**(사장님 지시). 얼굴 든 참조를 받는 유일한 모델이다.
    label: "프로",
    hint: "움직임이 자연스러워요. 값이 더 들어요",
  },
  {
    id: "seedance-2.5",
    endpoint: "bytedance/seedance-2.5/image-to-video",
    refEndpoint: "bytedance/seedance-2.5/reference-to-video",
    // ★ 2026-09-01 — 고르는 자리에서 내려 등급 이름을 반납했다(옛 문서에만 보인다).
    label: "Seedance 2.5",
    hint: "30초까지 한 번에 만들어요. 값이 더 들어요",
  },
  {
    id: "kling-v3",
    endpoint: "fal-ai/kling-video/v3/standard/image-to-video",
    label: "Kling v3",
    hint: "값이 싼 쪽이에요",
  },
];

export const I2V_MODEL_IDS = I2V_MODELS.map((m) => m.id);
// ★★ 2026-08-31 — 기본이 2.0 → **기본(H3)** 으로 옮겼다(원클릭과 같은 모델). 아래
// LEGACY_I2V_MODEL(kling-v3)과 **다른 축이다** — 저쪽은 옛 문서가 떨어질 자리라 안 건드린다.
export const DEFAULT_I2V_MODEL = "minimax-h3";

// ★★ i2v_model 이 없는 프로젝트가 떨어질 자리. **기본값과 다르다.**
//
// 없는 것 = 이 기능이 붙기 전에 만들어진 프로젝트 = 이미 Kling 으로 클립을 만들고 있다.
// 여기를 DEFAULT_I2V_MODEL 로 두면 그 영상들이 다음 컷부터 조용히 Seedance 로 갈아타
// 한 편 안에 두 모델이 섞인다. 새 프로젝트는 생성 시점에 기본값을 **명시 저장**한다.
export const LEGACY_I2V_MODEL = "kling-v3";

// 모르는 모델이 떨어질 자리. LTX 를 고르는 이유는 대칭이 아니기 때문이다 —
// 범위 모델에 6·8 을 보내면 유효한 값이라 통과하고 값만 조금 더 나가지만,
// 열거 모델에 7초를 보내면 422 로 죽는다. 그렇다고 도는 것을 보장하진 않는다 —
// 실제 눈금이 5/10(구형 Kling)이거나 "8s" 같은 문자열 길이(Veo)를 원하는 모델이면
// 이 기본값도 그대로 422 를 받는다. 그래서 아래에서 매치 실패를 눈에 띄게 경고한다.
export const DEFAULT_CLIP_PROFILE = CLIP_PROFILES[CLIP_PROFILES.length - 1];

export function profileFor(endpoint) {
  const id = String(endpoint || "");
  const found = CLIP_PROFILES.find((p) => id.startsWith(p.prefix));
  if (!found) {
    console.warn(`[clip-limits] 알 수 없는 모델 "${id}" — 기본 눈금(LTX)으로 요청한다. 422 가능성 있음.`);
  }
  return found || DEFAULT_CLIP_PROFILE;
}

// 이 프로젝트가 쓰는 모델. 모르는 값·없는 값은 전부 LEGACY 로 떨어진다.
//
// ★ Object.hasOwn 이 아니라 목록 검색인 이유: I2V_MODELS 는 배열이라 프로토타입 함정이 없다.
export function modelIdForProject(project) {
  const id = project?.settings?.i2v_model;
  return I2V_MODELS.some((m) => m.id === id) ? id : LEGACY_I2V_MODEL;
}

// 실제로 부를 엔드포인트. i2v 도 이 함수를 쓴다 — 문자열이 두 군데 있으면 갈린다.
export function endpointForProject(project) {
  const id = modelIdForProject(project);
  return I2V_MODELS.find((m) => m.id === id).endpoint;
}

// 이 프로젝트의 모델이 참조 여러 장을 받는가 — 안 받으면 null 이다.
//
// ★ null 을 **조용한 폴백으로 쓰지 않는다.** 부르는 쪽(lib/i2v.js)이 refs 를 들고 왔는데
//   여기가 null 이면 그것은 잘못된 조합이므로 던진다 — 조용히 i2v 로 떨어뜨리면 사장님이
//   고른 참조가 통째로 무시된 채 값만 나간다.
export function refEndpointForProject(project) {
  const id = modelIdForProject(project);
  return I2V_MODELS.find((m) => m.id === id)?.refEndpoint || null;
}

export function clipProfileForProject(project) {
  return profileFor(endpointForProject(project));
}

export function speaksFor(profile) {
  return profile?.speaks === true;
}

// 이 모델이 받는 **참조 이미지의 가로세로비** 범위. 없으면 `null` — **모르면 안 막는다.**
//
// ★ 모르는 것을 좁게 적으면 멀쩡히 되던 길이 막힌다. 값이 걸린 판정(예산·정가)이라면
//   반대로 좁게 잡는 것이 안전하지만, 이것은 **갈래 판정**이라 틀려도 컷별로 떨어질 뿐이다.
// ★ Seedance·Kling 에는 이런 거절을 본 적이 없다 — 봤을 때 적는다.
// 이 프로젝트의 모델이 **참조 이미지 속 사람 얼굴을 막는가.**
//
// ★ 모르면 `false` 다 — 모르는 모델까지 미리 얼굴을 빼면, 받아 주는 모델에서 인물
//   고정을 공짜로 잃는다(2.0 은 얼굴 든 판으로 영상을 냈다).
export function blocksFacesInRefs(project) {
  return clipProfileForProject(project)?.facesInRefs === false;
}

export function refAspectFor(profile) {
  const r = profile?.refAspect;
  return r && Number.isFinite(r.min) && Number.isFinite(r.max) ? r : null;
}

// 이 프로젝트에서 클립이 말하는가.
//
// ★ 모델만으로는 부족하다 — **말하는 컷 전부에** 말할 사람과 대사가 있어야 한다.
//   (무음 컷은 이 셈에서 뺀다. 아래 `speaking` 참고 — 연출로 말하지 않기로 한 컷이라
//    "말할 사람이 없다"와 다르다.)
//
// 인물은 컷마다 다르다. 사람이 나오는 컷은 클립이 말하지만 안 나오는 컷(제품 클로즈업)은
// 말할 사람이 없고, 그 컷만 무음이 되면 원고 일부가 안 들린다. 하나라도 비면 프로젝트
// 전체가 TTS 경로로 간다 — 한 편 안에서 소리의 출처가 갈리지 않게 한다.
//
// 화면 밖 내레이션도 **이 모델이 한다**(2026-08-17 사용자 정정). 광고에서 흔한 기법이다 —
// 자동차 광고에서 화면 중간에 "누구보다 빠르게. 그리고 편안하게." 가 들어가는 그 방식.
// 그래서 내레이션 컷은 이 판정에서 **떨어뜨리지 않고 면제**한다(아래 every 절).
export function projectSpeaks(project) {
  if (!speaksFor(clipProfileForProject(project))) return false;
  const cuts = project?.cuts || [];
  const cast = project?.cast || [];
  // ★ 캐스팅이 비었다는 이유만으로 떨어뜨리지 않는다(2026-08-17).
  //   그 가드는 "말할 사람이 아무도 없다"의 줄임말이었는데, 화면 밖 목소리가 생긴 지금은
  //   **전부 내레이션인 영상**(제품·정보물에서 흔하다)이 정확히 그 모양이다 — 캐스팅이
  //   지문대로 사람을 안 뽑아 cast:[] 인데 대사는 전부 내레이터가 읽는다.
  //   가드를 걷어도 판정은 안 느슨해진다: 화면 속 대사가 하나라도 있으면 아래 every() 가
  //   빈 cast 에서 거짓을 내므로 결론이 같다(그 자리가 원래의 유일한 근거다).
  if (!cuts.length) return false;
  // ★ 소리 파일이 이미 있는 프로젝트는 말하지 않는다.
  //
  // 정상 경로에서는 말하는 프로젝트가 TTS 를 아예 안 만들므로 이 조건이 걸리지 않는다.
  // 걸리는 것은 **교차 상태**뿐이다: Kling 으로 낭독까지 만든 뒤 클립에서 실패해 자동
  // 환불되면(lib/auto.js) 모델 잠금이 풀려 Seedance 로 갈아탈 수 있다. 그때 컷에는 TTS 가
  // 남아 있어, 그대로 말하게 두면 한 컷은 클립 목소리·다른 컷은 TTS 가 되거나(부분 실패),
  // 말하는 클립이 낭독 길이로 잘려 문장 끝이 사라진다.
  if (cuts.some((c) => c.audio?.url)) return false;
  // ★ 말할 것이 없는 컷은 이 판정에서 뺀다. 사유가 둘인데 결론은 같다:
  //
  //  · `silent` — 연출로 말하지 않기로 한 컷(2026-08-14)
  //  · 빈 문장 — 컷 분할이 대사 없이 만든 컷(2026-08-15, 프로덕션 실측 810d2361 은
  //    컷 3개 중 둘이 그렇다). 예전에는 "모든 컷에 대사가 있어야 한다"였고, 그래서
  //    말할 것이 없는 컷 하나 때문에 한 편 전체가 TTS 경로로 떨어졌다.
  //
  // 위 규칙의 취지("원고 일부가 안 들리면 안 된다")는 **대사가 있는 컷**에만 걸린다 —
  // 이 컷들에는 안 들릴 원고가 없다. 가르지 않으면 그런 컷 하나가 나머지 컷의 목소리까지
  // TTS 로 끌어내린다.
  //
  // ⚠️ 대사가 있는 컷에는 여전히 말할 사람이 있어야 한다 — 단 **화면 밖 목소리 컷은 면제**다
  //    (2026-08-17). 정의상 화면에 사람이 없으니 캐스팅에 있을 수가 없다. 면제하지 않으면
  //    위 바일아웃을 걷어도 결과가 똑같다 — 그 컷이 대신 이 조건에 걸려 한 편이 TTS 로 간다.
  //    이 컷의 대사는 내레이터가 읽는다(lib/cuts.js speechFor 의 내레이션 갈래).
  const speaking = cuts.filter(
    (c) => !c?.silent && typeof c?.sentence === "string" && c.sentence.trim() !== ""
  );
  // ⚠️ 말하는 컷이 하나도 없으면 읽을 원고가 없다 — 말하는 프로젝트가 아니다.
  //    every() 는 빈 목록에 참을 주므로 명시적으로 막는다(cuts.length 가드와 같은 함정).
  if (!speaking.length) return false;
  return speaking.every((cut) =>
    cut?.narration === true ||
    cast.some((p) => Array.isArray(p?.cuts) && p.cuts.includes(cut.idx))
  );
}

// GET /api/projects/[id] 가 화면에 실어 보내는 값. 화면은 프로젝트 문서를 서버에서 받으므로
// 상한도 서버가 준다 — 화면이 스스로 계산하면 두 벌이 되고 언젠가 갈린다.
export function clipLimitsForProject(project) {
  const profile = clipProfileForProject(project);
  return { min: minSecondsFor(profile), max: maxSecondsFor(profile) };
}

export function minSecondsFor(profile) {
  return profile.steps ? profile.steps[0] : profile.min;
}

export function maxSecondsFor(profile) {
  return profile.steps ? profile.steps[profile.steps.length - 1] : profile.max;
}

// 낭독 길이를 모델이 받는 길이로 **올린다**. 상한을 넘으면 상한에 묶는다.
// 내리지 않는 이유: 내리면 소리가 그림보다 길어져 뒤가 잘린다.
//
// 올린 만큼 클립이 낭독보다 길어지는데, 그 차이는 **합성이 잘라낸다**
// (trim=duration=낭독, lib/compose.js). 그래서 자막·완성본 길이는 낭독으로 잰다.
export function fitDurationFor(profile, seconds) {
  const want = Number(seconds) || 1;
  if (profile.steps) return profile.steps.find((s) => s >= want) ?? maxSecondsFor(profile);
  const ceil = Math.ceil(want);
  if (ceil < profile.min) return profile.min;
  if (ceil > profile.max) return profile.max;
  return ceil;
}

// 화면(script·video 페이지)이 쓰는 이름들.
//
// **프로젝트별 프로필로는 만들 수 없다** — 상수라서 프로젝트를 모른다. 화면은 서버가 실어 보낸
// `clip_limits` 를 먼저 쓰고, 이 값은 그것이 오기 전의 폴백이다.
//
// 그 상수를 **기본 모델의 프로필**에서 뽑는다(2026-07-30). 예전에는
// DEFAULT_CLIP_PROFILE(=모르는 모델의 폴백, LTX)에 묶여 있었는데, 그러면 그 값이 아무 모델도
// 가리키지 않는 숫자가 된다 — 화면이 상한 20 을 말하고 서버는 15 로 자른다.
const DEFAULT_ENDPOINT_PROFILE = profileFor(
  I2V_MODELS.find((m) => m.id === DEFAULT_I2V_MODEL).endpoint
);

// ⚠️ 범위 모델(Kling)이면 **null** 이다 — 눈금이 없다는 뜻이다. `I2V_STEPS[0]` 처럼 쓰면 죽는다.
export const I2V_STEPS = DEFAULT_ENDPOINT_PROFILE.steps;
export const I2V_MAX_SECONDS = maxSecondsFor(DEFAULT_ENDPOINT_PROFILE);
export function fitDuration(seconds) {
  return fitDurationFor(DEFAULT_ENDPOINT_PROFILE, seconds);
}

// 옛 문서(settings.resolution 없음)가 떨어질 자리. 지금까지 fal 에 실제로 보낸 값이 720p 라
// 반대로 두면 이미 만든 프로젝트의 가격과 각인이 소급해 달라진다.
export const DEFAULT_RESOLUTION = "720p";

// ★★ 그 모델로 **고를 수 있는 길이**(2026-08-25 사장님 지시: "각 모델이 제공하는 영상
//   길이만큼만 가능하게. 2.0 은 15초가 한계이니까 15초 이내로").
//   그전에는 화면이 TARGET_CHOICES(15·30·45·60)를 **모델과 무관하게** 그렸다 — 기본이
//   Seedance 2.0(한 번에 15초가 최대)인데 60초가 고를 수 있게 서 있었다.
//
// ★ 45·60초가 영영 불가능하다는 뜻은 아니다 — 컷별로 굽고 이어 붙이면 된다(그래서
//   TARGET_CHOICES 에 그 값이 남아 있다). 지금은 **한 번에 굽는 길이만** 열기로 한 것이다.
// ★ 표를 두 벌로 적지 않는다 — 모델의 상한(CLIP_PROFILES.max)에서 뽑는다. 손으로 적으면
//   모델이 하나 늘 때 이 목록만 낡는다.
// ★ 모르는 모델은 기본 모델로 본다 — **던지지 않는다**(화면이 부르는 자리다).
//   서버도 같은 함수를 보므로 화면과 판정이 갈리지 않는다(app/api/reel/route.js).
// ⚠️ TARGET_CHOICES 를 import 하지 않는다 — lib/script.js 는 순수 파일이지만, 이 파일도
//   화면이 읽는 자리라 사슬을 늘리지 않는다. 값이 갈리는 것은 테스트가 대조한다.
const SELECTABLE_SECONDS = [15, 30, 45, 60];

// ★★ **reel 이 여는 모델**(2026-08-25 사장님 지시로 모델 칸이 생겼다).
//   I2V_MODELS 전부가 아니다 — 두 가지를 걸러야 한다:
//   · **Kling v3 는 안 연다.** `speaks:false` 라 reel 이 서 있는 전제("클립이 직접
//     말한다")가 무너진다 — 고르면 대사가 통째로 사라진다.
//   · **Seedance 2.5 는 아직 안 연다**(사장님이 B 를 골랐다). 열려면 넷이 먼저다:
//     ① 이 파일의 CLIP_PROFILES 에 2.5 프로필 ② ONESHOT_MAX_SECONDS 를 모델이 정하게
//     ③ 2.5 의 컷 최소 15초(컷별로 떨어지면 3컷에 45초를 굽는다)
//     ④ **lib/pricing.js 의 VIDEO_PRICE 에 2.5** — 없으면 priceModel 이 조용히
//        kling-v3 값으로 떨어져 $13.87 굽고 50크레딧을 받는다. ④가 사장님 결정 대기다.
//   여기 한 줄만 늘리면 열리도록 두었다 — 그때 위 넷을 같이 본다.
// ★★★ 2026-08-31 — **기본(H3)이 들어오고 2.0 이 빠졌다**(사장님 지시). 위 넷을 이번에
//   다 채웠다: ① CLIP_PROFILES 의 minimax/h3 프로필 ② 통짜 상한은 프로필의 max 에서
//   나온다(oneShotMaxFor) ③ 컷 최소 5초 ④ lib/pricing.js 의 VIDEO_PRICE·REGEN_PRICE.
//   ★ 순서가 곧 칩 순서다 — 기본이 프로보다 앞.
// ⚠️ 2.0 을 뺀 것은 **고르는 자리에서만**이다. 이미 2.0 으로 만든 reel 문서는 그대로 돈다 —
//   isReelModel 을 보는 곳은 만들 때 한 곳뿐이다(app/api/reel/route.js).
// ★★★ 2026-09-01 — **프로가 2.0 으로 바뀌었다**(사장님 지시). 09-01 실측: 2.5 는 참조
//   이미지에 얼굴이 있으면 아홉 번 전부 거절했고, 2.0 은 같은 판을 첫 시도에 통과시켰다.
//   ⚠️ 대가: 2.0 의 통짜 상한이 **15초**라 30초가 사라진다(2.5 는 30초였다).
//   ★ 2.5 를 여기서 빼는 것은 "새로 못 고른다"는 뜻이다 — 이미 2.5 로 만든 문서는
//     프로필이 표에 남아 있어 그대로 다시 구워진다(hidden 을 안 쓰는 이유).
export const REEL_MODEL_IDS = Object.freeze(["minimax-h3", "seedance-2.0"]);

export function isReelModel(id) {
  return REEL_MODEL_IDS.includes(id);
}

// 그 등급이 reel 에서 고를 수 있는 모델. **둘 다 통과해야** 한다 — 등급이 열어 줘도
// reel 이 안 여는 모델이면 안 나온다(지금 프로의 2.5 가 그 자리다).
// ★ 모르는 등급은 아무것도 더 열어 주지 않는다 — 던지지 않는다(화면이 부르는 자리다).
// ⚠️ 이것은 **가림막이지 잠금이 아니다.** 잠금은 서버가 한다(app/api/reel/route.js) —
//   광고에서 화면만 거르고 서버는 그대로 받아 API 로 뚫렸던 사고가 그 근거다.
export function reelModelsForTier(tier) {
  const t = TIERS.find((x) => x.id === tier) || TIERS.find((x) => x.id === DEFAULT_TIER);
  return I2V_MODELS.filter((m) => isReelModel(m.id) && t.models.includes(m.id));
}

// ★★ **장면 하나의 하한**(2026-08-25 — Seedance 2.5 를 열면서 드러난 자리).
//
// 그전에는 장면 하한이 곧 **모델의 클립 하한**(minSecondsFor)이었다. 컷마다 따로 굽던
// 시절에는 맞는 말이다 — 컷 하나가 클립 하나라 모델이 안 받는 길이를 쓸 수 없다.
//
// ⚠️ 2.5 에서 그 말이 **자기모순**이 됐다: 클립 하한이 15초인데 콘텐츠 상한
//   (lib/cuts.js 의 CONTENT_MAX_SECONDS)은 8초다 — 그림 한 장이 화면에 머무는 한계라
//   모델과 무관하다. 15 이상이면서 8 이하인 길이는 없으므로 **유효한 시나리오가 아예
//   나오지 않는다**(tests/scenario-generate.test.js 가 이것을 잡았다).
//
// ★ 풀이: **통짜로 구울 프로젝트에는 클립 하한이 애초에 적용되지 않는다.** 한 판을
//   통째로 굽기 때문에 장면은 스토리보드의 칸일 뿐, 각각이 클립이 아니다.
//   그래서 그때는 하한을 1초로 본다(상한은 콘텐츠 규칙이 그대로 쥔다).
// ★ 컷별로 굽는 프로젝트는 **한 글자도 안 바뀐다** — 모델 하한 그대로다.
export function sceneMinSecondsFor(project) {
  const profile = clipProfileForProject(project);
  const seconds = Number(project?.settings?.target_seconds) || Number(project?.settings?.seconds) || 0;
  const oneShot = project?.kind === "reel" && seconds > 0 && seconds <= maxSecondsFor(profile);
  return oneShot ? 1 : minSecondsFor(profile);
}

export function secondsForModel(modelId) {
  const model = I2V_MODELS.find((m) => m.id === modelId)
    || I2V_MODELS.find((m) => m.id === DEFAULT_I2V_MODEL);
  const max = maxSecondsFor(profileFor(model.endpoint));
  return SELECTABLE_SECONDS.filter((s) => s <= max);
}

// 모델 id 로 바로 묻는 자리. 화면은 **저장된 모델**이 아니라 **지금 고르려는 모델**의 목록을
// 그려야 해서, project 만 받으면 화면이 `{settings:{i2v_model:id}}` 가짜 객체를 만들게 된다.
// 그 관용구가 퍼지면 프로필 조회 규칙이 바뀔 때 전부 뒤져야 한다 — 그래서 그 한 줄을
// 여기 하나로 가둔다(광고 축의 `adResolutionsFor(modelId)` 와 같은 모양이다).
//
// ★ 모르는 id·없는 id 의 판정은 modelIdForProject 가 쥔다(LEGACY 로 떨어진다) —
//   여기서 다시 쓰면 규칙이 두 벌이 된다.
export function resolutionsForModel(modelId) {
  return clipProfileForProject({ settings: { i2v_model: modelId } }).resolutions || [];
}

export function resolutionsForProject(project) {
  return resolutionsForModel(project?.settings?.i2v_model);
}

// 이 프로젝트가 실제로 쓸 해상도. 갈래가 둘이고 서로 다른 일을 한다:
//
//   ① 목록이 비면(Kling·LTX) → `""`. **해상도를 아예 안 보낸다** — 그 모델에는 파라미터
//      자체가 없어서, 기본값이든 무엇이든 실으면 모르는 필드가 된다.
//   ② 목록이 있는데 저장값이 그 안에 없으면(Seedance + "2160p" 같은 값) → 기본값(720p)으로
//      떨어뜨린다. 옛 해상도가 남아 fal 이 거절하는 길을 안 만든다.
// **새로 만들 때·되돌릴 때**의 기본 화질. 모델마다 다르다 — H3 에는 720p 가 아예 없다.
// ★ 광고 축의 adDefaultResolution 과 같은 모양이다(값이 갈리면 같은 모델이 화면마다
//   다른 기본을 든다). 프로필에 없으면 그 모델이 여는 첫 값이다.
export function defaultResolutionForModel(modelId) {
  const profile = clipProfileForProject({ settings: { i2v_model: modelId } });
  return profile.defaultResolution || profile.resolutions?.[0] || "";
}

export function resolutionForProject(project) {
  const list = resolutionsForProject(project);
  if (!list.length) return "";
  const saved = project?.settings?.resolution;
  if (list.includes(saved)) return saved;
  // ★★ 2026-08-31 — 목록 밖의 저장값은 **그 모델의 기본**으로 떨어진다. 그전에는 전역
  //   720p 를 먼저 봤는데, H3 에는 그 값이 없어 목록의 첫 값(768P)으로 갔다 — 화면이
  //   보여 주는 기본(2K)과 실제로 나가는 값이 갈리는 자리였다.
  const byModel = defaultResolutionForModel(project?.settings?.i2v_model);
  if (byModel && list.includes(byModel)) return byModel;
  // ★ `list[0]` 은 지금 어떤 입력으로도 안 탄다 — 비지 않은 목록은 Seedance 하나뿐이고
  //   거기 720p 가 있다. 남겨 두는 이유는 **720p 를 안 여는 모델이 올 수 있어서**다
  //   (fal 모델마다 여는 값이 다르다). 그때 목록 밖의 720p 로 요청해 거절당하느니
  //   그 모델이 실제로 여는 첫 값으로 간다. 그 모델이 생기면 테스트도 그때 생긴다.
  return list.includes(DEFAULT_RESOLUTION) ? DEFAULT_RESOLUTION : list[0];
}

// ★★ 씨앗(seed) — 한 편 안에서 목소리를 붙들어 두는 값.
//
// 왜 필요한가: Seedance 2.0 이 컷마다 나레이션 목소리를 미묘하게 다르게 만든다(2026-08-18
// 사용자 실측). 같은 목소리 지시를 줘도 그렇다. 컷마다 **같은** 씨앗을 보내면 모델의 무작위
// 출발점이 같아져 목소리가 안정될 가능성이 크다. 그래서 이 값은 **프로젝트당 하나**여야 한다 —
// 컷마다 다르면 지금과 똑같고, 뜻이 없다.
//
// 왜 저장하지 않는가: 프로젝트 id 에서 파면 값이 한 벌이다. 문서에 저장하면 파생값과 저장값이
// 두 벌이 되고, 이 기능 앞에 만들어진 프로젝트에는 그 필드가 없어서 "없으면 어디로 떨어지나"를
// 또 정해야 한다. id 는 이미 불변이라 그럴 자리가 안 생긴다.
//
// FNV-1a 32비트다. 암호가 아니라 흩기만 하면 되고(같은 id → 같은 값, 다른 id → 다른 값),
// 순수 JS 한 줄기라 `fs` 를 안 끈다 — 이 파일은 화면이 import 한다(crypto 도 못 쓴다).
export function clipSeed(projectId) {
  const s = String(projectId || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // FNV 소수 곱 — 32비트로 되접는다(Math.imul 이 오버플로 없이 그 일을 한다)
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // 32비트 **양의** 정수로 잡는다. 0 은 "씨앗 없음"의 뜻으로 쓰므로 값에서 빼 둔다
  // (아래 seedForProject 가 0 을 그 신호로 쓴다).
  return (h % 2147483647) + 1;
}

// 이 프로젝트가 실제로 보낼 씨앗. **0 이면 안 싣는다** — resolutionForProject 의 `""` 와 같은 규약.
//
// 갈래가 둘이다:
//   ① 프로필이 씨앗을 안 열면(Kling·LTX·모르는 모델) → 0. 모르는 필드를 보내면 거절될 수 있다.
//   ② 프로젝트 id 가 없으면(옛 호출부·측정 스크립트) → 0. 고정할 대상이 없는데 아무 값이나
//      실으면 "프로젝트당 하나"라는 성질이 조용히 깨진다.
export function seedForProject(project, projectId) {
  if (!clipProfileForProject(project)?.seeded) return 0;
  if (!projectId) return 0;
  return clipSeed(projectId);
}

export function isResolutionFor(resolution, project) {
  return resolutionsForProject(project).includes(resolution);
}
