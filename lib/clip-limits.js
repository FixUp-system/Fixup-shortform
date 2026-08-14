// 클립 길이 눈금 — 화면(클라이언트)과 i2v(서버)가 함께 본다.
//
// lib/i2v.js 에 두면 안 된다. 그 모듈은 costs.js 를 거쳐 fs 를 끌고 오는데,
// "use client" 화면이 import 하면 번들에 fs 가 들어가 빌드가 깨진다.
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
    extra: { generate_audio: false },
  },
  { prefix: "fal-ai/ltx-2", steps: [6, 8, 10, 12, 14, 16, 18, 20], speaks: false, resolutions: [], extra: null },
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
  {
    id: "seedance-2.0",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    label: "Seedance 2.0",
    hint: "움직임이 자연스러워요. 값이 더 들어요",
  },
  {
    id: "kling-v3",
    endpoint: "fal-ai/kling-video/v3/standard/image-to-video",
    label: "Kling v3",
    hint: "값이 싼 쪽이에요",
  },
];

export const I2V_MODEL_IDS = I2V_MODELS.map((m) => m.id);
export const DEFAULT_I2V_MODEL = "seedance-2.0";

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

export function clipProfileForProject(project) {
  return profileFor(endpointForProject(project));
}

export function speaksFor(profile) {
  return profile?.speaks === true;
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
// 화면 밖 내레이션(사물·정보 영상)의 설계는 아직 없다. 그때도 여기서 false 로 떨어진다.
export function projectSpeaks(project) {
  if (!speaksFor(clipProfileForProject(project))) return false;
  const cuts = project?.cuts || [];
  const cast = project?.cast || [];
  if (!cuts.length || !cast.length) return false;
  // ★ 소리 파일이 이미 있는 프로젝트는 말하지 않는다.
  //
  // 정상 경로에서는 말하는 프로젝트가 TTS 를 아예 안 만들므로 이 조건이 걸리지 않는다.
  // 걸리는 것은 **교차 상태**뿐이다: Kling 으로 낭독까지 만든 뒤 클립에서 실패해 자동
  // 환불되면(lib/auto.js) 모델 잠금이 풀려 Seedance 로 갈아탈 수 있다. 그때 컷에는 TTS 가
  // 남아 있어, 그대로 말하게 두면 한 컷은 클립 목소리·다른 컷은 TTS 가 되거나(부분 실패),
  // 말하는 클립이 낭독 길이로 잘려 문장 끝이 사라진다.
  if (cuts.some((c) => c.audio?.url)) return false;
  // ★ 무음 컷은 판정에서 뺀다(2026-08-14). 연출로 말하지 않기로 한 컷이므로
  //   "말할 사람이 없다"와 다르다. 가르지 않으면 무음 컷 하나가 나머지 컷의
  //   목소리까지 TTS 로 끌어내린다.
  const speaking = cuts.filter((c) => !c?.silent);
  if (!speaking.length) return false;
  return speaking.every((cut) =>
    typeof cut?.sentence === "string" && cut.sentence.trim() !== "" &&
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
export function resolutionForProject(project) {
  const list = resolutionsForProject(project);
  if (!list.length) return "";
  const saved = project?.settings?.resolution;
  if (list.includes(saved)) return saved;
  // ★ `list[0]` 은 지금 어떤 입력으로도 안 탄다 — 비지 않은 목록은 Seedance 하나뿐이고
  //   거기 720p 가 있다. 남겨 두는 이유는 **720p 를 안 여는 모델이 올 수 있어서**다
  //   (fal 모델마다 여는 값이 다르다). 그때 목록 밖의 720p 로 요청해 거절당하느니
  //   그 모델이 실제로 여는 첫 값으로 간다. 그 모델이 생기면 테스트도 그때 생긴다.
  return list.includes(DEFAULT_RESOLUTION) ? DEFAULT_RESOLUTION : list[0];
}

export function isResolutionFor(resolution, project) {
  return resolutionsForProject(project).includes(resolution);
}
