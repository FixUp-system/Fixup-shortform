// 크레딧 청구 — 정가를 받고, 실패하면 되돌린다.
//
// 잔액은 저장하지 않는다: **충전 합계 − 청구 합계**가 곧 잔액이다.
// 두 장부 다 크레딧이라 단위가 안 섞인다(USD 원가는 cost_records 가 따로 진다).
//
// costs.js 가 이 모듈을 부른다(assertBudget). 이 모듈은 costs.js 를 부르지 않는다 —
// 순환 import 를 만들지 않으려고 스토어에서 직접 읽는다.
import { getStore } from "./store/index.js";
import { videoPrice, regenPrice } from "./pricing.js";

export class NoCredits extends Error {
  constructor(balance, price) {
    super(`크레딧이 모자라요 — 이 작업은 ${price} 크레딧인데 ${balance} 남았어요`);
    this.name = "NoCredits";
    this.balance = balance;
    this.price = price;
  }
}

export async function balanceFor(userId) {
  const store = getStore();
  const [granted, charged] = await Promise.all([
    store.sumGrants(userId),
    store.sumCharges(userId),
  ]);
  return granted - charged;
}

export async function assertCanAfford(userId, price) {
  const balance = await balanceFor(userId);
  if (balance < price) throw new NoCredits(balance, price);
}

// 영상 한 편. 자동 관통과 단계별이 같은 키를 쓰므로 **둘 중 먼저 온 쪽만** 받는다.
export const videoKey = (projectId) => `video:${projectId}`;

export async function alreadyChargedVideo(projectId) {
  return (await getStore().findCharge(videoKey(projectId))) !== null;
}

export async function chargeVideo({ userId, projectId, seconds }) {
  const credits = videoPrice(seconds);
  const wrote = await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: "video",
    credits, idem_key: videoKey(projectId),
  });
  return wrote ? credits : 0;   // 이미 산 프로젝트면 0
}

// 재생성. idx·회차가 키에 들어가 같은 회차를 두 번 청구하지 않는다.
// priorCount 는 그 컷에서 이미 한 횟수 — 첫 회(0)는 공짜다.
// ★ priorCount 를 빠뜨리면 regenPrice 가 조용히 0(공짜)을 준다. 호출부는 항상 명시적으로 넘긴다.
export async function chargeRegen({ userId, projectId, kind, idx, priorCount }) {
  const credits = regenPrice(kind, priorCount);
  if (credits === 0) return 0;
  const wrote = await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: `regen_${kind}`,
    credits, idem_key: `regen_${kind}:${projectId}:${idx}:${priorCount}`,
  });
  return wrote ? credits : 0;
}

// 자동 관통이 실패로 끝났을 때. 지우지 않고 **음수 행**으로 되돌린다 —
// 장부는 무슨 일이 있었는지 남기는 것이 일이다.
export async function refundVideo({ userId, projectId }) {
  const charge = await getStore().findCharge(videoKey(projectId));
  if (!charge) return;                       // 산 적이 없으면 되돌릴 것도 없다
  await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: "refund",
    credits: -Number(charge.credits), idem_key: `refund:${projectId}`,
  });
}
