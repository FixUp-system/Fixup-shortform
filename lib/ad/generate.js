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
import { adEndpoint, adModel } from "./models.js";
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

export async function generateAdVideo({
  project, scenario, refs = [], fetchImpl = fetch,
  waitImpl = realWait, pollIntervalMs = POLL_INTERVAL_MS, maxWaitMs,
  onRequestId,
}) {
  const settings = project?.settings || {};
  const seconds = Number(settings.seconds) || 15;
  const kind = scenario?.endpoint || "t2v";
  const endpoint = adEndpoint(settings.model, kind);
  // 상한은 길이에 비례한다(lib/ad/timing.js) — 15초와 30초가 같은 상한을 받으면 30초
  // 쪽에서 다 만들어진 영상을 상한 초과로 버리게 된다. 인자로 override 가 오면(테스트)
  // 그것을 쓴다.
  const cap = maxWaitMs ?? adRenderTimeoutMs(seconds);

  if (fakeFal()) return { url: FAKE_URL, seconds };

  // 나가기 전에 막는다 — 한 번이 $3.63 이다
  await assertBudget({ projectId: project.id, endpoint, amount: seconds });

  const input = {
    prompt: scenario.text,
    duration: seconds,
    aspect_ratio: settings.aspect_ratio,
    resolution: "720p",
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

  // request_id 를 문서에 저장할 기회를 준다 — 서버가 재시작되면 이 폴링 루프 자체가
  // 사라진다. 지금은 이어붙이기를 만들지 않는다(범위 밖) — 저장만 해 두면 나중에
  // 이어붙일 길이 남는다. 폴링을 시작하기 전에 부른다: 폴링 도중 죽어도 request_id 는
  // 이미 저장돼 있어야 하기 때문이다(끝난 뒤에만 부르면 저장이 무의미해진다).
  if (falRequestId) await onRequestId?.(falRequestId);

  // ② 폴링 — 완성될 때까지 상태를 묻는다.
  //   상한(cap)은 "안전 계수 + 큐 대기 여유"를 더한 값이다(lib/ad/timing.js 주석 참고).
  //   시간 측정은 실제 경과(Date.now())가 아니라 "틱 수 × 간격"으로 잰다 — waitImpl 을
  //   즉시 resolve 로 주입하는 테스트에서도 상한이 결정론적으로 동작해야 하기 때문이다
  //   (실제 setTimeout 을 기다리게 하면 상한이 분 단위라 테스트가 그만큼 느려진다).
  let elapsedMs = 0;
  for (;;) {
    const statusRes = await fetchImpl(statusUrl, { headers: authHeaders });
    if (!statusRes.ok) {
      throw new Error(`영상 상태 조회 실패 (${statusRes.status})`);
    }
    const statusData = await statusRes.json();
    if (statusData?.status === "COMPLETED") break;

    elapsedMs += pollIntervalMs;
    if (elapsedMs >= cap) {
      throw new Error(`영상 생성이 너무 오래 걸려요 (${Math.round(cap / 60000)}분 넘음)`);
    }
    await waitImpl(pollIntervalMs);
  }

  // ③ 수령 — 동기 호출이 주던 것과 같은 몸통이 온다.
  const resultRes = await fetchImpl(responseUrl, { headers: authHeaders });
  if (!resultRes.ok) {
    throw new Error(`영상 생성 실패 (${resultRes.status}) ${(await resultRes.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await resultRes.json();
  const url = data?.video?.url;
  if (!url) throw new Error("영상 결과가 비어 있어요");

  // ④ 원장 — 결과를 받은 뒤에만 기록한다. 접수만 하고 실패하면 fal 이 과금하지 않으므로
  // 원장에도 안 남아야 실제 지출과 맞는다(이번 실패에서 실측으로 확인된 성질이다).
  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    stage: "광고영상", user: costActor(), project_id: project.id,
    prompt: String(scenario.text || "-").slice(0, 300),
    duration: String(seconds), aspect_ratio: settings.aspect_ratio,
    est_cost_usd: estimateCost(endpoint, seconds), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds };
}

// 모델의 길이 범위를 벗어나면 만들 수 없다 — 라우트가 이것으로 미리 막는다.
export function fitsAdModel(modelId, seconds) {
  const m = adModel(modelId);
  return seconds >= m.minSeconds && seconds <= m.maxSeconds;
}
