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
// 원가: 2.0 fast 720p $0.2419/s × 15초 = $3.63. 1크레딧 ≈ 원가 $0.06 → 60.5 →
// 올림해서 65(약 8% 여유). 올려 잡는 방향이 안전하다 — 내려 잡으면 팔수록 손해다.
export const AD_VIDEO_PRICE = { 15: 65 };

// 시나리오 다시 쓰기는 무료지만 무제한은 아니다. LLM 원가가 조금씩 샌다.
// MAX_REGEN_PER_CUT 과 같은 성격의 안전핀이다.
export const MAX_SCENARIO_TRIES = 20;

// 길이를 모르거나 목록 밖이면 15초 값으로 본다 — v1 은 15초뿐이다.
export function adVideoPrice(seconds) {
  const p = AD_VIDEO_PRICE[Number(seconds)];
  return typeof p === "number" ? p : AD_VIDEO_PRICE[15];
}
