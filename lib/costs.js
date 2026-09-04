// 비용 원장 — 행 저장소(lib/store) 위에 얹는다.
//
// 예전에는 data/costs.json 한 파일을 통째로 읽고 통째로 다시 썼다. 그러면 동시에
// 두 호출이 기록할 때 나중 쓰기가 앞의 것을 덮고(락이 필요해지고), 합계도 매번
// 파일 전체를 훑어야 했다. 행 하나씩 넣고 합계는 저장소가 재는 지금 구조에는
// 그 두 문제가 없다.
import { fakeFal, fakeLlm } from "./fake.js";
import { getStore } from "./store/index.js";
import { currentActor } from "./actor.js";
// 표시명 규칙 한 벌 — 화면(/me·/admin)과 같은 값을 써야 한다.
import { displayNameOf } from "./display-name.js";
// 사용자 축의 자(尺)는 **크레딧 잔액**이다. charges.js 는 costs.js 를 부르지 않아 순환이 안 생긴다.
import { creditStateFor, creditsEnabled } from "./charges.js";
// 체험 한도의 값도 가격표 한 곳에서 온다 — 숫자를 이 파일에 복제하지 않는다.
import { FREE_TRIAL_USD } from "./pricing.js";

// 모델별 예상 단가. fal 대시보드 실비용으로 검증 후 갱신할 것.
// key는 엔드포인트 앞부분(prefix) 매칭 — 더 구체적인 prefix를 위에 둘 것.
//
// 단위가 둘이다 — 영상은 초당(perSec), 음성은 글자당(per1k, 1000자 기준).
// unit 을 생략하면 "sec" 으로 본다(기존 호출부는 초를 넘긴다).
// 이미지는 장당인데 perSec 자리를 그대로 쓴다 — amount 에 장 수를 넘기면 값이 맞는다.
//
// ★ Task 24 — perSec 이 **숫자**(해상도 무관 단일가)거나 **객체**(해상도 → 단가)일 수
//   있다. estimateCost 가 셋째 인자로 resolution 을 받아 객체 항목을 그 해상도로 찾는다
//   (아래 perSecFor). 생략하면 720p 로 본다 — lib/ad/models.js 의 DEFAULT_AD_RESOLUTION 과
//   같은 값이다. 이 파일의 실제 호출부(lib/ad/generate.js 등)가 resolution 을 안 넘기는
//   한 자동으로 720p 로 잡힌다 — "옛 문서=720p" 규율과 우연이 아니라 같은 값으로 맞췄다.
const PRICE_TABLE = [
  { prefix: "fal-ai/veo3.1/fast", perSec: 0.15 },
  { prefix: "fal-ai/veo3.1", perSec: 0.4 },
  // ⚠️ Seedance 는 접두사가 "fal-ai/" 가 아니다 — isFakeFor 의 FAL_PREFIXES 에도 같은
  // 접두사가 있어야 한다. 단가 자체는 **아래 광고 표의 해상도별 값**이 쥔다(병합 2026-08-13):
  // 여기 단일가($0.3024)를 함께 두면 앞줄이 이겨 720p 실단가($0.3034)를 덮어, 원장과
  // 예산 가드가 조금씩 낮게 잡힌다. 같은 접두사를 두 번 적지 않는다.
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
  // 음성 인식 — **자막 시각**을 재려고 부른다(lib/speech-probe.js). 초당 과금이다.
  // ⚠️ fal 문서값 $0.0006/초 — 15초 한 편이 $0.009 다. 실청구로 검증하지 않았다
  //   (이 표의 다른 항목들과 같은 처지다). 올려 잡는 방향이 안전하다.
  { prefix: "fal-ai/whisper", perSec: 0.0006 },
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
  // GPT Image 2 (2026-08-24 도입 · 기본 이미지 모델). 값을 정하는 축이 **quality** 다 —
  // 해상도가 아니다(fal 공식표: low $0.012 · medium $0.101 · high $0.401, 크기 무관).
  //
  // ★ 그래서 perSec 을 **객체**로 두되 키가 해상도가 아니라 quality 다. 부르는 쪽
  //   (lib/imagegen.js)이 셋째 인자에 quality 를 넘긴다 — 그 인자는 "가격을 가르는 축"
  //   이지 해상도 전용이 아니다(영상은 해상도가, 이 모델은 quality 가 그 축이다).
  //   실제로 나간 값과 장부가 갈리지 않으려면 **재는 값(assertBudget)과 적는 값
  //   (estimateCost)이 같은 키**여야 한다 — imagegen 이 둘에 같은 변수를 넘긴다.
  // ★ 이미지 해상도 배수(IMAGE_RESOLUTION_MULTIPLIER)는 여기 안 얹힌다 — 그 배수는
  //   perSec 이 숫자인 항목(nano-banana 계열)에만 붙는다. 두 축을 함께 곱하면 장부가
  //   실제보다 1.5배 커진다.
  // ★ 모르는 키("auto"·생략·해상도 문자열)는 perSecFor 가 가장 비싼 값(high)으로 본다 —
  //   내려 잡으면 예산 가드가 한도를 넘기고도 통과시킨다.
  // ⚠️ 접두사가 "openai/" 로 시작하지만 **LLM 이 아니다** — 아래 FAL_PREFIXES 에
  //   "openai/gpt-image" 가 함께 있어야 SHOTFORM_FAKE=fal 에서 돈이 안 나간다.
  //   레퍼런스가 있을 때 붙는 "/edit" 도 같은 접두사에 걸려 단가가 같다.
  // ★★★ 2026-09-04 — **fal 공식 가격표 그대로**(사장님 지시: "공식문서를 기준으로").
  //   공식 표는 **크기 × 품질**로 갈린다. 우리가 그리는 판이 가장 큰 칸이므로 그 줄을 쓴다:
  //     3840×2160  low $0.024 · medium $0.113 · high $0.413
  //   판의 치수는 `storyboardImageSize` 가 정하고 상한이 3840 이다(lib/reel/storyboard.js).
  //   3×3 판이 2160×3840 이라 **픽셀 수가 그 줄과 같다.**
  // ⚠️ **작은 판은 이보다 싸다**(공식 표: 2560×1440 high $0.234 · 1024×1536 $0.178).
  //   지금 값 축이 quality 하나라 크기를 못 싣는다 — 그래서 **가장 비싼 줄로 잡는다.**
  //   내려 잡으면 예산 가드가 한도를 넘기고도 통과시킨다(이 표의 규율).
  //   크기를 값에 싣고 싶으면 priceKey 축을 늘려야 한다(lib/imagegen.js 의 priceKey).
  { prefix: "openai/gpt-image", perSec: { low: 0.024, medium: 0.113, high: 0.413 } },
  { prefix: "fal-ai/nano-banana", perSec: 0.04 },
  // 2.0 standard(기본 모델). ★★★ 2026-09-04 — **공식 토큰식에서 다시 뽑았다.**
  //   공식 문서: `토큰 = (높이 × 너비 × 초 × 24) / 1024`, **$0.014 / 1,000 토큰**.
  //   초당 = (h × w × 24 / 1024 / 1000) × 0.014 →
  //     480p(480×854)   9,607.5 토큰/s → $0.13451/s
  //     720p(720×1280) 21,600   토큰/s → $0.30240/s  (공식 문서의 "$0.3024/sec" 와 일치)
  //     1080p(1080×1920) 48,600 토큰/s → $0.68040/s
  //   ★ **실측으로 확인됐다** — 15초 720p 굽기의 fal `billable` 이 324.9 였고, 위 식의
  //     21,600 × 15 = 324,000 토큰(=324 킬로토큰)과 같다. **billable 이 곧 킬로토큰이다.**
  //   ⚠️ 그전 값(0.1348 · 0.3034 · 0.682)은 0.3034 를 기준으로 잡아 **약 0.3% 높았다.**
  //   ⚠️ lib/ad/models.js 의 perSecUsd 와 **같은 값이어야 한다** — 갈리면 예산 가드가 틀린다.
  { prefix: "bytedance/seedance-2.0", perSec: { "480p": 0.13451, "720p": 0.3024, "1080p": 0.6804 } },
  // Seedance 2.5 — t2v/i2v/r2v 가 "/fast" 세그먼트 없이 여기 하나로 다 걸린다. 2.0 과
  // 달리 해상도가 원가를 정한다(토큰식) — 9:16 기준으로 계산해 넣었다(lib/ad/models.js 의
  // perSecUsd 주석에 계산식이 있다).
  // ★★★ 2026-09-04 — **공식 문서와 일치한다.** 공식이 "토큰식이 정본"이라고 못 박고
  //   $0.0214/1k 를 준다: 480p 9,607.5 → $0.20560 · 720p 21,600 → $0.46224. 표와 같다.
  //   (공식의 초당 근사치 480p ~$0.2205 는 16:9 기준 근사라 토큰식과 다르다 — 정본은 식이다.)
  //   ⚠️ 옛 주석의 "2.5 를 실제로 불러본 적이 없다"는 **틀렸다** — 2026-09-03~04 에 여러 편
  //     구웠다. 1080p 는 2.5 자체가 지원 안 한다(표에 없음 — resolution 이 그 값이면
  // perSecFor 가 720p·480p 중 더 비싼 쪽으로 방어한다).
  // ⚠️ lib/ad/models.js 의 perSecUsd 와 **같은 값이어야 한다** — 갈리면 예산 가드가 틀린다.
  // ★ 1080p 는 2026-08-21 에 열었다 — **관리자 전용**이다(lib/ad/models.js 의
  //   adminResolutions). 같은 토큰식으로 계산했다: 1080×1920×24/1024 = 48,600 tokens/s
  //   × $0.0214/1k = $1.04/s (15초 $15.60 · 30초 $31.20). 계산값이지 실측이 아니다.
  { prefix: "bytedance/seedance-2.5", perSec: { "480p": 0.2056, "720p": 0.4622, "1080p": 1.04 } },
  // ★★ MiniMax H3 (2026-08-21) — fal 공시 단가 그대로다(초당):
  //   480P $0.05 · 768P $0.06 · 2K $0.13 · 4K $0.16.
  //   ⚠️ lib/ad/models.js 의 minimax-h3 perSecUsd 와 **같은 값이어야 한다** —
  //     갈리면 예산 가드가 틀린다(tests 가 대조한다).
  //   ★ 해상도 표기가 **대문자**다. Seedance 는 소문자라 이 표에 두 표기가 섞여 산다 —
  //     perSecFor 는 문자열로 조회하므로 섞여도 안전하지만, 값을 더할 때 헷갈리지 마라.
  //   ★ 우리는 2K·4K 만 연다. 480P·768P 도 적어 두는 이유는 나중에 열 때 값을 다시
  //     찾지 않기 위해서다(모델 표와 같은 이유).
  { prefix: "minimax/h3", perSec: { "480P": 0.05, "768P": 0.06, "2K": 0.13, "4K": 0.16 } },
];
const DEFAULT_PER_SEC = 0.1;
// lib/ad/models.js 의 DEFAULT_AD_RESOLUTION 과 같은 값이어야 한다(tests/ad-costs.test.js
// 가 대조한다) — 이 파일은 화면이 import 하는 lib/ad/models.js 를 끌어올 이유가 없어
// 문자열로 다시 적는다(다른 광고 상수들과 같은 사정).
const DEFAULT_RESOLUTION = "720p";

// entry.perSec 이 숫자(해상도 무관)면 그대로, 객체(해상도별)면 그 해상도 값을 낸다.
// resolution 을 생략하면 720p — 옛 호출부(resolution 을 안 넘기는 lib/ad/generate.js 등)
// 가 자동으로 720p 로 잡히는 이유가 이거다.
// 이미지 해상도 배수 — fal 문서값 그대로다(nano-banana-2).
//   0.5K ×0.75 · 1K ×1(표준) · 2K ×1.5 · 4K ×2
//
// ★ 왜 여기 두는가: 실제로 나간 돈과 장부가 갈리면 안 된다. 해상도를 올려 보내면서
//   이 배수를 안 반영하면 **$0.12 가 나갔는데 장부에는 $0.08 로 남는다** — 이 저장소가
//   이미 같은 사고를 겪었다(같은 접두사 두 줄에서 앞줄이 이겨 실단가를 덮었다).
// ★ 모르는 값은 1배다. 영상 해상도("720p" 등)가 이 자리에 와도 그냥 표준가로 잡힌다 —
//   이미지 항목은 영상 해상도 축을 쓰지 않는다.
export const IMAGE_RESOLUTION_MULTIPLIER = { "0.5K": 0.75, "1K": 1, "2K": 1.5, "4K": 2 };

function perSecFor(entry, resolution) {
  if (typeof entry.perSec === "number") {
    // 단일 단가 항목(이미지가 여기 걸린다) — 이미지 해상도면 배수를 얹는다.
    const mult = IMAGE_RESOLUTION_MULTIPLIER[resolution];
    return typeof mult === "number" ? entry.perSec * mult : entry.perSec;
  }
  const key = resolution || DEFAULT_RESOLUTION;
  const v = entry.perSec[key];
  if (typeof v === "number") return v;
  // 모르는 해상도(또는 그 모델이 그 해상도를 원래 안 판다, 예: 2.5 에 1080p) — 적게
  // 잡으면 예산 가드가 뚫린다. 가장 비싼 값으로 본다(안전한 방향).
  return Math.max(...Object.values(entry.perSec));
}

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

// resolution 은 셋째 인자(선택) — 해상도별 항목(perSec 이 객체)에서만 쓰인다. 생략하면
// 720p 로 본다(perSecFor). 기존 호출부(영상 이외 전부·기존 6단계 i2v)는 그냥 안 넘기면
// 되고, 단일가 항목은 애초에 resolution 을 안 본다.
export function estimateCost(endpoint, amount, resolution) {
  const entry = PRICE_TABLE.find((p) => endpoint.startsWith(p.prefix));
  const n = Number(amount) || 0;
  if (!entry) return round6(DEFAULT_PER_SEC * n);
  const raw = entry.unit === "chars" ? (entry.per1k * n) / 1000 : perSecFor(entry, resolution) * n;
  return round6(raw);
}

// LLM 은 입력·출력 단가가 달라 PRICE_TABLE(단일 단가)에 담기지 않는다.
// 그래서 여기서 따로 잰다.
//
// ⚠️ 단가는 문서 기준 추정이고 실청구로 검증하지 않았다(fal 단가표와 같은 처지다).
//    gpt-4o        : 입력 $2.50/1M · 출력 $10.00/1M — 이미지 검수(lib/vlm.js)에 남는다
//    claude-opus-5 : 입력 $5.00/1M · 출력 $25.00/1M — 본 파이프라인(lib/llm.js)
//    claude-fable-5: 입력 $10/1M · 출력 $50/1M — 광고 경로 전용(lib/ad/llm.js).
//    ⚠️ 모델 문자열은 부르는 쪽의 상수와 **같은 값이어야 한다**(lib/llm.js 의 MODEL,
//    lib/ad/llm.js 의 CLAUDE_MODEL) — 갈리면 이 표가 모델을 못 찾아 LLM_DEFAULT(gpt-4o
//    단가)로 떨어지고 원가가 실제의 1/2~1/5 로 기록된다. 원가를 내려 잡으면 예산 가드가
//    한도를 넘기고도 통과시킨다.
const LLM_PRICE = {
  "gpt-4o": { in: 2.5 / 1e6, out: 10 / 1e6 },
  "claude-opus-5": { in: 5 / 1e6, out: 25 / 1e6 },
  "claude-fable-5": { in: 10 / 1e6, out: 50 / 1e6 },
};
const LLM_DEFAULT = { in: 2.5 / 1e6, out: 10 / 1e6 };

// ★ usage 의 이름이 공급자마다 다르다 — OpenAI 는 prompt/completion, Anthropic 은
//   input/output 이다. **둘 다 받는다**: 대본 계열은 Claude 로 옮겼지만 이미지 검수
//   (lib/vlm.js)는 gpt-4o 로 남아 두 모양이 동시에 살아 있다. 한쪽으로 갈아치우면
//   남은 쪽의 원가가 조용히 0 이 되고, 0 은 예산 가드가 못 보는 값이다.
// ★ 완전 일치가 아니라 **접두사**로 찾는다 — 응답이 별칭(claude-opus-5)이 아니라
//   날짜판(claude-opus-5-20260812)을 돌려주는 날, 완전 일치는 기본 단가로 떨어져
//   Claude 원가를 **반값**으로 적는다. 원가를 내려 잡으면 예산 가드가 한도를 넘기고도
//   통과시킨다. 접두사가 겹칠 때를 대비해 긴 것을 먼저 본다(PRICE_TABLE 과 같은 규칙).
const LLM_PRICE_BY_LENGTH = Object.entries(LLM_PRICE).sort((a, b) => b[0].length - a[0].length);

export function estimateLlmCost(model, usage) {
  const name = String(model || "");
  const p = LLM_PRICE_BY_LENGTH.find(([k]) => name.startsWith(k))?.[1] || LLM_DEFAULT;
  const inTok = Number(usage?.input_tokens ?? usage?.prompt_tokens) || 0;
  const outTok = Number(usage?.output_tokens ?? usage?.completion_tokens) || 0;
  // 센트 단위로 자르면 한 호출이 0원이 되어 총합이 실제보다 작아진다 — 6자리까지 남긴다
  return Math.round((inTok * p.in + outTok * p.out) * 1e6) / 1e6;
}

// 이 엔드포인트가 가짜로 도는가. 공급자마다 가짜 단계가 다르므로 축을 나눠 묻는다.
//
// ★ 판정 기준이 "fal 인가"다 — "openai 인가"가 아니다. 방향이 중요하다:
// `openai/*` 를 물으면 **모르는 엔드포인트가 fal 축으로 떨어져** `SHOTFORM_FAKE=fal` 에서
// 게이트가 통째로 꺼진다(그 모드는 fal 만 가짜이고 나머지는 진짜 돈이 나간다).
// 접두사를 안 붙인 새 LLM 호출부 하나면 방금 고친 구멍이 그대로 되돌아온다.
// 반대로 두면 모르는 것은 **게이트를 통과시키지 않는 쪽**(fail-closed)으로 떨어진다.
//
// 오탐 비용은 사실상 0 이다 — fal 호출부 셋(imagegen·i2v·tts)은 전부 `fakeFal()` 로
// assertBudget **앞에서** 조기반환하므로, 가짜 모드에서 여기까지 오지도 않는다.
// fal 로 나가는 엔드포인트의 접두사. fal 이 공급자 이름을 그대로 쓰는 모델들이 있어
// "fal-ai/" 하나로는 부족하다(bytedance/seedance-2.0 이 그렇다).
//
// ★ 새 공급자를 붙일 때 여기에 더한다. 안 더하면 그 호출이 LLM 축으로 분류되어
//   SHOTFORM_FAKE=fal 에서 **진짜 돈이 나간다**(0원인 줄 알고 돌린 테스트가 값을 쓴다).
// ⚠️ **판정 방향은 뒤집지 마라** — 위 주석 참고. 넓히는 것은 이 목록뿐이다.
// ⚠️ "openai/" 를 통째로 넣으면 안 된다 — 같은 접두사를 **LLM 이 쓴다**(lib/vlm.js 가
//   `openai/gpt-4o` 로 기록·판정한다). 통째로 넣으면 그 LLM 이 fal 축으로 넘어가
//   SHOTFORM_FAKE=fal(= LLM 은 진짜)에서 게이트가 꺼진다. 이미지 엔드포인트만 잡히도록
//   "openai/gpt-image" 로 좁힌다("/edit" 변형도 여기 걸린다).
// ★ 2026-08-21 — "minimax/" 를 더한다. 이 목록에 없으면 그 모델이 **fal 이 아닌 것으로
//   판정돼** 가짜 모드(SHOTFORM_FAKE=fal)에서 진짜 호출이 나간다 — 0원인 줄 알고 돌리다
//   $1.95 가 나가는 자리다. 모델을 더할 때마다 이 줄을 함께 본다.
// ★★ 2026-08-28 머지 — **둘 다 필요하다.** 한쪽만 고르면 각각 다른 돈 구멍이 열린다:
//   openai/gpt-image 를 빼면 그림이 가짜 모드에서 진짜로 나가고, minimax 를 빼면
//   그 모델이 같은 이유로 진짜로 나간다.
const FAL_PREFIXES = ["fal-ai/", "bytedance/", "openai/gpt-image", "minimax/"];

export function isFakeFor(endpoint) {
  const id = String(endpoint || "");
  return FAL_PREFIXES.some((p) => id.startsWith(p)) ? fakeFal() : fakeLlm();
}

// 예산 가드 — 기록만으로는 아무것도 막지 못한다.
// 30초 한 편이 약 $3 라 해도 되돌리기·재생성이 얽히면 훨씬 더 나간다.
export class BudgetExceeded extends Error {
  constructor(spent, limit, scope) {
    // 축마다 사장님이 할 일이 다르다 — 같은 문구를 쓰면 아무도 무엇을 해야 할지 모른다.
    //   trial : 체험분을 다 썼다 → 크레딧을 받으면 이어서 만든다
    //   user  : 크레딧 잔액이 바닥났다
    //   total : 우리 안전핀이다. 사장님이 할 수 있는 것이 없다
    super(
      scope === "trial"
        ? "체험으로 만들어 볼 수 있는 만큼을 다 썼어요 — 크레딧을 받으면 이어서 만들 수 있어요"
        : scope === "user"
          ? "크레딧이 모자라요 — 잔액이 바닥났어요"
          : `예산 상한($${limit})에 닿아 멈췄어요 — 지금까지 $${spent.toFixed(2)} 썼어요`
    );
    this.name = "BudgetExceeded";
    this.scope = scope; // "trial" | "user" | "total"
  }
}

// 상한은 매번 env 에서 읽는다 — 모듈 로드 시점에 굳히면 테스트가 값을 못 바꾼다
// 전역 — 우리 지갑의 마지막 안전핀. 30초 한 편 원가가 ~$3 이라 $20 이면 전 사용자 합계
// **여섯 편**에서 서비스가 멎는다(실제로 그 값이었다). 프로덕션 env 에 넣는 것을 잊어도
// 곧바로 서비스가 죽지 않을 값으로 올린다 — 그래도 폭주는 여기서 멈춘다.
export function limitTotal() {
  return Number(process.env.SHOTFORM_BUDGET_TOTAL_USD ?? 300);
}

// ★ 프로젝트 축은 없다(2026-08-12 에 걷어냈다). 요금은 **크레딧**이 맡고, 폭주 방어는
// 위의 전역 상한이 맡는다. 프로젝트마다 상한을 두면 그것이 요금 상한처럼 굴어 **정상
// 사용을 막았다** — Seedance 60초 한 편이 원가 $19.2 라 재생성 몇 번이면 옛 상한($30)에
// 닿아, 사장님이 크레딧을 내고 산 영상이 중간에 죽는 "돈은 있는데 못 만드는" 상태가 됐다.
// (모델이 바뀔 때마다 다시 손봐야 하는 숫자였다는 뜻이기도 하다.)

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
// skipProjectAxis — ★ Task 25. 광고 경로(lib/ad/generate.js)가 켜서 쓴다. 프로젝트 축은
// "폭주(무한 루프) 방어"용이다(기존 6단계가 컷마다 fal 을 부르니 한 프로젝트가 폭주하면
// 막으려던 것) — 광고는 한 번 누르면 한 편이 통짜로 나가는 구조라 그 위험이 구조적으로
// 없다. **이름 있는 옵션으로 명시해 뺀다** — projectId 를 슬쩍 안 넘겨서 우연히 축이
// 빠지게 하면, 나중에 누가 읽고 "빠뜨렸나?" 하며 되돌려 놓을 수 있다. 기본값 false 라
// 기존 7개 호출부(lib/i2v.js·lib/imagegen.js·lib/tts.js·lib/llm.js·lib/vlm.js·
// lib/ad/llm.js·app/api/chat/route.js)는 옵션을 안 줘도 지금처럼 프로젝트 축을 탄다.
//
// ★ resolution — 해상도별 항목(perSec 이 객체)에서만 쓰인다. 안 넘기면 estimateCost 가
// 720p 로 보므로, 1080p 호출을 720p 원가(2.25분의 1)로 재게 된다 — 그물이 **느슨한
// 방향으로** 틀린다. 재는 값과 원장에 적히는 값(호출부의 estimateCost)이 같아야 한다.
export async function assertBudget({ projectId, endpoint, amount, resolution, skipProjectAxis = false }) {
  // 가짜 판정의 축은 **어느 공급자로 나가는가**다. 오래도록 `fakeFal()` 하나로 갈랐는데,
  // `SHOTFORM_FAKE=fal` 은 **fal 만 가짜이고 OpenAI 는 진짜로 나간다**(lib/fake.js). 그래서
  // LLM 이 게이트 안에 들어온 순간 그 모드에서 **게이트가 통째로 꺼지는** 자리가 됐다 —
  // 하필 이 저장소가 "비용 배선을 검증하려면 `SHOTFORM_FAKE=fal`" 이라고 지정한 모드다.
  // 엔드포인트로 가른다: fal 접두사(FAL_PREFIXES)면 fakeFal(),
  // 나머지(openai/* 와 **모르는 것**)는 fakeLlm().
  // 방향이 왜 이쪽인지는 isFakeFor 위 주석 참고 — 모르는 것이 fail-closed 로 떨어져야 한다.
  if (isFakeFor(endpoint)) return; // 가짜 호출은 0원이라 잴 것이 없다
  const cost = estimateCost(endpoint, amount, resolution);
  const store = getStore();

  // ★ 전역 원가 상한은 걷어냈다(2026-08-13 사용자 결정). env 하나($25)가 **전사 공용**이라,
  // 누가 쓰든 그 숫자에 닿는 순간 모두가 멈췄다 — 크레딧을 내고 산 영상도 함께 죽는다.
  // 요금은 크레딧이 맡고(정가·재생성), 폭주 방어는 아래 두 그물이 맡는다:
  // 잔액이 음수면 못 나가고, 크레딧을 한 번도 안 받은 사람은 체험 한도까지만 쓴다.
  // sumCosts 기록은 그대로 남는다 — 상한으로 막지 않을 뿐 얼마 썼는지는 /costs 가 본다.

  // 사용자 축 — **정가(크레딧)는 시작 전에 이미 받았다.** 그래서 여기서 컷 단위로 다시
  // 재지 않는다(그러면 사장님이 정가를 내고도 원가 눈금에 두 번 걸린다). 남은 일은
  // **청구 없이 도는 경로**에 그물을 치는 것뿐이다: 잔액이 음수인 채로 fal 이 나가면 안 된다.
  //
  // actor 는 인자로 받지 않는다 — costActor() 가 컨텍스트에서 꺼낸다.
  // 그래야 이 함수를 부르는 호출부 7곳의 시그니처가 안 바뀐다.
  const actor = costActor();
  // 크레딧을 끈 동안은 잔액·체험 그물도 함께 내린다(2026-08-14 내부 QA).
  // ★ 그러면 **남는 그물이 0 이다** — 전역 원가 상한은 이미 걷어냈다(위 주석).
  //   폭주가 그대로 fal 청구가 된다는 뜻이라, 이 스위치는 QA 기간에만 켠다.
  //   기록(cost_records)은 계속 쌓이므로 /costs 에서 얼마 썼는지는 볼 수 있다.
  if (!creditsEnabled()) return;
  const { balance, charged } = await creditStateFor(actor);
  if (balance < 0) throw new BudgetExceeded(0, 0, "user");

  // ★ 체험 한도 — 크레딧을 안 낸 채로 도는 경로에 치는 그물이다.
  //
  // 정가는 ③목소리에서 받으므로 그 앞단계(대화·브리핑·대본)는 크레딧 0 으로도 돈다.
  // 결과를 봐야 지갑을 열기 때문에 그 자체는 의도한 것이고, 대신 누적 상한을 건다.
  //
  // ★★ 이 그물에 걸리는 사람은 **체험자뿐**이다. 체험자란 **결제한 적도 없고 가진
  // 크레딧도 없는** 사람이다. 둘 중 하나라도 있으면 그냥 지나간다.
  //
  // ⚠️ 여기를 "지금 잔액이 있는가"(balance <= 0) **하나로** 판정하면 안 된다. 처음에
  // 그렇게 짰다가 **돈을 낸 사장님이 자기가 산 영상 도중에 갇혔다**:
  //     잔액 50 → requireVideoCharge(30초)가 50 을 받아감 → 잔액 0
  //     → 첫 컷이 fal 로 나가는 순간 balance <= 0 이라 그물에 걸림
  //     → 30초 한 편 원가가 $3.06 이라 컷 두 개면 이미 $0.5 를 넘는다
  // 게다가 **탈출구가 없다**. 실패하면 refundVideo 가 50 을 돌려주고, 다시 돌리면 또
  // 50 을 내고 잔액 0 이 되어 같은 자리에서 또 막힌다 — 무한 루프다.
  //
  // 그래서 **청구 이력(charged)** 을 함께 본다. 한 번이라도 결제했으면 체험자가 아니다.
  // 이 넷이 전부 맞는다:
  //   결제한 사장님(잔액 0 이어도)  : charged > 0  → 통과. 위의 가둠이 안 생긴다
  //   크레딧을 받은 사장님           : balance > 0  → 통과. 이미 정가 체계 안이다
  //   갓 가입한 사장님               : 둘 다 0      → 한도까지 체험한다
  //   체험분을 다 쓴 사람            : 둘 다 0      → 누적이 이미 한도를 넘어 막힌다
  // 크레딧을 다 쓴 사람이 새로 시작하는 경우는 여기가 아니라 유료 입구의
  // requireVideoCharge/NoCredits(402)가 막는다 — 구멍이 아니다.
  if (charged <= 0 && balance <= 0) {
    const mine = (await store.sumCosts({ actor })) + cost;
    if (mine > FREE_TRIAL_USD) throw new BudgetExceeded(mine - cost, FREE_TRIAL_USD, "trial");
  }

  // projectId 는 여기서 상한을 재는 데 쓰지 않는다 — 원장 기록과 spentForProject 가 쓴다.
  // 인자를 그대로 두는 이유이고, 호출부 시그니처도 그래서 안 바뀐다.
  //
  // ★ 병합 메모(2026-08-13): 광고 브랜치는 프로젝트 축이 살아 있던 시절(08-12 15:57 이전)
  // 코드를 들고 왔고, 그쪽도 "광고 경로에서 예산핀을 뺀다"로 같은 문제를 겪었다.
  // 축을 되살리면 main 이 고친 결함이 함께 돌아온다 — 크레딧을 내고 산 영상이 상한에
  // 걸려 중간에 죽는 "돈은 있는데 못 만드는" 상태다. 그래서 축은 없는 쪽으로 합친다.
  // (skipProjectAxis 인자는 받되 쓰지 않는다 — 광고 라우트의 호출부를 안 흔들려고 둔다.)
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

// 사람이 부르는 말. 신원(labelFor: 이메일·admin)과 **다른 축**이다 — 화면은 이름으로
// 읽고 고르지만, 같은 이름을 쓰는 계정이 둘일 수 있어 신원은 따로 보여 준다.
function nameFor(actor, profiles) {
  const p = profiles.get(actor);
  if (p) return displayNameOf(p);
  return labelFor(actor, profiles);
}

// ★★ 2026-08-27 — **창을 받아서 읽는다.** 그전에는 늘 전부 읽었다(원장이 늘수록 그대로
//   느려진다). 화면은 기간을 넘겨 그 창만 받고, 거기서 다시 좁혀 100개씩 넘긴다.
//   ★ 읽는 상한(readLimit)은 **좁히기 앞의 방어선**이다 — 사람·종류로 좁히는 일은
//     프로필·프로젝트를 물어야 해서 SQL 한 번으로 안 끝난다. 그래서 기간으로 자른 창을
//     넉넉히 받아 두고 그 안에서 거른다.
//   ★ 합계(sum_costs)는 이 문을 안 탄다 — 예산 가드는 여전히 전 기간을 SQL 로 센다.
export async function listRecords({ from, to, readLimit } = {}) {
  const store = getStore();
  const all = store.listCosts
    ? await store.listCosts({ from, to, limit: readLimit })
    : await store.allCosts();
  const sorted = all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const ids = [...new Set(sorted.map((r) => r.actor).filter((a) => UUID.test(a || "")))];
  // ★★ 2026-08-27 — **어느 흐름의 지출인가**를 함께 싣는다(사장님 요청: "광고 영상 비용도
  //   측정해줘. 둘을 구분해서 한 페이지에서"). 종류는 원장이 아니라 **프로젝트 문서**에
  //   산다(doc.kind) — 원장 행에 복사해 두면 두 벌이 되고 옛 행은 영영 빈 채로 남는다.
  //   그래서 필요할 때 묶음으로 판다(프로필과 같은 방식·같은 왕복 수).
  // ★ 프로젝트가 없는 줄(대화 등)과 지워진 프로젝트는 kind 가 null 이다 — 화면이 "기타"로
  //   읽는다(lib/costs-filter.js 의 flowOf). 여기서 기본값을 채우지 않는 이유는 "모른다"와
  //   "단계별 흐름(kind 가 원래 없다)"이 다른 사실이기 때문이다.
  const projectIds = [...new Set(sorted.map((r) => r.project_id).filter(Boolean))];
  const [profiles, kinds] = await Promise.all([
    getStore().findProfiles(ids),
    getStore().findProjectKinds(projectIds),
  ]);
  return sorted.map((r) => ({
    ...r,
    actor_label: labelFor(r.actor, profiles),
    // 이름은 라벨과 다른 축이다 — 라벨은 신원(이메일·admin), 이름은 사람이 부르는 말이다.
    actor_name: nameFor(r.actor, profiles),
    kind: r.project_id ? (kinds.get(r.project_id) ?? null) : null,
    known_project: r.project_id ? kinds.has(r.project_id) : false,
  }));
}

// 원장 meta.prompt 에 남기는 글자 수 상한.
//
// ★ 이 문자열이 이 저장소의 계측기다. "클립 프롬프트에 무대·인물·제품이 통째로 없다"를
//   발견한 것이 라이브 원장의 이 값이었다(2026-08-14). 300자였을 때는 `Setting:` 까지만
//   남고 `Characters`·`The subject is`·`Color treatment` 가 사라져, 무엇을 보냈는지
//   확인할 채널이 막혀 있었다.
// ★ 값은 실측에서 뽑았다(2026-08-15, 저장된 프로젝트 44컷): 이미지 프롬프트 평균 558자·
//   **최대 729자**(44/44 가 300자 초과), 클립 프롬프트 평균 376자·최대 603자.
//   2000 은 그 위로 넉넉한 자리다 — 사용자가 넣는 수정 지시(edit_instruction)와
//   레퍼런스 문구가 더 붙어도 잘리지 않는다.
// ★ 자르기를 아주 없애지는 않는다 — 원장 한 행이 무한정 커질 자리를 남기지 않는다.
//   meta 는 jsonb 라 길이 제약이 없고, fal 입력 한도·비용과도 무관하다(초 단위 과금).
// ★ 이미지(lib/imagegen.js)와 클립(lib/i2v.js)이 **같은 값을 여기서 읽는다.** 두 벌이면
//   갈린다. 대사·shows 를 적는 다른 자리(tts·vlm·llm)는 성격이 다른 짧은 문자열이라
//   그대로 두었다 — 그 셋을 여기 묶고 싶으면 각각 실측하고 옮길 것.
export const LEDGER_PROMPT_MAX = 2000;

// 같은 request_id 를 두 번 넣어도 한 건이다 — store 가 막는다.
// 크레딧이 붙으면 이것이 이중 차감 방어선이 된다.
export async function addRecord(record) {
  await getStore().insertCost(record);
  return record;
}

export async function updateRecord(requestId, patch) {
  return getStore().patchCost(requestId, patch);
}
