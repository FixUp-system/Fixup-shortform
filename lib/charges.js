// 크레딧 청구 — 정가를 받고, 실패하면 되돌린다.
//
// 잔액은 저장하지 않는다: **충전 합계 − 청구 합계**가 곧 잔액이다.
// 두 장부 다 크레딧이라 단위가 안 섞인다(USD 원가는 cost_records 가 따로 진다).
//
// costs.js 가 이 모듈을 부른다(assertBudget). 이 모듈은 costs.js 를 부르지 않는다 —
// 순환 import 를 만들지 않으려고 스토어에서 직접 읽는다.
import { getStore } from "./store/index.js";
import { videoPrice, regenPrice, adVideoPrice } from "./pricing.js";

export class NoCredits extends Error {
  constructor(balance, price) {
    super(`크레딧이 모자라요 — 이 작업은 ${price} 크레딧인데 ${balance} 남았어요`);
    this.name = "NoCredits";
    this.balance = balance;
    this.price = price;
  }
}

// 잔액과 **청구 합계**를 한 번에 준다.
//
// 잔액만으로는 답할 수 없는 질문이 하나 있다: "이 사람은 돈을 낸 적이 있는가."
// 잔액 0 은 **갓 가입한 사람**과 **방금 결제해서 다 쓴 사람**이 똑같이 보이는 값이라,
// 그 둘을 가르려면 청구 장부를 따로 봐야 한다(assertBudget 의 체험 한도가 그것을 쓴다).
//
// ★ 합계를 여기서 함께 돌려주는 이유는 **DB 왕복을 안 늘리려고**다.
// 어차피 잔액을 내려면 sumCharges 를 부른다 — 부른 값을 버리지 않고 같이 준다.
export async function creditStateFor(userId) {
  const store = getStore();
  const [granted, charged] = await Promise.all([
    store.sumGrants(userId),
    store.sumCharges(userId),
  ]);
  return { balance: floorBalance(granted - charged), granted, charged };
}

// 잔액을 사장님이 보는 값으로 — **소수점 아래를 버린다.**
//
// ★ 규칙이 한 벌이라야 한다. 사장님 화면은 버림인데 백오피스가 날것을 그대로 더해
// "505.18000000000006" 을 보여 준 적이 있다(2026-08-13 실측) — 잔액을 내는 자리는
// 전부 이 함수를 지난다. 크레딧은 개수라 0.7 크레딧은 살 수 있는 것이 없다 —
// 화면에 "483.7 크레딧"이 뜨면 사장님은 못 쓰는 값을 가진 것으로 읽는다.
// 소수가 나오는 이유: 두 장부 컬럼이 numeric 이고, credit_grants 는 옛 amount_usd
// (달러라 소수였다)를 이름만 바꿔 쓴 자리다(db/schema.sql). 지금 입구(운영자 충전)는
// 정수만 받지만 옛 행은 그대로 남아 있다.
//
// ★ 올림·반올림이 아니라 버림인 이유는 **없는 크레딧을 만들지 않으려고**다. 음수 잔액도
// 같은 방향으로 내려간다(-49.5 → -50) — 빚을 깎아 주는 쪽으로 기울면 그것도 없는 값이다.
//
// granted·charged 는 **날것 그대로** 둔다. charged 는 "이 사람이 돈을 낸 적이 있는가"를
// 가리는 데 쓰이는데(costs.js 의 체험 한도), 버리면 0.5 가 0 이 되어 이미 쓴 사람이
// 체험 한도를 다시 받는다.
export function floorBalance(n) {
  return Math.floor(n);
}

export async function balanceFor(userId) {
  return (await creditStateFor(userId)).balance;
}

export async function assertCanAfford(userId, price) {
  const balance = await balanceFor(userId);
  if (balance < price) throw new NoCredits(balance, price);
}

// 영상 한 편. 자동 관통과 단계별이 같은 키를 쓰므로 **둘 중 먼저 온 쪽만** 받는다.
//
// 키에 **회차**가 들어간다. 실패해서 되돌려준 프로젝트를 다시 돌리면 새 회차가 열리고
// 그때는 다시 받는다 — 회차가 없으면 "환불 뒤 재시도"가 영원히 공짜가 된다.
export const videoKey = (projectId, attempt) => `video:${projectId}:${attempt}`;
export const refundKey = (projectId, attempt) => `refund:${projectId}:${attempt}`;

// 한 프로젝트가 열 수 있는 회차의 상한. 무한 루프 방지용 안전판일 뿐이다.
const MAX_VIDEO_ATTEMPTS = 100;

// 이 프로젝트의 영상 청구를 **장부에서만** 읽는다(프로젝트 문서가 아니라 —
// 돈이 오간 사실은 장부에만 있다). 회차를 1 부터 훑어 마지막 회차와,
// 그 회차가 아직 안 되돌려졌는지(=살아 있는 청구)를 함께 돌려준다.
async function readVideoLedger(projectId) {
  const store = getStore();
  let attempts = 0;
  let active = null;
  for (let n = 1; n <= MAX_VIDEO_ATTEMPTS; n++) {
    const charge = await store.findCharge(videoKey(projectId, n));
    if (!charge) break;
    attempts = n;
    const refunded = await store.findCharge(refundKey(projectId, n));
    active = refunded ? null : { charge, attempt: n };
  }
  return { attempts, active };
}

// "되돌려주지 않은 청구가 있는가" — 환불된 프로젝트는 false 다.
export async function alreadyChargedVideo(projectId) {
  return (await readVideoLedger(projectId)).active !== null;
}

// ★ model 은 lib/clip-limits.js 의 id 다("seedance-2.0"·"kling-v3"). 안 넘기면
//   lib/pricing.js 가 레거시(Kling) 표로 떨어뜨린다 — 옛 프로젝트가 그 자리다.
//   호출처는 modelIdForProject(project) 로 뽑아 넘긴다(폴백 규칙이 한 군데여야 한다).
export async function chargeVideo({ userId, projectId, seconds, model }) {
  const { attempts, active } = await readVideoLedger(projectId);
  if (active) return 0;                      // 이미 산 회차가 살아 있으면 또 받지 않는다
  const credits = videoPrice(seconds, model);
  // insertCharge 의 unique(idem_key) 가 마지막 방어선이다: 동시 클릭 둘이 같은 회차를
  // 계산해도 한쪽만 쓰이고 나머지는 false → 0 을 받는다.
  const wrote = await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: "video",
    credits, idem_key: videoKey(projectId, attempts + 1),
  });
  return wrote ? credits : 0;
}

// 유료 흐름 입구의 문 — **정가를 낸 프로젝트만 통과한다.**
//
// 자동 관통(/auto)과 단계별 세 입구(/images·/clips·/voice)가 전부 이것을 부른다.
// 규칙이 한 곳에 있어야 하는 이유: 셋 중 하나만 문을 안 달면 그 문으로 다 새어 나간다.
// 실제로 그랬다 — /clips·/voice 를 열어 두었더니, 실패해서 **환불받은** 프로젝트
// (그림은 그대로 남는다)로 클립을 순지불 0 에 살 수 있었다. `balance < 0` 그물은
// 잔액이 음수가 아니라 못 잡는다.
//
// 이미 살아 있는 청구가 있으면 0 을 돌려주고 지나간다(정가에 포함된 정상 흐름).
// 없으면 지금 받는다 — 못 내면 NoCredits 를 던지고, 라우트가 402 로 옮긴다.
export async function requireVideoCharge({ userId, projectId, seconds, model }) {
  if (await alreadyChargedVideo(projectId)) return 0;
  await assertCanAfford(userId, videoPrice(seconds, model));
  return chargeVideo({ userId, projectId, seconds, model });
}

// 재생성 청구의 멱등키. 회차가 들어가므로 같은 회차를 두 번 청구하지 않는다.
const regenKey = (kind, projectId, idx, priorCount) =>
  `regen_${kind}:${projectId}:${idx}:${priorCount}`;

// 재생성. idx·회차가 키에 들어가 같은 회차를 두 번 청구하지 않는다.
// priorCount 는 그 컷에서 이미 한 횟수 — 첫 회(0)는 공짜다.
//
// ★ priorCount 를 빠뜨리면 regenPrice 가 조용히 0(공짜)을 준다 —
//   undefined·NaN 은 여기서 던져서 막는다. 0 은 정당한 값이라 그대로 통과한다.
//   pricing.js 가 모르는 kind 를 던지는 것과 같은 원칙이다.
//
// ★ 클립 재생성만 모델을 탄다(Seedance 25 · Kling 8). 안 넘기면 조용히 싼 쪽이 청구된다.
export async function chargeRegen({ userId, projectId, kind, idx, priorCount, model }) {
  if (!Number.isInteger(priorCount) || priorCount < 0) {
    throw new Error(`재생성 회차(priorCount)가 0 이상의 정수여야 해요: ${priorCount}`);
  }
  const credits = regenPrice(kind, priorCount, model);
  if (credits === 0) return 0;
  const wrote = await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: `regen_${kind}`,
    credits, idem_key: regenKey(kind, projectId, idx, priorCount),
  });
  return wrote ? credits : 0;
}

// 재생성이 실패했을 때. 자동 관통과 **같은 정책**이다 — 못 준 것은 받지 않는다.
//
// 청구를 성공 뒤로 미루지 않고 되돌리는 쪽을 고른 이유: 청구는 유료 흐름이 시작되기
// **전에** 해야 한다(그래야 잔액 없이 fal 이 나가지 않는다). 성공 확인 뒤에 받으면
// 그 순서가 뒤집힌다.
//
// 환불 키가 원 청구 키를 감싸므로(refund_regen_...) 회차별로 정확히 한 번만 돌아가고,
// 영상 환불 키(refund:<pid>:<n>)와도 겹치지 않는다.
//
// ★ 모델을 받지 않는다 — **받으면 안 된다.** 돌려줄 값을 가격표에서 다시 계산하지 않고
//   원 청구 행(charge.credits)에서 읽기 때문이다. 다시 계산하면 청구는 25(Seedance)를
//   받고 환불은 8(모델을 안 넘긴 호출)을 돌려주는 갈림이 생겨 사장님이 17 을 잃는다.
//   장부가 값을 쥐고 있으니 규칙을 두 번 적지 않는다. (refundVideo 도 같은 방식이다.)
export async function refundRegen({ projectId, kind, idx, priorCount }) {
  const key = regenKey(kind, projectId, idx, priorCount);
  const charge = await getStore().findCharge(key);
  if (!charge) return;                       // 공짜 회차였거나 애초에 안 받았다
  // 소유자는 원 청구 행에서 가져온다 — refundVideo 와 같은 규칙(어긋난 환불을 원천 봉쇄).
  await getStore().insertCharge({
    user_id: charge.user_id, project_id: projectId, kind: `refund_regen_${kind}`,
    credits: -Number(charge.credits), idem_key: `refund_${key}`,
  });
}

// 자동 관통이 실패로 끝났을 때. 지우지 않고 **음수 행**으로 되돌린다 —
// 장부는 무슨 일이 있었는지 남기는 것이 일이다.
//
// 살아 있는 회차만 되돌린다. 두 번 불러도 첫 번째에서 그 회차가 죽으므로 두 번째는 그냥 나간다.
// userId 는 받되 환불 행의 주인은 **원 청구 행의 주인**이다 — 소유가 어긋난 환불
// (A 가 낸 것을 B 계정으로 돌려주는 일)을 원천에서 막는다.
export async function refundVideo({ userId, projectId }) {   // eslint-disable-line no-unused-vars
  const { active } = await readVideoLedger(projectId);
  if (!active) return;                       // 산 적이 없거나 이미 되돌렸으면 할 일이 없다
  await getStore().insertCharge({
    user_id: active.charge.user_id, project_id: projectId, kind: "refund",
    credits: -Number(active.charge.credits), idem_key: refundKey(projectId, active.attempt),
  });
}

// ── 광고 경로(lib/ad) ────────────────────────────────────────────────────
// 기존 video 장부와 **이름공간이 다르다**(`ad:` 대 `video:`). 같은 프로젝트 id 라도
// 서로를 "이미 샀다"로 보지 않는다 — 한 문서가 두 종류일 수 없으므로 실무상 안 겹치지만,
// 키를 가르는 비용이 0 이라 가른다.
export const adKey = (projectId, attempt) => `ad:${projectId}:${attempt}`;
export const adRefundKey = (projectId, attempt) => `refund_ad:${projectId}:${attempt}`;

const MAX_AD_ATTEMPTS = 100;

async function readAdLedger(projectId) {
  const store = getStore();
  let attempts = 0;
  let active = null;
  for (let n = 1; n <= MAX_AD_ATTEMPTS; n++) {
    const charge = await store.findCharge(adKey(projectId, n));
    if (!charge) break;
    attempts = n;
    const refunded = await store.findCharge(adRefundKey(projectId, n));
    active = refunded ? null : { charge, attempt: n };
  }
  return { attempts, active };
}

export async function alreadyChargedAd(projectId) {
  return (await readAdLedger(projectId)).active !== null;
}

// ★ Task 21 — model 을 받는다. adVideoPrice(seconds, model, resolution) 로 그대로
//   넘긴다: model·resolution 이 생략되면(옛 문서) pricing.js 가 기본 모델(standard)·720p
//   값으로, 값이 있는데 모르면 던진다 — 그 판정을 여기서 다시 하지 않는다(한 곳에 두는
//   lib/pricing.js 규율).
//
// ★ Task 24 — resolution 을 받는다(선택 인자). 안 넘기면 adVideoPrice 가 720p 로 본다.
// ★ Task 25 — lib/ad/pipeline.js 가 이제 project.settings.resolution 을 그대로 넘긴다
//   (Task 24 때는 그 파일이 잠겨 있어 못 고쳤다). lib/ad/generate.js 도 같은 값을 fal
//   요청 몸통에 싣는다 — 게이트(app/api/ads/[id]/render/route.js 의 잔액 검사)·실제
//   청구(여기)·실제 생성물(lib/ad/generate.js) 셋이 이제 같은 project.settings.resolution
//   을 본다.
//
// ★ openNewAttempt — 기존 video 경로와 "살아 있는 청구"의 뜻이 다르다.
// 기존 6단계(chargeVideo)는 정가 하나가 여러 단계(목소리·이미지·클립)를 덮으므로
// 살아 있는 청구가 있으면 통과가 맞다. 광고 경로는 한 번 누를 때마다 영상 한 편이
// 통째로 구워지므로, **성공한 회차는 소진된 것**으로 봐야 한다 — 그런데 성공은
// refundAd 를 안 돌리므로 장부만 보면 그 청구가 영원히 "살아 있다"(readAdLedger).
// 그래서 "이미 영상을 냈다(=이 청구는 소진됐다)"는 이 함수가 알 수 없는 사실을
// 부르는 쪽이 프로젝트 문서(lib/ad/attempt.js 의 hasRenderedAdVideo)로 판정해 넘긴다.
export async function chargeAd({ userId, projectId, seconds, model, resolution, openNewAttempt = false }) {
  const { attempts, active } = await readAdLedger(projectId);
  if (active && !openNewAttempt) return 0;
  const credits = adVideoPrice(seconds, model, resolution);
  const wrote = await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: "ad_video",
    credits, idem_key: adKey(projectId, attempts + 1),   // 회차가 는다 — 새 청구 행이다
  });
  return wrote ? credits : 0;
}

// 살아 있는 회차만 되돌린다. 환불 행의 주인은 **원 청구 행의 주인이다** —
// 소유가 어긋난 환불을 원천에서 막는다(refundVideo 와 같은 규칙).
export async function refundAd({ projectId }) {
  const { active } = await readAdLedger(projectId);
  if (!active) return;
  await getStore().insertCharge({
    user_id: active.charge.user_id, project_id: projectId, kind: "refund_ad",
    credits: -Number(active.charge.credits), idem_key: adRefundKey(projectId, active.attempt),
  });
}
