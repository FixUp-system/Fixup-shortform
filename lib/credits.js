// 크레딧 — 잔액은 저장하지 않는다. **충전 합계 − 쓴 합계**가 곧 잔액이다.
//
// 이 결정이 "쓴 만큼 차감"과 "두 입구(자동 관통·단계별)가 같은 자를 쓴다"를 공짜로
// 성립시킨다. 유료 호출은 전부 cost_records 에 남고 request_id 가 멱등키라
// 이중 차감도 이미 막혀 있다.
//
// costs.js 가 이 모듈을 부르고(limitUser), 이 모듈은 costs.js 를 부르지 않는다 —
// 순환 import 를 만들지 않으려고 스토어에서 직접 읽는다.
import { getStore } from "./store/index.js";

// 편수 표시용 기준가. 30초 한 편 실측이 $2.59(클립이 81%)였다.
// env 로 두는 이유는 모델·길이가 바뀌면 이 값도 바뀌기 때문이다. 매번 읽는다 —
// 모듈 로드 시점에 굳히면 테스트가 값을 못 바꾼다(costs.js 의 상한들과 같은 규칙).
export function perVideoUsd() {
  const n = Number(process.env.SHOTFORM_PER_VIDEO_USD ?? 2.59);
  return Number.isFinite(n) && n > 0 ? n : 2.59;
}

export class NoCredits extends Error {
  constructor(balance) {
    super("크레딧이 모자라요 — 운영자에게 문의해 주세요");
    this.name = "NoCredits";
    this.balance = balance;
  }
}

export async function balanceFor(userId) {
  const store = getStore();
  const [granted, spent] = await Promise.all([
    store.sumGrants(userId),
    store.sumCosts({ actor: userId }),
  ]);
  return granted - spent;
}

// 화면에 보이는 숫자. 내림인 이유는 "3편 남았어요"를 보고 눌렀는데 두 편 반이어서
// 중간에 멈추는 일이 없어야 하기 때문이다. 음수(조금 초과한 상태)는 0 으로 보여준다.
export function videosLeft(balanceUsd) {
  const n = Math.floor((Number(balanceUsd) || 0) / perVideoUsd());
  return n > 0 ? n : 0;
}

// 시작 게이트. 유료 흐름을 **시작하기 전에** 부른다.
//
// 자동 관통은 한 번에 한 편치가 나가고 중간에 사람이 보고 있지 않다 — 잔액이 모자란 채
// 시작하면 돈만 나가고 영상이 없다. 그래서 need = 한 편치를 요구한다.
// 단계별은 컷마다 끊겨도 사장님이 화면에서 보고 있으므로 need 를 작게 잡는다.
export async function assertCanStart(userId, { need }) {
  const balance = await balanceFor(userId);
  if (balance < need) throw new NoCredits(balance);
}
