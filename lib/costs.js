// 비용 원장 — 행 저장소(lib/store) 위에 얹는다.
//
// 예전에는 data/costs.json 한 파일을 통째로 읽고 통째로 다시 썼다. 그러면 동시에
// 두 호출이 기록할 때 나중 쓰기가 앞의 것을 덮고(락이 필요해지고), 합계도 매번
// 파일 전체를 훑어야 했다. 행 하나씩 넣고 합계는 저장소가 재는 지금 구조에는
// 그 두 문제가 없다.
import { fakeFal } from "./fake";
import { getStore } from "./store/index.js";
import { currentActor } from "./actor.js";
// 사용자 축의 자(尺)는 **크레딧 잔액**이다. charges.js 는 costs.js 를 부르지 않아 순환이 안 생긴다.
import { balanceFor } from "./charges.js";

// 모델별 예상 단가. fal 대시보드 실비용으로 검증 후 갱신할 것.
// key는 엔드포인트 앞부분(prefix) 매칭 — 더 구체적인 prefix를 위에 둘 것.
//
// 단위가 둘이다 — 영상은 초당(perSec), 음성은 글자당(per1k, 1000자 기준).
// unit 을 생략하면 "sec" 으로 본다(기존 호출부는 초를 넘긴다).
// 이미지는 장당인데 perSec 자리를 그대로 쓴다 — amount 에 장 수를 넘기면 값이 맞는다.
const PRICE_TABLE = [
  { prefix: "fal-ai/veo3.1/fast", perSec: 0.15 },
  { prefix: "fal-ai/veo3.1", perSec: 0.4 },
  // Kling v3 Standard i2v 는 오디오를 끄면 ＄0.084/s 다(켜면 ＄0.126). 끄는 것이
  // lib/clip-limits.js 의 프로필로 코드 보장이라 여기 값은 audio-off 다.
  // v3 보다 위에 둔다 — "fal-ai/kling-video/v3" 가 standard 도 삼킨다.
  { prefix: "fal-ai/kling-video/v3/standard/image-to-video", perSec: 0.084 },
  { prefix: "fal-ai/kling-video/v3", perSec: 0.126 },
  { prefix: "fal-ai/kling-video", perSec: 0.05 },
  // 음성은 영상보다 위에 — "fal-ai/minimax"가 speech 도 삼킨다
  { prefix: "fal-ai/minimax/speech", unit: "chars", per1k: 0.1 },
  { prefix: "fal-ai/minimax", perSec: 0.05 },
  // LTX — 저비용 테스트용. /fast 계열이 $0.04/s, 일반 2.3이 $0.06/s.
  // 2.3을 2보다 위에 둬야 한다 ("fal-ai/ltx-2"가 "fal-ai/ltx-2.3"도 삼킨다).
  { prefix: "fal-ai/ltx-2.3/text-to-video/fast", perSec: 0.04 },
  { prefix: "fal-ai/ltx-2.3/image-to-video/fast", perSec: 0.04 },
  { prefix: "fal-ai/ltx-2.3", perSec: 0.06 },
  { prefix: "fal-ai/ltx-2", perSec: 0.04 },
  // 합성 — merge-videos 는 $0 으로 표기돼 있다(2026-07-27 확인, 실청구 미검증)
  { prefix: "fal-ai/ffmpeg-api/merge-videos", perSec: 0 },
  { prefix: "fal-ai/ffmpeg-api/merge-audio-video", perSec: 0.0002 },
  { prefix: "fal-ai/ffmpeg-api/merge-audios", perSec: 0.0002 },
  // TTS — 글자당
  { prefix: "fal-ai/elevenlabs/tts", unit: "chars", per1k: 0.05 },
  { prefix: "fal-ai/chatterbox", unit: "chars", per1k: 0.025 },
  // 이미지 — 장당. "fal-ai/nano-banana/edit"(레퍼런스 사진이 있을 때)도 이 prefix 에 걸린다.
  //
  // 구글 직접 요금은 토큰 과금이다(nano-banana-2-lite 기준 이미지 출력 $37.50/1M —
  // 1024×1024 한 장이 1290토큰이면 ≈$0.048). 우리가 부르는 것은 fal 이고, fal 은 그것을
  // 장당 고정가로 재포장해 판다. 그래서 여기 값은 fal 의 장당 가격이다.
  //
  // ⚠️ nano-banana-2 를 위에 둔다 — "fal-ai/nano-banana" 가 "-2" 도 삼킨다.
  //    $0.08 은 fal 대시보드 실청구로 확인했다(2026-07-30, 비교 8건).
  //    구형은 실청구가 $0.0398 이었다 — 아래 $0.04 는 올려 잡은 값이고 그 방향이 안전하다
  //    (예산 가드가 보수적으로 돈다). 내려 잡으면 가드가 예산을 넘기고도 통과시킨다.
  { prefix: "fal-ai/nano-banana-2", perSec: 0.08 },
  { prefix: "fal-ai/nano-banana", perSec: 0.04 },
];
const DEFAULT_PER_SEC = 0.1;

// 비용을 낸 주체. 요청 경계에서 세운 actor 컨텍스트에서 꺼낸다.
// 이름과 시그니처를 그대로 둬서 호출부 7곳이 안 바뀐다.
export function costActor() {
  return currentActor();
}

// amount 는 단위에 따라 초(sec) 또는 글자 수(chars)다.
//
// 센트로 반올림하지 않는다. 그러면 소액 호출이 통째로 0원이 된다 —
// 실제로 TTS 네 건($0.002씩)이 전부 $0 으로 기록돼, 소리가 나왔는데도 쓴 돈이 없는 것처럼
// 보였다. 싼 항목은 많이 부를수록 총합이 실제와 벌어진다.
// 6자리는 100만분의 1달러라 어떤 단가에서도 0으로 뭉개지지 않는다(LLM 쪽과 같은 자릿수).
const round6 = (n) => Math.round(n * 1e6) / 1e6;

export function estimateCost(endpoint, amount) {
  const entry = PRICE_TABLE.find((p) => endpoint.startsWith(p.prefix));
  const n = Number(amount) || 0;
  if (!entry) return round6(DEFAULT_PER_SEC * n);
  const raw = entry.unit === "chars" ? (entry.per1k * n) / 1000 : entry.perSec * n;
  return round6(raw);
}

// LLM 은 입력·출력 단가가 달라 PRICE_TABLE(단일 단가)에 담기지 않는다.
// 그래서 여기서 따로 잰다 — usage 는 OpenAI 응답이 그대로 돌려준다.
//
// ⚠️ 단가는 문서 기준 추정이고 실청구로 검증하지 않았다(fal 단가표와 같은 처지다).
//    gpt-4o: 입력 $2.50/1M · 출력 $10.00/1M
const LLM_PRICE = {
  "gpt-4o": { in: 2.5 / 1e6, out: 10 / 1e6 },
};
const LLM_DEFAULT = { in: 2.5 / 1e6, out: 10 / 1e6 };

export function estimateLlmCost(model, usage) {
  const p = LLM_PRICE[model] || LLM_DEFAULT;
  const inTok = Number(usage?.prompt_tokens) || 0;
  const outTok = Number(usage?.completion_tokens) || 0;
  // 센트 단위로 자르면 한 호출이 0원이 되어 총합이 실제보다 작아진다 — 6자리까지 남긴다
  return Math.round((inTok * p.in + outTok * p.out) * 1e6) / 1e6;
}

// 예산 가드 — 기록만으로는 아무것도 막지 못한다.
// 30초 한 편이 약 $2 라 해도 되돌리기·재생성이 얽히면 한 프로젝트에서 훨씬 더 나간다.
export class BudgetExceeded extends Error {
  constructor(spent, limit, scope) {
    // 사용자 축은 "상한"이 아니라 "잔액"이고 단위도 USD 가 아니라 크레딧이다 —
    // 같은 문구를 쓸 수 없다. 전역·프로젝트(회사 안전핀) 문구는 글자 그대로 둔다.
    super(
      scope === "user"
        ? "크레딧이 모자라요 — 잔액이 바닥났어요"
        : `예산 상한($${limit})에 닿아 멈췄어요 — 지금까지 $${spent.toFixed(2)} 썼어요`
    );
    this.name = "BudgetExceeded";
    this.scope = scope; // "total" | "user" | "project"
  }
}

// 상한은 매번 env 에서 읽는다 — 모듈 로드 시점에 굳히면 테스트가 값을 못 바꾼다
// 전역 — 우리 지갑의 마지막 안전핀. 30초 한 편 원가가 ~$3 이라 $20 이면 전 사용자 합계
// **여섯 편**에서 서비스가 멎는다(실제로 그 값이었다). 프로덕션 env 에 넣는 것을 잊어도
// 곧바로 서비스가 죽지 않을 값으로 올린다 — 그래도 폭주는 여기서 멈춘다.
export function limitTotal() {
  return Number(process.env.SHOTFORM_BUDGET_TOTAL_USD ?? 300);
}

// 프로젝트 — ★ 이것은 **요금 상한이 아니라 폭주 방어**다. 요금은 크레딧이 맡는다
// (정가 + 재생성 청구). 여기서 막아야 하는 것은 파이프라인이 무한 루프에 빠져 한
// 프로젝트가 돈을 태우는 경우뿐이다.
//
// 그래서 **정상 사용을 막으면 안 된다.** 옛 값 $5 는 60초 원가(~$6.06)조차 못 견뎌
// 사장님이 100크레딧을 내고 산 영상이 중간에 죽었다. 재생성(컷당 최대 3회)까지 얹으면
// ~$24 라, 여유를 두어 $30 이다. 근거는 tests/budget-limits.test.js 가 지킨다.
export function limitProject() {
  return Number(process.env.SHOTFORM_BUDGET_PROJECT_USD ?? 30);
}

export async function spentTotal() {
  return getStore().sumCosts({});
}

export async function spentForProject(projectId) {
  return getStore().sumCosts({ projectId });
}

// fal 로 나가기 직전에 부른다. 호출한 뒤에 재는 것이 아니라 나가기 전에 막는다 —
// 이번 호출의 예상 비용을 더한 값으로 판정하는 이유다.
//
// 예전에는 원장 전체 파일을 읽어 JS 에서 더했다(O(n), 매 유료 호출마다).
// 이제는 합계 두 번이라 원장이 커져도 같은 값이 든다.
export async function assertBudget({ projectId, endpoint, amount }) {
  if (fakeFal()) return; // 가짜 모드는 0원이라 잴 것이 없다
  const cost = estimateCost(endpoint, amount);
  const store = getStore();

  const total = (await store.sumCosts({})) + cost;
  if (total > limitTotal()) throw new BudgetExceeded(total - cost, limitTotal(), "total");

  // 사용자 축 — **정가(크레딧)는 시작 전에 이미 받았다.** 그래서 여기서 컷 단위로 다시
  // 재지 않는다(그러면 사장님이 정가를 내고도 원가 눈금에 두 번 걸린다). 남은 일은
  // **청구 없이 도는 경로**에 그물을 치는 것뿐이다: 잔액이 음수인 채로 fal 이 나가면 안 된다.
  //
  // actor 는 인자로 받지 않는다 — costActor() 가 컨텍스트에서 꺼낸다.
  // 그래야 이 함수를 부르는 호출부 7곳의 시그니처가 안 바뀐다.
  const actor = costActor();
  const balance = await balanceFor(actor);
  if (balance < 0) throw new BudgetExceeded(0, 0, "user");

  if (projectId) {
    const mine = (await store.sumCosts({ projectId })) + cost;
    if (mine > limitProject()) throw new BudgetExceeded(mine - cost, limitProject(), "project");
  }
}

// 화면에 uuid 를 그대로 내보내지 않는다. 저장은 uuid 로 한다 — 집계와 사용자별 상한이
// 그 값으로 돌기 때문이다(이메일·표시 이름은 바뀌고 중복되지만 uuid 는 그렇지 않다).
//
// ★ 라벨 조회는 행마다 하지 않는다. 행마다 하면 원장 화면 하나가 DB 왕복 수십 회가 된다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function labelFor(actor, profiles) {
  if (!actor) return "–";
  const p = profiles.get(actor);
  if (p) return p.role === "admin" ? "admin" : p.email;
  // uuid 인데 프로필을 못 찾았다 — 탈퇴했거나 handle_new_user 트리거가 빠진 경우다.
  // uuid 를 그대로 내보내면 화면에 다시 uuid 가 새는 것이니 구분해서 감춘다.
  if (UUID.test(actor)) return "(알 수 없음)";
  return actor;                             // uuid 가 아닌 문자열("admin"·"local")은 그대로
}

export async function listRecords() {
  const all = await getStore().allCosts();
  const sorted = all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const ids = [...new Set(sorted.map((r) => r.actor).filter((a) => UUID.test(a || "")))];
  const profiles = await getStore().findProfiles(ids);
  return sorted.map((r) => ({ ...r, actor_label: labelFor(r.actor, profiles) }));
}

// 같은 request_id 를 두 번 넣어도 한 건이다 — store 가 막는다.
// 크레딧이 붙으면 이것이 이중 차감 방어선이 된다.
export async function addRecord(record) {
  await getStore().insertCost(record);
  return record;
}

export async function updateRecord(requestId, patch) {
  return getStore().patchCost(requestId, patch);
}
