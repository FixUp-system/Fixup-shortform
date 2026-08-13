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
import { adEndpoint, adModel, DEFAULT_AD_RESOLUTION } from "./models.js";
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

  const input = {
    prompt: scenario.text,
    duration: seconds,
    aspect_ratio: settings.aspect_ratio,
    // ★ Task 25 — settings.resolution 을 실제로 읽는다. 없으면(옛 문서) 720p — 지금까지
    // 실제로 fal 에 보내 온 값과 같다(lib/ad/models.js 의 DEFAULT_AD_RESOLUTION 주석 참고).
    resolution: settings.resolution || DEFAULT_AD_RESOLUTION,
  };
  // 업로드는 비공개 버킷이라 URL 을 fal 이 못 읽는다 — 바이트를 data URI 로 넘긴다
  // (lib/imagegen.js 가 이미 푼 문제이고 같은 헬퍼를 쓴다).
  if (kind === "i2v" && refs[0]) input.image_url = toDataUri(refs[0].bytes, refs[0].key);
  if (kind === "r2v" && refs.length) input.image_urls = refs.map((r) => toDataUri(r.bytes, r.key));

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
