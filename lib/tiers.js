// 이용 등급 — **누가 어떤 모델을 쓸 수 있는가**. 판정이 사는 유일한 자리.
//
// ★★ hidden 과 등급은 **다른 축**이다(2026-08-20). 헷갈리기 쉬우니 갈라서 적는다:
//   · `hidden`(lib/ad/models.js·options.js) — **아무도** 못 쓴다. 표에는 남긴다(지우면
//     그것으로 만든 옛 문서가 값 계산에서 던져 화면째 죽는다).
//   · **등급** — **누가** 쓸 수 있나. 표에도 남고 화면에도 있는데 사람마다 갈린다.
//
// 2.5 는 지금까지 hidden 으로 전부 숨겨 두었는데, 그것은 **화면에서만 거르는 것**이었다 —
// 서버의 isAdModel("seedance-2.5") 는 true 라 API 를 직접 두드리면 그대로 만들어졌다.
// 즉 잠금이 아니라 가림막이었다. 등급이 그 자리를 대신하고, 이번에는 **서버가 판정한다.**
//
// ⚠️ 이 파일은 화면("use client")도 import 한다. import 는 lib/ad/models.js 하나뿐이고
//   그 파일은 import 가 0 인 순수 데이터라 번들에 fs 가 안 섞인다(그 파일 머리말 참고).
//   여기에 fs·env 를 끄는 모듈을 더하지 마라.
import { AD_MODELS } from "./ad/models.js";

// ★ 얼려 둔다. 화면이 여는 문과 서버가 닫는 문이 **같은 표**를 봐야 한다 — 호출부의
//   push 한 줄로 런타임에 셋이 되면 그 순간 둘이 갈린다(FILM_MODES 와 같은 규율).
// ★★ MiniMax H3 는 **기본 등급에 넣는다**(2026-08-21). 등급의 근거는 처음부터 원가였는데
//   (2.5 를 좁힌 이유가 "원가가 2.0 의 3배"였다), H3 는 그 축에서 **가장 싸다**:
//   15초 2K 가 $1.95 로 2.0 720p($4.55)의 절반도 안 된다. 좁힐 이유가 없다.
export const TIERS = Object.freeze([
  Object.freeze({
    id: "basic", label: "기본", hint: "Seedance 2.0 · MiniMax H3",
    models: Object.freeze(["seedance-2.0", "minimax-h3"]),
  }),
  Object.freeze({
    id: "pro", label: "프로", hint: "2.5 까지",
    models: Object.freeze(["seedance-2.0", "minimax-h3", "seedance-2.5"]),
  }),
]);

// ★ 새로 가입한 사람이 서는 자리 — **좁은 쪽**이다. 2.5 는 원가가 2.0 의 3배 이상이라
//   (15초 720p ≈ $6.93) 기본으로 열어 두면 한 편에 그만큼이 나간다.
export const DEFAULT_TIER = "basic";

export function isTier(id) {
  return TIERS.some((t) => t.id === id);
}

// 이 사람의 등급.
//
// ★★ **모르는 값은 좁은 쪽으로 떨어진다.** lib/fake.js 가 "모르는 값은 진짜(=돈이 나감)로
//   본다"로 안전한 쪽을 고르는 것과 같은 규율이고, 여기서 안전한 쪽은 **덜 열어 주는 쪽**이다:
//   잘못 열면 원가 3배인 모델로 값이 나가고, 잘못 닫으면 운영자가 화면에서 올려 주면 된다.
// ★ 컬럼이 생기기 전에 만들어진 계정은 tier 가 아예 없다 — 그때도 여기로 떨어진다.
//   (그래서 백필이 필수가 아니다. DB 기본값과 이 폴백이 같은 값이어야 한다.)
export function tierOf(profile) {
  const v = profile?.tier;
  return isTier(v) ? v : DEFAULT_TIER;
}

// 이 등급이 고를 수 있는 모델 — **모델 표의 원소를 그대로** 돌려준다.
// 화면이 label·hint 를 여기서 읽으므로 id 만 주면 화면이 표를 또 뒤져야 한다.
//
// ★★★ **관리자는 등급을 안 탄다**(2026-08-21 사장님 결정). 등급은 "**손님**이 무엇을
//   살 수 있나"이고 관리자는 손님이 아니다 — 값을 확인하고 품질을 재는 사람이다.
//   운영자가 자기 서비스의 모델을 못 쓰면 앞뒤가 안 맞는다.
//   ★ 이걸 안 하면 **죽은 코드가 생긴다**: lib/ad/models.js 의 `adminResolutions`
//     (2.5 의 1080p)는 "관리자가 2.5 를 고를 수 있다"를 전제하는데, 등급이 막으면
//     그 자리에 영영 도달할 수 없다. 실제로 그 상태였다(관리자 계정이 basic 이었다).
//   ★ 두 게이트가 이제 **같은 축**을 본다 — 모델도 해상도도 admin 을 본다.
//
// ★ hidden 은 **관리자에게도** 걸러진다 — "아무도 못 쓴다"가 등급·역할보다 강하다.
//   그 표시는 "은퇴했거나 고장 났다"는 뜻이지 "비싸다"가 아니다(비싼 것은 등급이 맡는다).
//
// ★ 기본값이 **닫힌 쪽**이다 — 넘기는 것을 잊으면 덜 열어 주는 방향으로 틀린다
//   (이 파일의 "모르는 값은 좁은 쪽으로" 와 같은 규율).
export function modelsForTier(tier, { admin = false } = {}) {
  const open = AD_MODELS.filter((m) => !m.hidden);
  if (admin) return open;
  const t = TIERS.find((x) => x.id === tier) || TIERS.find((x) => x.id === DEFAULT_TIER);
  return open.filter((m) => t.models.includes(m.id));
}

// 서버가 보는 판정 — 이 사람이 이 모델을 써도 되는가.
//
// ★ 모르는 모델은 **관리자도** 못 쓴다. 통과시키면 값이 나간 **뒤에** fal 이 404 를 낸다
//   (표에 없는 id 는 modelsForTier 가 애초에 안 돌려준다).
export function tierAllowsModel(tier, modelId, opts) {
  return modelsForTier(tier, opts).some((m) => m.id === modelId);
}
