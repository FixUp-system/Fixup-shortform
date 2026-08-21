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

// 대사를 프롬프트에 못 박는다 — **LLM 의 성의에 기대지 않는다**.
//
// ★ 왜 있나(2026-08-18 실측): 시나리오 SYSTEM 은 `text`(모델에 넘길 지시문)와
// `shots[].line`(나레이션 대사)을 따로 내라고만 했고, "text 안에 그 대사를 넣어라"는
// 요구가 어디에도 없었다. 그래서 실제 문서의 text 2,081자에 나레이션 관련 언급은
// "Korean female narration warm and cheerful" 하나뿐 — **무슨 말을 하라는지가 없었다.**
// 모델은 매번 자기가 지어낸 말을 하고, 자막(lib/ad/subtitles.js)은 우리 대본을 깔아
// 음성과 자막이 전혀 다른 영상이 나왔다. SYSTEM 에 지시를 더했지만(lib/ad/scenario.js)
// 프롬프트 지시는 지켜지지 않을 수 있으니 **나가기 전에 코드가 판정한다**.
//
// - 이미 들어 있는 대사는 다시 붙이지 않는다(두 번 말하라는 지시가 된다)
// - 대사가 빈 장면은 **말이 없는 장면**이라 억지로 채우지 않는다
// - 붙일 때 "말이지 화면 글자가 아니다"를 못 박는다 — 자막은 우리가 ffmpeg 로 태운다
export function withSpokenLines(text, shots, voice, scenario) {
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
  // ★★ 목소리는 **대사 보강과 다른 판정**이다(2026-08-19). 실측: Claude 가 대사를 늘
  //   text 안에 넣어 주기 때문에 위 missing 은 거의 늘 비고, 그래서 아래 보강 절은
  //   사실상 안 켜진다. 목소리를 그 절에 얹으면 함께 안 나간다 — 따로 붙인다.
  // ★ voice 는 "누가 어떤 톤으로 읽는가"고, 지금까지 아무도 안 정해서 영상 모델이
  //   기본값으로 읽었다("AI 가 읽어주는 느낌"). 없으면 예전 그대로 아무것도 안 붙는다.
  // ★★ 단계별에 있고 여기 없던 셋(2026-08-19). lib/cuts.js 는 컷마다 붙이는데
  //   이 경로는 지시문이 하나뿐이라 한 번씩 붙인다.
  // ★ 값이 없으면 그 줄이 통째로 없다 — 옛 문서의 지시문이 글자 그대로다(각인 보호).
  const one = (v) => (typeof v === "string" ? v.trim() : "");
  const tone = one(scenario?.tone);
  const look = one(scenario?.look);
  const extra = [];
  // ★ 이야기 — 장면을 이어 붙이는 것은 영상 모델이므로 무슨 이야기인지 알아야 한다.
  //   맨 앞에 둔다: 나머지 절(무대·외형·색·음악)이 이 이야기를 받치는 값들이다.
  const angle = one(scenario?.angle);
  if (angle) extra.push("", `The story this film tells: ${angle}`);
  // ★ 무대 — 영상 하나에 하나. 장소가 컷마다 튀면 15초 안에 여러 곳을 점프한다.
  const environment = one(scenario?.environment);
  if (environment) extra.push("", `The whole film takes place in ${environment}.`);
  // 외형이 먼저다 — 무엇을 그리는가가 어떻게 보이는가보다 앞선다(단계별 절 순서와 같다).
  if (look) extra.push("", `Subject appearance, keep identical throughout: ${look}.`);
  // ★★ 사람의 생김새(2026-08-21). look 은 **물건 전용**이라(SYSTEM: "중심이 물건일 때")
  //   사람이 주인공인 영상에서는 그 절이 통째로 안 나갔다 — 옷은 고정되는데 얼굴은
  //   모델 재량이었다. 옷차림 바로 앞에 둔다: 누구인지가 무엇을 입었는지보다 앞이다.
  // ★ 값이 없으면 그 줄이 통째로 없다 — 옛 문서의 지시문이 글자 그대로다(각인 보호).
  const cast = one(scenario?.cast);
  if (cast) extra.push("", `The person, keep identical throughout: ${cast}.`);
  if (tone) extra.push("", `Color treatment, keep identical throughout: ${tone}.`);
  // ★ 옷차림 — 영상에서 옷이 바뀌면 그림을 맞춰도 소용없다(제품과 톤이 어긋나던 자리다).
  const wardrobe = one(scenario?.wardrobe);
  if (wardrobe) extra.push("", `Wardrobe, keep identical throughout: the person wears ${wardrobe}.`);
  // ★★ **music 은 싣지 않는다**(2026-08-19 사장님 결정). 이 절은 **분할 생성의 문제**를
  //   풀려고 만든 것이다 — lib/cuts.js 주석: "배경음은 모델이 컷마다 따로 만든다. 첫 컷은
  //   조용하고 둘째 컷에만 음악이 나오고, 나와도 서로 다른 곡이었다." 통짜로 굽는 이 경로는
  //   15초를 한 번에 만드니 음악도 하나다 — 그 문제가 없다.
  //   ★ 실측: music 이 든 영상은 film 셋뿐이고 어색했다. 광고 일곱 편은 전부 music 없이
  //     만들어졌고 자연스러웠다. 값이 "hand claps · light percussion" 같은 리듬 강한 소리를
  //     요구하면 나레이션을 밀어낸다 — seedance 는 목소리와 음악을 **한 트랙에 섞어** 내보내
  //     우리가 볼륨을 못 고친다.
  //   ★ 시나리오의 music 칸은 **남긴다** — 되살릴 때 이 세 줄이면 되고, 우리가 ffmpeg 로
  //     직접 깔 때(lib/compose.js 의 musicPath) 그 값을 쓸 수 있다. 그때는 볼륨이 우리 것이다.

  // ★★ 읽는 표기 — line 은 자막이고 say_as 는 소리다. 대사 보강(missing)과 **다른
  //   판정**이다: 대사가 지시문에 이미 있어도 읽는 표기는 따로 말해야 한다.
  const sayAs = (Array.isArray(shots) ? shots : [])
    .map((sh) => ({ line: (sh?.line || "").trim(), as: (sh?.say_as || "").trim() }))
    .filter((x) => x.line && x.as && x.line !== x.as);

  const spoken = typeof voice === "string" ? voice.trim() : "";
  const voiceLines = spoken
    ? ["", `Voice: ${spoken}. This describes how the narration sounds — it is audio only, never on-screen text.`]
    : [];

  const sayAsLines = sayAs.length
    ? ["", "Pronunciation — read these lines aloud as written on the right, not on the left. The left spelling is only for our subtitles:",
       ...sayAs.map((x) => `"${x.line}" → say it as "${x.as}"`)]
    : [];

  const head = [...extra, ...voiceLines, ...sayAsLines];
  if (!missing.length) return head.length ? [base, ...head].join("\n") : base;

  return [
    base,
    ...head,
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
  const isH3 = String(settings?.model || "").startsWith("minimax");
  const input = {
    // ★ 대사를 여기서 못 박는다 — fal 로 나가는 프롬프트를 조립하는 유일한 자리다.
    prompt: withSpokenLines(scenario?.text, scenario?.shots, scenario?.voice, scenario),
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
  if (isH3) {
    // H3 는 한 장이든 여러 장이든 같은 배열 하나다 — `image_url`(단수) 자체가 없다.
    if (uris.length) input.reference_image_urls = uris;
  } else {
    if (kind === "i2v" && uris[0]) input.image_url = uris[0];
    if (kind === "r2v" && uris.length) input.image_urls = uris;
  }
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
