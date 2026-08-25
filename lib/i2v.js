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

export async function generateClip({ imageUrl, refs, seconds, aspect_ratio, prompt, projectId, project, fetchImpl = fetch }) {
  // 모델마다 받는 길이와 body 가 다르다 — **프로젝트**가 고른 모델의 프로필이 그것을 쥔다.
  // env 는 폐지됐다. project 를 안 넘기면 레거시(Kling)로 떨어진다 —
  // 옛 호출부가 조용히 다른 모델로 갈아타 비싸지는 것보다 낫다(clip-limits 의 LEGACY_I2V_MODEL).
  const profile = clipProfileForProject(project);
  const want = Number(seconds) || 1;
  const duration = fitDurationFor(profile, want);
  // 낭독이 상한을 넘으면 뒤가 잘린다 — 눈금에 맞춘 것(6초로 올림 등)은 잘린 것이 아니다
  const truncated = want > maxSecondsFor(profile);

  // ★★ 참조를 들고 왔는가(2026-08-21). 들고 왔으면 **뜻이 다른 엔드포인트**로 간다 —
  //   i2v 의 그림은 첫 프레임이고, r2v 의 그림들은 생김새 참조다.
  // ★ 빈 배열은 없는 것으로 본다 — 컷에 꽂힌 참조가 하나도 없는 것은 정상이고,
  //   그때 r2v 로 가면 참조 없이 r2v 를 부르는 뜻 없는 호출이 된다.
  const refList = Array.isArray(refs) && refs.length ? refs : null;

  // 가짜 모드 — 정지 영상 취급. 우리가 보낸 그림을 그대로 클립으로 돌려준다.
  // ★★ 2026-08-25 — 첫 프레임이 **없는** 호출이 생겼다(스토리보드 한 장을 참조로만 보내는
  //   통짜 굽기, lib/reel/pipeline.js 의 runReelOneShot). 그때 imageUrl 은 null 이라
  //   예전대로면 `{url: null}` 이 나가 가짜 관통에서 클립이 통째로 사라진다 — 0원 관통은
  //   이 저장소에서 유일하게 공짜인 검증이라 거기서 갈래를 죽이면 안 된다.
  //   그래서 "우리가 보낸 첫 그림"으로 떨어진다(참조 목록의 첫 장).
  // ★★ 가짜 모드 — **실제로 만든 한 편**을 준다(2026-08-25 사장님 지시).
  //   지금까지는 imageUrl 을 그대로 돌려줘 **정지 그림**이었다 — 재생해도 아무 일도
  //   안 일어나서 ⑤⑥ 배치를 0원으로 검토할 수 없었다. 표본에는 소리도 있어
  //   자막이 어디 걸리는지까지 볼 수 있다.
  // ⚠️ 가짜 판정 **안에서만** 쓴다 — 진짜 모드가 표본을 주면 사장님이
  //   자기 영상을 받은 줄 안다.
  if (fakeFal()) return { url: "/samples/reel-15s.mp4", seconds: duration, truncated };

  // 엔드포인트도 프로필과 같은 곳에서 받는다 — 여기서 `env || "..."` 를 다시 쓰면
  // 기본값이 두 군데가 되고, 갈리는 날 프로필과 모델이 어긋난다(clip-limits 주석 참조).
  const refEndpoint = refList ? refEndpointForProject(project) : null;
  // ★ 조용히 i2v 로 떨어뜨리지 않는다 — 사장님이 고른 참조가 통째로 무시된 채 값만 나간다.
  if (refList && !refEndpoint) {
    throw new Error("이 모델은 참조 이미지를 받지 않아요 — 모델을 바꿔 주세요");
  }
  const endpoint = refEndpoint || endpointForProject(project);
  // 사장님이 ⑤에서 고른 화질. **프로필이 해상도를 여는 모델에만** 실린다 —
  // 안 여는 모델(Kling·LTX)에서는 `""` 라 요청 본문에 키 자체가 안 생긴다.
  // 모르는 필드를 보내면 fal 이 거절할 수 있다.
  const resolution = resolutionForProject(project);
  // ★ 씨앗 — 컷마다 **같은** 값이라야 뜻이 있다. 프로젝트 id 에서 파므로 한 편의 모든 컷이
  //   같은 값을 받고, 저장하는 자리가 없어 두 벌이 될 자리도 없다(clip-limits 의 clipSeed).
  //   0 이면 안 싣는다 — 씨앗을 여는 모델(Seedance)이 아니거나 프로젝트 id 가 없는 호출이다.
  // ★★ 이 값은 **각인(clipKey)에 넣지 않는다.** 각인의 규칙은 "프롬프트에 실리는 것만 담는다"
  //   이고 씨앗은 프롬프트가 아니라 요청 필드다. 넣으면 이미 값을 치른 클립 전부의 각인이
  //   불일치가 되어(옛 클립에는 씨앗이 없다) 컷당 $0.674 재구매가 열린다. 게다가 씨앗은
  //   프로젝트 id 에서 파생돼 **절대 바뀌지 않으므로**, 각인에 담아 얻는 것도 0 이다.
  const seed = seedForProject(project, projectId);
  // 클립이 한 편에서 가장 비싸다($1.20/30초) — 여기서 막히는 것이 정상이다
  // ★ 화질을 함께 넘긴다 — 안 넘기면 1080p 클립을 720p 원가로 재서 그물이 느슨해지고,
  //   아래 원장 기록(estimateCost(endpoint, duration, resolution))과도 값이 갈린다.
  await assertBudget({ projectId, endpoint, amount: duration, resolution });
  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    // prompt 가 이 컷이 어떻게 움직일지를 정한다 — 없으면 모델 재량이 된다(lib/cuts.js buildClipPrompt)
    // profile.extra 는 모델별 필드다(Kling 의 generate_audio:false). 모르는 필드를 다른 모델에
    // 보내면 거절될 수 있어 코드에 분기를 흩지 않고 프로필이 쥔다.
    body: JSON.stringify({
      // 업로드는 비공개 버킷이라 fal 이 URL 을 못 읽는다 — 바이트면 data URI 로 넘긴다
      // (lib/imagegen.js:66 · lib/ad/generate.js:170 과 같은 규약).
      ...(refList
        // ★ 빈 자리는 버린다(2026-08-25) — 첫 프레임 없이 **참조만** 보내는 호출이 있다
        //   (스토리보드 한 장을 통째로 주는 통짜 굽기). 지금까지 imageUrl 은 언제나 있었으므로
        //   기존 호출부의 본문은 한 글자도 안 바뀐다.
        ? { image_urls: [imageUrl, ...refList.map((r) => (r?.url ? r.url : toDataUri(r.bytes, r.key)))].filter(Boolean) }
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
    // 자르는 자리는 lib/costs.js 의 LEDGER_PROMPT_MAX 하나다 — 왜 그 값인지도 거기 있다.
    prompt: (prompt || "-").slice(0, LEDGER_PROMPT_MAX), duration: String(duration), aspect_ratio,
    // ★ 해상도를 함께 넘긴다 — Seedance 2.0 은 단가가 해상도로 갈린다($0.3034 vs $0.682).
    //   안 넘기면 1080p 를 사고 720p 로 기록되어 원장과 실청구가 갈린다.
    // ★ 씨앗도 남긴다 — "왜 이 목소리였나"를 나중에 추적할 유일한 채널이다(프롬프트가
    //   그랬듯이). **새 컬럼이 아니다**: cost_records 의 meta(jsonb)로 들어간다 —
    //   duration·aspect_ratio·video_url 이 이미 그 자리다(lib/store/supabase.js insertCost).
    //   안 실은 모델(Kling)의 행에는 키 자체가 안 생긴다 — 0 을 적으면 "씨앗 0 으로 만들었다"
    //   처럼 보인다.
    ...(seed ? { seed } : {}),
    est_cost_usd: estimateCost(endpoint, duration, resolution), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds: duration, truncated };
}
