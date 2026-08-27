// 광고 영상 생성 — fal 을 부르는 유일한 자리.
//
// 기존 lib/i2v.js·lib/imagegen.js 와 같은 모양이다: 가짜 판정 → 예산 → 호출 → 원장.
// ★ 가짜 판정이 assertBudget **앞**이다. 그래서 가짜 모드에서는 기록도 안 남는다
//   (CLAUDE.md 가 적어 둔 성질 그대로다 — 비용 배선을 검증하려면 SHOTFORM_FAKE=fal 이 아니라
//   진짜로 돌려야 한다).
//
// ★★ Task 23 (2026-08-13) — 왜 여기만 동기 호출(fal.run)이 아니라 큐(queue.fal.run)인가.
// lib/i2v.js 는 컷 하나(5~10초)라 fal.run 동기 호출이 5분 안에 끝났다. 광고는 한 편이
// 통짜라(15~60초) 처음으로 그 벽에 닿았다: 사용자가 15초 광고를 만들다 `fetch failed` 로
// 실패했다 — Node 24 undici 의 fetch 는 응답 헤더를 5분(300초) 안에 못 받으면 끊는데,
// 실측(scripts/measure/probe-seedance.mjs) 4초 영상이 134초 걸렸으니 15초는 5분을
// 가뿐히 넘긴다. fal 문서(https://docs.fal.ai/model-endpoints/queue/)가 긴 작업엔
// 큐 API 를 쓰라고 명시한다 — 접수(POST)는 즉시 응답이 오고, 완성 여부는 별도로 폴링한다.
// lib/i2v.js·lib/imagegen.js·lib/tts.js 는 여전히 동기 호출이다(안 건드린다) — 컷 단위
// 호출은 지금도 5분 벽 아래라 굳이 큐로 바꿀 이유가 없다.
import { addRecord, costActor, estimateCost, assertBudget } from "../costs.js";
import { fakeFal } from "../fake.js";
import { toDataUri } from "../refs-io.js";
import { adEndpoint, adModel, adRefField, DEFAULT_AD_RESOLUTION } from "./models.js";
import { adRenderTimeoutMs } from "./timing.js";
import { randomUUID } from "crypto";

// 가짜 모드에서 돌려주는 자리표시자. 실제 mp4 가 아니다 — 배선과 상태 전이만 확인한다.
const FAKE_URL = "data:video/mp4;base64,";

// 폴링 간격 — 왜 4초인가: 실측(4초 영상에 134초)에서 너무 자주 물으면 부하만 늘고 상태는
// 안 바뀐다. fal 문서가 권장하는 3~5초 범위의 중간값을 쓴다.
const POLL_INTERVAL_MS = 4000;

// 기본 대기 함수 — 실제 setTimeout. 테스트는 waitImpl 을 주입해 즉시 resolve 시킨다
// (상한이 분 단위라 진짜 setTimeout 을 쓰면 테스트가 그만큼 느려진다).
const realWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 대사를 프롬프트에 못 박는다 — **LLM 의 성의에 기대지 않는다**.
//
// ★ 왜 있나(2026-08-18 실측): 시나리오가 `text`(모델에 넘길 프롬프트)와 `shots[].line`
// (나레이션 대사)을 따로 내는데, "text 안에 그 대사를 넣어라"는 요구가 어디에도 없었다.
// 그래서 실제 문서의 text 2,081자에 나레이션 관련 언급은 "Korean female narration warm
// and cheerful" 하나뿐 — **무슨 말을 하라는지가 없었다.** 모델은 매번 자기가 지어낸 말을
// 하고, 자막(lib/ad/subtitles.js)은 우리 대본을 깔아 음성과 자막이 전혀 다른 영상이 나왔다.
// 지문에 지시를 더했지만 프롬프트 지시는 지켜지지 않을 수 있으니 **나가기 전에 코드가
// 판정한다** — 이 저장소의 규율 그대로다.
//
// ★★★ 2026-08-27 — 이 함수가 하던 **나머지 일곱 절은 film 으로 옮겼다**
// (lib/film/pipeline.js 의 filmClauses). 그전에는 여기서 이야기·무대·외형·인물·색·옷차림·
// 목소리·읽는표기를 프롬프트 꼬리에 덧붙였는데, 광고가 "Fable 이 한 편을 쓰고 코드는 그대로
// 넘긴다"로 바뀌면서 그 값들이 전부 text 안으로 들어갔다. 꼬리에 또 붙이면 같은 말이 두 번
// 나가거나, 한국어 angle 이 영어 프롬프트에 섞이거나, "the person wears ___" 틀에 두 사람이
// 들어가 말이 안 되는 영어가 된다 — 셋 다 실제로 겪었다.
// 사장님이 준 성공 프롬프트 넷(referenece/) 중 이런 꼬리를 단 것은 하나도 없다.
//
// - 이미 들어 있는 대사는 다시 붙이지 않는다(두 번 말하라는 지시가 된다)
// - 대사가 빈 장면은 **말이 없는 장면**이라 억지로 채우지 않는다
// - 붙일 때 "말이지 화면 글자가 아니다"를 못 박는다 — 이 모델들은 글자를 무늬로 그린다
export function withSpokenLines(text, shots) {
  const base = typeof text === "string" ? text : "";
  const list = Array.isArray(shots) ? shots : [];
  // 대조는 **공백·따옴표를 지우고** 한다 — 모델이 대사를 줄바꿈해 넣거나 여는/닫는
  // 따옴표를 다르게 써도 "들어 있다"로 봐야 한다(안 그러면 같은 말을 두 번 붙인다).
  const flat = normalizeForMatch(base);
  const missing = [];
  for (const [i, shot] of list.entries()) {
    const line = typeof shot?.line === "string" ? shot.line.trim() : "";
    if (!line) continue;
    if (flat.includes(normalizeForMatch(line))) continue;
    missing.push({ n: i + 1, line });
  }
  if (!missing.length) return base;

  return [
    base,
    "",
    "Spoken narration — the voice must say these lines exactly, word for word, in this order.",
    "This is speech (audio) only: do not render them as on-screen text, captions, subtitles or titles.",
    ...missing.map(({ n, line }) => `Scene ${n}: "${line}"`),
  ].join("\n");
}

// ★★★ fal 에 보낼 입력을 조립하는 **유일한 자리**(2026-08-21에 함수로 뺐다).
//
// 왜 갈라야 하나: MiniMax H3 를 더하면서 파라미터 이름과 타입이 모델마다 달라졌다.
// fal 의 OpenAPI 스키마를 직접 받아 확인한 차이는 셋이다:
//
//   | | Seedance 2.0 / 2.5 | MiniMax H3 |
//   |---|---|---|
//   | 참조 사진(여러 장) | `image_urls` | `reference_image_urls` |
//   | 참조 사진(한 장) | `image_url` | `reference_image_urls` (배열 하나) |
//
// ★ duration 은 **양쪽 다 숫자를 그대로 보낸다 — 안 바꾼다.**
//   스키마상 Seedance 는 문자열 enum("4"~"15", 2.5 는 "30", "auto")이고 H3 는 정수
//   5~15 다. 즉 Seedance 쪽은 우리가 스키마와 다른 타입을 보내고 있는데, **그 상태로
//   실제 영상이 나왔다**(2.0 라이브 · 2.5 는 사장님 확인). 검증된 동작을 스키마를
//   근거로 미검증 상태로 바꾸지 않는다 — 이 저장소가 "측정 없이 바꾸지 않는다"로
//   부르는 자리다. H3 는 정수가 정답이라 같은 숫자가 그대로 맞다.
//   ⚠️ 언젠가 fal 이 관대함을 거두면 Seedance 쪽이 먼저 깨진다. 그때 문자열로 바꾼다.
//
// ★ 해상도는 값 그대로 넘긴다. Seedance 는 소문자(720p), H3 는 대문자(2K)라 표기가
//   섞이지만, 목록이 처음부터 모델별이라(adResolutionsFor) 섞여도 안 갈린다.
export function buildFalInput({ settings, scenario, refs = [], kind, seconds }) {
  // ★ 참조 사진의 **파라미터 이름은 모델 표가 정한다**(2026-08-21). 그전에는 여기서
  //   `id 가 minimax 로 시작하나`로 갈랐다 — 모델이 늘 때마다 이 줄을 고쳐야 했고,
  //   고치는 것을 잊으면 사진이 통째로 무시된 채 값만 나간다.
  const refField = adRefField(settings?.model);
  const input = {
    // ★ 대사를 여기서 못 박는다 — fal 로 나가는 프롬프트를 조립하는 유일한 자리다.
    // ★ scenario.text 가 곧 프롬프트다. 코드는 대사가 빠졌을 때만 손을 댄다.
    prompt: withSpokenLines(scenario?.text, scenario?.shots),
    duration: seconds,
    aspect_ratio: settings.aspect_ratio,
    // ★ settings.resolution 을 실제로 읽는다. 없으면(옛 문서) 720p — 옛 문서는 전부
    //   Seedance 라 그 값이 맞다(lib/ad/models.js 의 DEFAULT_AD_RESOLUTION 주석 참고).
    resolution: settings.resolution || DEFAULT_AD_RESOLUTION,
  };
  // 참조는 **바이트 또는 주소**다. 업로드는 비공개 버킷이라 URL 을 fal 이 못 읽어
  // 바이트를 data URI 로 넘기지만(lib/imagegen.js 가 이미 푼 문제), 우리가 만든 이미지는
  // fal 에 있는 **공개 주소**라 내려받았다 다시 올릴 이유가 없다(2026-08-19, film 경로).
  const refUri = (r) => (r?.url ? r.url : toDataUri(r.bytes, r.key));
  const uris = refs.map(refUri);
  // ★ i2v 는 **단수 필드**를 받는 다른 엔드포인트다(image-to-video). r2v 는 배열이다.
  //   세 모델의 r2v 스키마 모두 `image_url`(단수)가 **없다** — 실측으로 확인했다.
  if (kind === "i2v" && uris[0]) input.image_url = uris[0];
  else if (uris.length) input[refField] = uris;
  return input;
}

function normalizeForMatch(v) {
  return String(v).replace(/[\s"'\u2018\u2019\u201c\u201d\u300c\u300d]/g, "");
}

// ★★ 2026-08-13 — 접수(submitAdVideo)와 수거(collectAdVideo)를 따로 내보낸다.
//
// 왜: 배포(Vercel 서버리스)는 **응답이 나가면 인스턴스를 얼린다.** 아래 generateAdVideo 는
// 접수부터 완성까지 한 호출 안에서 폴링하는데, 그 호출이 서버리스에서 살아 있을 수 있는
// 시간은 최대 300초다. lib/ad/timing.js 의 실측이 출력 1초당 ≈33.5초라 **15초 광고 하나가
// ≈8.4분** — 어떤 광고도 한 호출 안에 못 끝난다. 늘리는 방향으로는 해결이 안 된다.
//
// 그래서 라우트는 이 둘을 따로 부른다(lib/ad/pipeline.js 의 startAdRender·collectAdRender):
// 호출 하나하나가 몇 초로 끝나 상한과 무관해진다.
//
// generateAdVideo 는 **지우지 않는다** — 한 프로세스에서 끝까지 도는 경로(로컬·스크립트)가
// 그대로 필요하고, 이제 아래 두 조각의 합성이라 로직이 두 벌이 되지 않는다.
export async function submitAdVideo({ project, scenario, refs = [], fetchImpl = fetch }) {
  const settings = project?.settings || {};
  const seconds = Number(settings.seconds) || 15;
  const kind = scenario?.endpoint || "t2v";
  const endpoint = adEndpoint(settings.model, kind);

  if (fakeFal()) return { fake: true, url: FAKE_URL, seconds, endpoint };

  // 나가기 전에 막는다 — 한 번이 $3.63 이다
  // ★ Task 25 — projectId 는 그대로 넘긴다(원장에 프로젝트가 남아야 한다). 프로젝트 축
  // (skipProjectAxis)만 뺀다 — 그 축은 원래 "폭주(무한 루프) 방어"용이다(기존 6단계가
  // 컷마다 fal 을 부르니 한 프로젝트가 폭주하면 막으려던 것). 광고는 한 번 누르면 한
  // 편이 통짜로 나가는 구조라 그 위험이 구조적으로 없다. 전역·잔액·체험 축은 그대로 돈다
  // (assertBudget 안에서 이 옵션과 무관하게 계속 검사된다).
  await assertBudget({ projectId: project.id, endpoint, amount: seconds, skipProjectAxis: true });

  const input = buildFalInput({ settings, scenario, refs, kind, seconds });

  // ① 접수 — 큐 엔드포인트는 즉시 응답한다(영상이 끝나기를 기다리지 않는다).
  const authHeaders = { Authorization: `Key ${process.env.FAL_KEY}` };
  const submitRes = await fetchImpl(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(input),
  });
  if (!submitRes.ok) {
    throw new Error(`영상 접수 실패 (${submitRes.status}) ${(await submitRes.text().catch(() => "")).slice(0, 200)}`);
  }
  const submitted = await submitRes.json();
  const falRequestId = submitted?.request_id;
  const statusUrl = submitted?.status_url;
  const responseUrl = submitted?.response_url;
  // status_url·response_url 은 응답에서 받은 값을 그대로 쓴다 — 우리가 다시 조립하지
  // 않는다. 모델 id 에 슬래시가 여럿이라(bytedance/seedance-2.0/fast/text-to-video)
  // 직접 조립하면 틀리기 쉽다.
  if (!statusUrl || !responseUrl) {
    throw new Error("영상 접수 응답이 이상해요 — status_url/response_url 이 없어요");
  }

  // 접수증. 부르는 쪽이 이것을 **문서에 저장**해 두면, 이 프로세스가 사라져도 다음 요청이
  // 이어서 수거할 수 있다 — 그것이 이 분리의 전부다.
  return { requestId: falRequestId, statusUrl, responseUrl, endpoint, seconds };
}

// 한 번만 물어본다. 아직이면 `{ done: false }`, 끝났으면 결과를 받아 원장까지 남긴다.
//
// ★ 여러 번 불려도 안전해야 한다 — 화면이 2초마다 두드리고 창이 여럿일 수 있다.
//   원장의 request_id 를 **fal 접수번호**로 쓰는 이유가 그것이다: cost_records 는
//   request_id 가 기본키(=멱등키)라, 같은 접수를 두 번 수거해도 행이 하나다.
//   (예전에는 randomUUID 였다 — 한 호출 안에서만 돌던 시절엔 겹칠 일이 없었다.)
export async function collectAdVideo({ project, scenario, job, fetchImpl = fetch }) {
  const settings = project?.settings || {};
  const seconds = Number(job?.seconds) || Number(settings.seconds) || 15;
  const authHeaders = { Authorization: `Key ${process.env.FAL_KEY}` };

  const statusRes = await fetchImpl(job.statusUrl, { headers: authHeaders });
  if (!statusRes.ok) {
    throw new Error(`영상 상태 조회 실패 (${statusRes.status})`);
  }
  const statusData = await statusRes.json();
  if (statusData?.status !== "COMPLETED") return { done: false };

  // 수령 — 동기 호출이 주던 것과 같은 몸통이 온다.
  const resultRes = await fetchImpl(job.responseUrl, { headers: authHeaders });
  if (!resultRes.ok) {
    throw new Error(`영상 생성 실패 (${resultRes.status}) ${(await resultRes.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await resultRes.json();
  const url = data?.video?.url;
  if (!url) throw new Error("영상 결과가 비어 있어요");

  // 원장 — 결과를 받은 뒤에만 기록한다. 접수만 하고 실패하면 fal 이 과금하지 않으므로
  // 원장에도 안 남아야 실제 지출과 맞는다(2026-08-13 실측으로 확인된 성질이다).
  await addRecord({
    request_id: job.requestId || randomUUID(), ts: Date.now(), endpoint: job.endpoint,
    stage: "광고영상", user: costActor(), project_id: project.id,
    prompt: String(scenario?.text || "-").slice(0, 300),
    duration: String(seconds), aspect_ratio: settings.aspect_ratio,
    est_cost_usd: estimateCost(job.endpoint, seconds), status: "done", video_url: url,
  }).catch(() => {});

  return { done: true, url, seconds };
}

// 접수 → 완성까지 한 호출 안에서 끝낸다. **서버리스에서는 못 쓴다**(위 주석 참고) —
// 로컬 개발·측정 스크립트처럼 프로세스가 계속 사는 곳을 위한 합성이다.
export async function generateAdVideo({
  project, scenario, refs = [], fetchImpl = fetch,
  waitImpl = realWait, pollIntervalMs = POLL_INTERVAL_MS, maxWaitMs,
  onRequestId,
}) {
  const job = await submitAdVideo({ project, scenario, refs, fetchImpl });
  if (job.fake) return { url: job.url, seconds: job.seconds };

  // 폴링을 시작하기 전에 부른다: 폴링 도중 죽어도 request_id 는 이미 저장돼 있어야 한다.
  if (job.requestId) await onRequestId?.(job.requestId);

  // 상한은 길이에 비례한다(lib/ad/timing.js) — 15초와 30초가 같은 상한을 받으면 30초
  // 쪽에서 다 만들어진 영상을 상한 초과로 버리게 된다. 인자로 override 가 오면(테스트) 그것을 쓴다.
  //
  // 시간 측정은 실제 경과(Date.now())가 아니라 "틱 수 × 간격"으로 잰다 — waitImpl 을 즉시
  // resolve 로 주입하는 테스트에서도 상한이 결정론적으로 동작해야 하기 때문이다.
  const cap = maxWaitMs ?? adRenderTimeoutMs(job.seconds);
  let elapsedMs = 0;
  for (;;) {
    const got = await collectAdVideo({ project, scenario, job, fetchImpl });
    if (got.done) return { url: got.url, seconds: got.seconds };

    elapsedMs += pollIntervalMs;
    if (elapsedMs >= cap) {
      throw new Error(`영상 생성이 너무 오래 걸려요 (${Math.round(cap / 60000)}분 넘음)`);
    }
    await waitImpl(pollIntervalMs);
  }
}

// 모델의 길이 범위를 벗어나면 만들 수 없다 — 라우트가 이것으로 미리 막는다.
export function fitsAdModel(modelId, seconds) {
  const m = adModel(modelId);
  return seconds >= m.minSeconds && seconds <= m.maxSeconds;
}
