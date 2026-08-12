// 크레딧 가격표 — 이 파일이 유일한 진실의 원천이다.
//
// 값은 2026-08-06 실측 원가(원장 63건, 전부 진짜 지출)에서 뽑았다:
//   클립 $0.420/컷 · 이미지 $0.080/컷 · 나머지(LLM) 편당 ~$0.06
//   → 편당 원가 ≈ $0.06 + 컷당 $0.50 × 컷 수. 30초(6컷) ≈ $3.06
// 1크레딧 ≈ $0.06 원가로 잡아 30초 = 50 크레딧(Kling 기준. 모델마다 갈린다 — VIDEO_PRICE 참고).
// 마진은 없다 —
// 지금 크레딧은 사실상 사용 한도이고, 판매가는 결제를 붙일 때 정한다.
//
// ★ 이 값들은 바뀐다. 바뀔 때 고칠 자리가 여기 하나여야 한다 —
//   가격 숫자를 라우트·화면에 흘리지 마라.
//
// ★ 이 파일은 화면("use client")에서도 import 된다. import 문을 두지 마라 —
//   순수 데이터·순수 함수만 있어야 번들이 깨지지 않는다.

// 목표 길이(초) → 크레딧. **모델마다 다르다** — 원가가 모델의 초당 단가에 비례한다.
//   kling-v3     : 클립 $0.084/s → 30초 한 편 원가 ≈ $3.06
//   seedance-2.0 : 클립 $0.3024/s → 30초 한 편 원가 ≈ $9.62 (3.2배)
// 1크레딧 ≈ $0.06 원가 기준은 그대로다.
export const VIDEO_PRICE = {
  "seedance-2.0": { 15: 80, 30: 160, 45: 240, 60: 320 },
  "kling-v3": { 15: 25, 30: 50, 45: 75, 60: 100 },
};

// 컷 하나를 다시 만들 때. 클립만 모델을 탄다(이미지·목소리는 모델과 무관하다).
// 실측 원가 이미지 $0.08 · 목소리 $0.002 · 클립 kling $0.42 / seedance $1.51 을 올림했다.
export const REGEN_PRICE = {
  image: 2,
  voice: 1,
  clip: { "seedance-2.0": 25, "kling-v3": 8 },
};

// ★ 모델을 안 넘긴 호출이 떨어질 자리. **기본 모델이 아니라 옛 모델이다.**
// 모델을 모른다는 것은 이 기능 전에 만들어진 프로젝트라는 뜻이고, 그것들은 Kling 으로 돈다.
// (같은 규칙이 lib/clip-limits.js 의 LEGACY_I2V_MODEL 에 있다. 이 파일은 import 를 둘 수
//  없어 — 화면이 읽는 순수 데이터 파일이다 — 문자열을 되풀이한다. 한쪽을 바꾸면 둘 다 바꿔라.)
const LEGACY_MODEL = "kling-v3";

function priceModel(model) {
  return VIDEO_PRICE[model] ? model : LEGACY_MODEL;
}

// 컷마다 이만큼은 공짜다 — "한 번은 다시 해 볼 수 있게".
export const FREE_REGEN_PER_CUT = 1;

// 컷마다 이 횟수를 넘으면 아예 못 한다(돈을 내도). lib/pipeline.js 의 세 regen 이 락 안에서
// 세는 상한과 **같은 값이어야 한다** — 라우트가 청구 앞에서 먼저 보고 막는다.
// 숫자가 두 군데로 갈리면 "받고 나서 400" 이 다시 생긴다(실제로 그랬다).
export const MAX_REGEN_PER_CUT = 3;

// 백오피스 [크레딧 넣기] 의 기본값(운영자가 고칠 수 있다).
export const DEFAULT_GRANT = 500;

// 운영자가 **처음 승인할 때** 자동으로 들어가는 가입 기본 크레딧.
//
// ★ DEFAULT_GRANT 와 같은 500 이지만 **다른 값이다.** 저것은 운영자가 화면에서 언제든
// 고쳐 쓰는 입력칸의 기본값이고, 이것은 코드가 사람 손 없이 주는 값이다. 하나로 묶으면
// 입력칸 기본값을 바꾸는 순간 자동 지급액이 조용히 따라 움직인다.
//
// ⚠️ 이 숫자는 현금이다 — Seedance 30초 3편(원가 ≈$29) 또는 Kling 10편이다.
export const SIGNUP_GRANT = 500;

// 그 지급의 사유. **멱등키 대신 쓴다** — credit_grants 에는 유니크 제약이 없어서,
// 승인을 껐다 켜면 같은 지급이 또 들어간다. 지급 전에 이 사유의 행이 이미 있는지 본다.
// 문구를 바꾸면 **이미 받은 사람이 한 번 더 받는다** — 바꾸지 마라.
export const SIGNUP_GRANT_REASON = "가입 기본 지급";

// 길이를 모르거나 목록 밖이면 30초 값으로 본다 — 프로젝트의 target_seconds 는
// null 일 수 있고(사장님이 안 고른 경우) 그때 실제로 만들어지는 분량이 그 언저리다.
export function videoPrice(seconds, model) {
  const table = VIDEO_PRICE[priceModel(model)];
  const p = table[Number(seconds)];
  return typeof p === "number" ? p : table[30];
}

// 화면에 적는 말. 0 은 "0 크레딧"이 아니라 **무료**다 — 숫자만 적으면 값이 붙은 것처럼
// 읽힌다. 문구를 여기 두는 이유는 세 화면(③목소리·④이미지·⑤영상)이 같은 말을 해야 하기
// 때문이다. 화면마다 적으면 언젠가 한 곳만 바뀐다.
export function priceLabel(credits) {
  return credits > 0 ? `${credits} 크레딧` : "무료";
}

// priorCount = 이 컷에서 이미 한 재생성 횟수. 0 이면 첫 번째라 공짜다.
// 모르는 종류는 던진다 — 오타로 조용히 공짜가 되는 것이 이 표에서 가장 위험하다.
export function regenPrice(kind, priorCount, model) {
  const entry = REGEN_PRICE[kind];
  if (entry === undefined) throw new Error(`모르는 재생성 종류: ${kind}`);
  const p = typeof entry === "number" ? entry : entry[priceModel(model)];
  return Number(priorCount) >= FREE_REGEN_PER_CUT ? p : 0;
}

// 크레딧을 한 번도 못 받은 사장님이 **체험으로** 써 볼 수 있는 원가 한도(USD, 누적).
//
// 대화·브리핑·대본까지는 크레딧 없이 만들어 볼 수 있게 열어 뒀다 — 결과를 봐야 지갑을
// 연다. 대신 무제한이면 그대로 우리 돈이라 누적 상한을 건다. 편당 LLM 원가가 ~$0.06 이니
// 대본 여덟 편쯤이다.
//
// ★ env 가 아니라 여기 있는 이유: env 는 프로덕션에 넣는 것을 잊으면 조용히 기본값으로
// 돈다. 실제로 전역 예산 상한($20)이 그렇게 킬스위치가 될 뻔했다. 이건 가격 성격의
// 정책값이라 가격표에 둔다.
//
// ★ "하루 리셋"이 아니라 **누적**이다. 매일 리셋하면 영영 무료로 쓰는 사람이 생기고,
// 기간으로 재려면 sum_costs 에 기간 인자를 더해 **라이브 스키마를 다시 올려야 한다.**
export const FREE_TRIAL_USD = 0.5;
