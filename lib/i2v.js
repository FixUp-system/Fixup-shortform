// fal image-to-video — 컷 이미지를 시작 프레임으로 삼아 움직이게 한다.
import { addRecord, costActor, estimateCost, assertBudget, LEDGER_PROMPT_MAX } from "./costs";
import { fakeFal } from "./fake";
import { randomUUID } from "crypto";
import {
  I2V_STEPS, I2V_MAX_SECONDS, fitDuration,
  clipProfileForProject, endpointForProject, fitDurationFor, maxSecondsFor,
  refEndpointForProject, resolutionForProject, seedForProject,
} from "./clip-limits";
import { toDataUri } from "./refs-io.js";

// 길이 눈금은 lib/clip-limits.js 에 있다 — 화면도 봐야 해서 fs 의존을 끊어 두었다.
// 여기서 다시 내보내는 이유는 기존 import 경로(lib/i2v)를 깨지 않기 위해서다.
export { I2V_STEPS, I2V_MAX_SECONDS, fitDuration };

// ★★★ 2026-08-31 — **큐로 옮겼다.** 그전에는 동기 호출(`https://fal.run/…`)로 영상이
//   끝날 때까지 연결을 붙잡았는데, **300초에 끊긴다**(undici 헤더 타임아웃). fal 은 그것과
//   무관하게 계속 만들어 완료했고 우리만 `fetch failed` 를 받고 URL 을 잃었다 —
//   **$0.90 이 나가고 영상은 못 받았다**(사장님이 fal.ai 대시보드에서 확인).
//
//   그 전제는 lib/ad/generate.js 머리말에 적혀 있었다: *"lib/i2v.js 는 **컷 하나(5~10초)**
//   라 fal.run 동기 호출이 5분 안에 끝났다."* **통짜는 컷 하나가 아니라 한 편 전체**다 —
//   원클릭(코드에선 ad)이 2026-08-13 에 큐로 옮긴 바로 그 이유다.
//
// ★ 조각이 셋이다: 접수(submitClip) · 수거(collectClip) · 둘의 합성(generateClip).
//   합성은 **지우지 않는다** — 컷별 갈래와 측정 스크립트가 한 프로세스 안에서 끝까지 돈다.

// 접수 — 큐에 던지고 **즉시** 돌아온다. 돌려주는 접수증을 부르는 쪽이 문서에 저장해 두면,
// 이 프로세스가 사라져도 다음 요청이 이어서 수거할 수 있다. 그것이 이 분리의 전부다.
export async function submitClip({ imageUrl, refs, seconds, aspect_ratio, prompt, projectId, project, fetchImpl = fetch }) {
  // 모델마다 받는 길이와 body 가 다르다 — **프로젝트**가 고른 모델의 프로필이 그것을 쥔다.
  const profile = clipProfileForProject(project);
  const want = Number(seconds) || 1;
  const duration = fitDurationFor(profile, want);
  // 낭독이 상한을 넘으면 뒤가 잘린다 — 눈금에 맞춘 것(6초로 올림 등)은 잘린 것이 아니다
  const truncated = want > maxSecondsFor(profile);

  // ★★ 참조를 들고 왔는가(2026-08-21). 들고 왔으면 **뜻이 다른 엔드포인트**로 간다 —
  //   i2v 의 그림은 첫 프레임이고, r2v 의 그림들은 생김새 참조다.
  const refList = Array.isArray(refs) && refs.length ? refs : null;

  // 가짜 모드 — **큐를 안 탄다.** 그 자리에서 끝난다(배선과 상태 전이만 확인하는 모드다).
  // ★★ 실제로 만든 한 편을 준다(2026-08-25 사장님 지시) — 소리도 자막도 있어 ⑤⑥ 배치를
  //   0원으로 검토할 수 있다. ⚠️ 가짜 판정 안에서만 쓴다.
  if (fakeFal()) return { fake: true, url: "/samples/reel-15s.mp4", seconds: duration, truncated };

  const refEndpoint = refList ? refEndpointForProject(project) : null;
  // ★ 조용히 i2v 로 떨어뜨리지 않는다 — 사장님이 고른 참조가 통째로 무시된 채 값만 나간다.
  if (refList && !refEndpoint) {
    throw new Error("이 모델은 참조 이미지를 받지 않아요 — 모델을 바꿔 주세요");
  }
  const endpoint = refEndpoint || endpointForProject(project);
  // 사장님이 ⑤에서 고른 화질. **프로필이 해상도를 여는 모델에만** 실린다.
  const resolution = resolutionForProject(project);
  // ★ 씨앗 — 컷마다 **같은** 값이라야 뜻이 있다(clip-limits 의 clipSeed 머리말).
  const seed = seedForProject(project, projectId);

  // 클립이 한 편에서 가장 비싸다 — 여기서 막히는 것이 정상이다.
  // ★ 접수 **앞**이다. 잔액 없이 fal 이 나가는 길을 안 만든다(원클릭과 같은 순서).
  await assertBudget({ projectId, endpoint, amount: duration, resolution });

  const authHeaders = { Authorization: `Key ${process.env.FAL_KEY}` };
  const res = await fetchImpl(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      // 업로드는 비공개 버킷이라 fal 이 URL 을 못 읽는다 — 바이트면 data URI 로 넘긴다
      ...(refList
        // ★★ 필드 이름을 **프로필이 쥔다**(2026-08-31). 손으로 적혀 있던 `image_urls` 는
        //   Seedance 의 이름이고, H3 는 `reference_image_urls` 다.
        ? { [profile.refsField || "image_urls"]: [imageUrl, ...refList.map((r) => (r?.url ? r.url : toDataUri(r.bytes, r.key)))].filter(Boolean) }
        : { image_url: imageUrl }),
      prompt, duration, aspect_ratio,
      ...(resolution ? { resolution } : {}),
      ...(seed ? { seed } : {}),
      ...(profile.extra || {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`영상 접수 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const submitted = await res.json();
  // ★ status_url·response_url 은 **응답에서 받은 값을 그대로** 쓴다 — 우리가 조립하지
  //   않는다. 모델 id 에 슬래시가 여럿이라(bytedance/seedance-2.0/…) 조립하면 틀리기 쉽다.
  const statusUrl = submitted?.status_url;
  const responseUrl = submitted?.response_url;
  if (!statusUrl || !responseUrl) {
    throw new Error("영상 접수 응답이 이상해요 — status_url/response_url 이 없어요");
  }
  return {
    requestId: submitted?.request_id, statusUrl, responseUrl,
    endpoint, seconds: duration, truncated, resolution, seed,
  };
}

// 수거 — **한 번만** 물어본다. 아직이면 `{done:false}`, 끝났으면 결과를 받아 원장까지 남긴다.
//
// ★ 여러 번 불려도 안전해야 한다 — 화면이 2초마다 두드리고 창이 여럿일 수 있다.
//   원장의 `request_id` 를 **fal 접수번호**로 쓰는 이유가 그것이다: cost_records 는
//   request_id 가 기본키(=멱등키)라, 같은 접수를 두 번 수거해도 행이 하나다.
// ★ 원장은 **결과를 받은 뒤에만** 적는다 — 접수만 하고 실패하면 fal 이 과금하지 않으므로
//   원장에도 안 남아야 실제 지출과 맞는다(원클릭이 2026-08-13 실측으로 확인한 성질).
export async function collectClip({ job, projectId, prompt, aspect_ratio, resolution, fetchImpl = fetch }) {
  const authHeaders = { Authorization: `Key ${process.env.FAL_KEY}` };
  const statusRes = await fetchImpl(job.statusUrl, { headers: authHeaders });
  if (!statusRes.ok) throw new Error(`영상 상태 조회 실패 (${statusRes.status})`);
  const statusData = await statusRes.json();
  if (statusData?.status !== "COMPLETED") return { done: false };

  const resultRes = await fetchImpl(job.responseUrl, { headers: authHeaders });
  if (!resultRes.ok) {
    throw new Error(`영상 생성 실패 (${resultRes.status}) ${(await resultRes.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await resultRes.json();
  const url = data?.video?.url;
  if (!url) throw new Error("영상 결과가 비어 있어요");

  const res = resolution ?? job.resolution;
  await addRecord({
    request_id: job.requestId || randomUUID(), ts: Date.now(), endpoint: job.endpoint,
    stage: "영상", user: costActor(), project_id: projectId,
    // 자르는 자리는 lib/costs.js 의 LEDGER_PROMPT_MAX 하나다.
    prompt: (prompt || "-").slice(0, LEDGER_PROMPT_MAX), duration: String(job.seconds), aspect_ratio,
    // ★ 씨앗도 남긴다 — "왜 이 목소리였나"를 나중에 추적할 유일한 채널이다.
    ...(job.seed ? { seed: job.seed } : {}),
    est_cost_usd: estimateCost(job.endpoint, job.seconds, res), status: "done", video_url: url,
  }).catch(() => {});

  return { done: true, url, seconds: job.seconds, truncated: job.truncated };
}

// 접수 → 완성까지 **한 호출 안에서**, 동기 엔드포인트(`fal.run`)로 끝낸다.
//
// ★★ **이 길은 안 건드린다**(2026-08-31). 컷별 갈래는 컷 하나가 5~10초라 5분 안에 끝나고,
//   그 전제가 아직 유효하다(lib/ad/generate.js 머리말의 그 문장). 큐로 옮긴 것은 **통짜뿐**
//   이다 — 통짜만 한 편 전체라 300초를 넘긴다.
// ⚠️ 그러니 **여기에 긴 영상을 태우지 마라.** 길어지는 순간 그 호출은 300초에 끊기고
//   fal 은 계속 만들어 과금한다 — 우리가 2026-08-31 에 $0.90 을 그렇게 잃었다.
//   길어질 자리는 submitClip/collectClip 을 쓴다.
export async function generateClip({ imageUrl, refs, seconds, aspect_ratio, prompt, projectId, project, fetchImpl = fetch }) {
  const profile = clipProfileForProject(project);
  const want = Number(seconds) || 1;
  const duration = fitDurationFor(profile, want);
  const truncated = want > maxSecondsFor(profile);
  const refList = Array.isArray(refs) && refs.length ? refs : null;

  if (fakeFal()) return { url: "/samples/reel-15s.mp4", seconds: duration, truncated };

  const refEndpoint = refList ? refEndpointForProject(project) : null;
  if (refList && !refEndpoint) {
    throw new Error("이 모델은 참조 이미지를 받지 않아요 — 모델을 바꿔 주세요");
  }
  const endpoint = refEndpoint || endpointForProject(project);
  const resolution = resolutionForProject(project);
  const seed = seedForProject(project, projectId);

  await assertBudget({ projectId, endpoint, amount: duration, resolution });
  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify({
      ...(refList
        ? { [profile.refsField || "image_urls"]: [imageUrl, ...refList.map((r) => (r?.url ? r.url : toDataUri(r.bytes, r.key)))].filter(Boolean) }
        : { image_url: imageUrl }),
      prompt, duration, aspect_ratio,
      ...(resolution ? { resolution } : {}),
      ...(seed ? { seed } : {}),
      ...(profile.extra || {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`영상 생성 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.video?.url;
  if (!url) throw new Error("영상 결과가 비어 있어요");

  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    stage: "영상", user: costActor(), project_id: projectId,
    prompt: (prompt || "-").slice(0, LEDGER_PROMPT_MAX), duration: String(duration), aspect_ratio,
    ...(seed ? { seed } : {}),
    est_cost_usd: estimateCost(endpoint, duration, resolution), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds: duration, truncated };
}
