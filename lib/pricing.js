// 크레딧 가격표 — 이 파일이 유일한 진실의 원천이다.
//
// 값은 2026-08-06 실측 원가(원장 63건, 전부 진짜 지출)에서 뽑았다:
//   클립 $0.420/컷 · 이미지 $0.080/컷 · 나머지(LLM) 편당 ~$0.06
//   → 편당 원가 ≈ $0.06 + 컷당 $0.50 × 컷 수. 30초(6컷) ≈ $3.06
// 1크레딧 ≈ $0.06 원가로 잡아 30초 = 50 크레딧. 마진은 없다 —
// 지금 크레딧은 사실상 사용 한도이고, 판매가는 결제를 붙일 때 정한다.
//
// ★ 이 값들은 바뀐다. 바뀔 때 고칠 자리가 여기 하나여야 한다 —
//   가격 숫자를 라우트·화면에 흘리지 마라.
//
// ★ 이 파일은 화면("use client")에서도 import 된다. import 문을 두지 마라 —
//   순수 데이터·순수 함수만 있어야 번들이 깨지지 않는다.

// 목표 길이(초) → 크레딧. 원가가 길이(=컷 수)에 비례하므로 가격도 그렇다.
export const VIDEO_PRICE = { 15: 25, 30: 50, 45: 75, 60: 100 };

// 컷 하나를 다시 만들 때. 실측 원가 이미지 $0.08 · 클립 $0.42 · 목소리 $0.002 를 올림했다.
export const REGEN_PRICE = { image: 2, clip: 8, voice: 1 };

// 컷마다 이만큼은 공짜다 — "한 번은 다시 해 볼 수 있게".
export const FREE_REGEN_PER_CUT = 1;

// 컷마다 이 횟수를 넘으면 아예 못 한다(돈을 내도). lib/pipeline.js 의 세 regen 이 락 안에서
// 세는 상한과 **같은 값이어야 한다** — 라우트가 청구 앞에서 먼저 보고 막는다.
// 숫자가 두 군데로 갈리면 "받고 나서 400" 이 다시 생긴다(실제로 그랬다).
export const MAX_REGEN_PER_CUT = 3;

// 백오피스 [크레딧 넣기] 의 기본값(운영자가 고칠 수 있다).
export const DEFAULT_GRANT = 500;

// 길이를 모르거나 목록 밖이면 30초 값으로 본다 — 프로젝트의 target_seconds 는
// null 일 수 있고(사장님이 안 고른 경우) 그때 실제로 만들어지는 분량이 그 언저리다.
export function videoPrice(seconds) {
  const p = VIDEO_PRICE[Number(seconds)];
  return typeof p === "number" ? p : VIDEO_PRICE[30];
}

// 화면에 적는 말. 0 은 "0 크레딧"이 아니라 **무료**다 — 숫자만 적으면 값이 붙은 것처럼
// 읽힌다. 문구를 여기 두는 이유는 세 화면(③목소리·④이미지·⑤영상)이 같은 말을 해야 하기
// 때문이다. 화면마다 적으면 언젠가 한 곳만 바뀐다.
export function priceLabel(credits) {
  return credits > 0 ? `${credits} 크레딧` : "무료";
}

// priorCount = 이 컷에서 이미 한 재생성 횟수. 0 이면 첫 번째라 공짜다.
// 모르는 종류는 던진다 — 오타로 조용히 공짜가 되는 것이 이 표에서 가장 위험하다.
export function regenPrice(kind, priorCount) {
  const p = REGEN_PRICE[kind];
  if (typeof p !== "number") throw new Error(`모르는 재생성 종류: ${kind}`);
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

// ── 광고 경로(lib/ad) ────────────────────────────────────────────────────
// 표를 따로 둔다. 기존 VIDEO_PRICE 와 섞으면 같은 "15초"가 두 뜻이 된다 —
// 기존은 컷 여러 개를 합친 15초이고, 이쪽은 Seedance 클립 하나다. 원가가 다르다.
//
// ★ Task 21 — 길이가 모델에 딸린다(2.0 은 15초 하나, 2.5 는 15·30초 둘).
//   그래서 표가 모델 id → 길이 → 크레딧의 2단이다.
//
// ★ Task 24 — 해상도가 셋째 축이 됐다. 칸(모델×길이)의 값이 **숫자**면 해상도 무관
//   단일가(지금은 fast 티어 하나 — 아래 "판단" 참고), **객체**(해상도 → 크레딧)면
//   해상도별로 갈린다. 두 모양을 다 받는 이유는 tests/ad-pipeline.test.js(다른
//   태스크가 병행 중이라 건드릴 수 없다)가 `AD_VIDEO_PRICE["seedance-2.0-fast"][15]`를
//   **숫자 그대로** 빼 쓰기 때문이다 — fast 칸을 객체로 바꾸면 그 파일이 깨진다.
//
//   키는 lib/ad/models.js 의 AD_MODELS[].id·seconds·resolutions 와 **같아야 한다** —
//   이 파일은 화면도 import 하므로 models.js 를 import 해 대조할 수 없다(아래 규율 참고).
//   tests/pricing.test.js 가 AD_MODELS 를 훑어 이 표와 어긋나면 실패하게 대신 대조한다.
//
// 원가 근거(2026-08-13, calc = 계산값·2.5 와 2.0 480p·1080p 는 실측 아니다):
//   2.0-fast   720p $0.2419/s 고정(실측)         × 15초 = $3.63  → 65 크레딧(기존값 유지)
//   2.0        720p $0.3034/s(calc, t2v 값)      × 15초 = $4.55  → 80 크레딧
//   2.0        1080p $0.682/s(calc)              × 15초 = $10.23 → 175 크레딧
//   2.0        480p $0.1348/s(calc, 픽셀비 추정) × 15초 = $2.02  → 35 크레딧
//   2.5        720p $0.4622/s(calc, 토큰식)      × 15초 = $6.93  → 120 크레딧(기존값 유지)
//   2.5        720p $0.4622/s(calc)              × 30초 = $13.87 → 240 크레딧(기존값 유지)
//   2.5        480p $0.2056/s(calc, 토큰식)      × 15초 = $3.08  → 55 크레딧
//   2.5        480p $0.2056/s(calc)              × 30초 = $6.17  → 110 크레딧
// 1크레딧 ≈ 원가 $0.06 로 올림(5 크레딧 단위로 반올려 올린다 — 기존 65·120·240 값과
// 같은 자리수라 표가 어수선하지 않다). 올려 잡는 방향이 안전하다 — 내려 잡으면
// 팔수록 손해다.
export const AD_VIDEO_PRICE = {
  "seedance-2.0": { 15: { "480p": 35, "720p": 80, "1080p": 175 } },
  // ⚠️ 이 칸은 숫자다(객체가 아니다) — 위 "Task 24" 주석 참고. 바꾸지 마라.
  "seedance-2.0-fast": { 15: 65 },
  "seedance-2.5": {
    15: { "480p": 55, "720p": 120 },
    30: { "480p": 110, "720p": 240 },
  },
};

// pricing.js 는 lib/ad/models.js 를 import 하지 않는다(화면 번들 규율) — 그래서 기본
// 모델 id 를 문자열로 다시 적는다. lib/ad/models.js 의 DEFAULT_AD_MODEL 과 **같은
// 값이어야 한다**(tests/pricing.test.js 가 대조한다).
const DEFAULT_AD_MODEL_ID = "seedance-2.0";

// 마찬가지로 lib/ad/models.js 의 DEFAULT_AD_RESOLUTION 을 문자열로 다시 적는다 — 같은
// import-금지 규율(tests/pricing.test.js 가 대조한다).
const DEFAULT_AD_RESOLUTION = "720p";

// 시나리오 다시 쓰기는 무료지만 무제한은 아니다. LLM 원가가 조금씩 샌다.
// MAX_REGEN_PER_CUT 과 같은 성격의 안전핀이다.
export const MAX_SCENARIO_TRIES = 20;

// modelId 를 **생략하면**(undefined/null — 옛 호출부·옛 문서) 기본 모델(2.0 standard) 값으로
// 본다. 화면(app/ads/[id]/page.js, Task 23 이 쓰는 중이라 이번 태스크에서 못 건드린다)도
// 이 1-인자(또는 2-인자, resolution 생략) 호출로 가격표를 읽는다 — 여기서 던지면 그 화면이
// 깨진다. 그래서 "생략"은 안전하게 받는다.
//
// ★★ 그러나 **뭔가를 줬는데 표에 없으면 던진다.** regenPrice 가 모르는 종류에 던지는
// 것과 같은 원칙이다 — 모르는 모델·해상도가 조용히 싼 값으로 떨어지면 그 차액이 그대로
// 우리 돈이다. "생략"과 "오타"를 가르는 이유: 생략은 옛 문서의 정상 상태이지만, 값이
// 있는데 표에 없다는 것은 라우트의 닫힌 목록 검사(app/api/ads/route.js 의 isAdModel·
// isAdResolution)를 어떻게든 피했거나 호출부가 버그로 잘못된 문자열을 넘겼다는 뜻이라
// 조용히 넘기면 안 된다. 해상도에도 **같은 원칙**을 그대로 적용한다.
export function adVideoPrice(seconds, modelId, resolution) {
  const key = modelId == null ? DEFAULT_AD_MODEL_ID : modelId;
  const table = AD_VIDEO_PRICE[key];
  if (!table) throw new Error(`모르는 광고 모델이에요: ${modelId}`);

  // 길이 — 그 모델의 목록 밖이면 **가장 비싼 값**으로 본다(기존 규칙 그대로). 싼 쪽으로
  // 떨어지면 원가보다 적게 청구할 위험이 있다(videoPrice 는 "중간값"으로 떨어뜨리지만,
  // 여기는 모델마다 길이가 최대 둘뿐이라 "비싼 쪽"이 더 안전하다).
  let cell = table[Number(seconds)];
  if (cell === undefined) {
    const knownSeconds = Object.keys(table).map(Number);
    cell = table[Math.max(...knownSeconds)];
  }

  // 해상도 무관(칸이 숫자) — 해상도별 문서가 없는 모델(지금은 fast 하나)은 단일가라
  // resolution 인자를 그냥 무시하고 그 값을 돌려준다.
  if (typeof cell === "number") return cell;

  // 해상도별(칸이 객체) — 생략하면 720p(옛 문서·옛 호출부와 같은 값), 값이 있는데
  // 그 모델·길이가 안 받는 해상도면 던진다.
  const resKey = resolution == null ? DEFAULT_AD_RESOLUTION : resolution;
  const p = cell[resKey];
  if (typeof p === "number") return p;
  if (resolution == null) {
    // 표의 모든 칸에 기본 해상도(720p) 값이 있어야 한다는 내부 불변식이 깨졌다 — 그래도
    // 안 죽게 가장 비싼 값으로 방어한다(위 "길이" 주석과 같은 안전한 방향).
    return Math.max(...Object.values(cell));
  }
  throw new Error(`이 모델은 그 해상도를 지원하지 않아요: ${resolution}`);
}
