// 광고 영상 큐 대기 상한 — 서버·화면이 같이 부르는 단 하나의 순수 함수 자리.
//
// ⚠️ **import 문을 두지 마라.** 화면(app/ads/[id]/page.js, "use client")이 이 파일을
//    그대로 불러온다 — 여기에 fs 를 쓰는 모듈을 끌어오면 번들이 깨진다
//    (lib/ad/models.js·lib/pricing.js 와 같은 규율).
//
// ⚠️ 왜 lib/ad/models.js 가 아니라 새 파일인가(Task 23, 2026-08-13) — 그 파일은 지금 다른
//    작업(모델 표를 fast → standard 로 바꾸고 해상도 축을 추가)이 동시에 손대고 있다.
//    이 파일은 `seconds` 숫자 하나만 받고 모델 표를 아예 읽지 않는다 — 두 작업이 안 부딪힌다.
//
// 실측(scripts/measure/probe-seedance.mjs) — 4초 영상 생성에 134초 걸렸다.
// 즉 **출력 1초당 ≈33.5초**다. 15초 영상이면 순수 생성만 ≈8.4분, 30초면 ≈16.75분이다.
// 여기에 fal 큐가 붐빌 때의 대기(접수 후에도 기다리는 시간)가 더 얹힌다.
//
// 이 상한을 넘기면 lib/ad/generate.js 가 던지고, lib/ad/pipeline.js 가 그것을 "실패"로
// 기록해 크레딧을 환불한다. 즉 **상한이 짧으면 다 만들어진 영상을 버리고 사장님에게
// 실패라고 말하는 것**이 된다 — 가장 나쁜 실패다. 반대로 길면 그냥 오래 기다릴 뿐이다.
// 그래서 넉넉한 쪽으로 치우친다: 실측 배율(33.5초/초)에 20% 안전 계수를 얹어 40초/초로,
// 큐 대기 몫으로 고정 3분을 더한다.
const MS_PER_OUTPUT_SECOND = 40_000; // 실측 33.5초/초 × 1.2 안전 계수
const QUEUE_SLACK_MS = 3 * 60_000; // fal 이 붐빌 때 접수 후 대기하는 몫

// 서버가 fal 큐 폴링을 포기하는 상한(ms) — lib/ad/generate.js 의 기본값.
// 길이에 비례한다: 15초와 30초가 같은 값을 받으면 30초 쪽에서 다 만들어진 영상을
// 상한 초과로 버리게 된다(실측상 30초가 15초의 두 배 가까이 걸린다).
export function adRenderTimeoutMs(seconds) {
  return QUEUE_SLACK_MS + Math.max(0, Number(seconds) || 0) * MS_PER_OUTPUT_SECOND;
}

// 화면(app/ads/[id]/page.js)이 폴링을 포기하는 상한(ms).
// ★ 서버 상한보다 **반드시 더 길어야** 한다 — 서버가 먼저 판정(완성 또는 실패로 환불)을
// 내려야 사장님이 정확한 답을 본다. 화면이 먼저 포기하면 서버는 계속 도는데 화면만
// "오래 걸린다"고 말하고 끝나버려, 나중에 실제로는 성공했는데도 사장님은 실패로 안다.
// 여유값(2분)은 두 폴링(화면 2초·서버 4초 간격)이 어긋나며 쌓이는 오차를 흡수한다.
const CLIENT_EXTRA_MS = 2 * 60_000;
export function adPollTimeoutMs(seconds) {
  return adRenderTimeoutMs(seconds) + CLIENT_EXTRA_MS;
}

// 화면에 "짐작할 수 있는 말"을 보여줄 때 쓰는 추정 분(分) — 상한이 아니다.
// 상한은 안전 계수·큐 여유를 얹은 "이 안에는 반드시 끝나거나 실패로 판정한다"이고,
// 이 값은 "보통 이 정도 걸린다"다. 상한 그대로 보여주면(15초에 13분) 실제(≈8분)보다
// 훨씬 오래 기다릴 것처럼 보여 사장님이 고장났다고 오해한다 — 그래서 안전 계수 없이
// 실측 배율만 쓴다.
export function adEstimatedMinutes(seconds) {
  const raw = Math.max(0, Number(seconds) || 0) * (134 / 4);
  return Math.max(1, Math.round(raw / 60));
}
