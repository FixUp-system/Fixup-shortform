// fal image-to-video — 컷 이미지를 시작 프레임으로 삼아 움직이게 한다.
import { addRecord, costActor, estimateCost, assertBudget } from "./costs";
import { fakeFal } from "./fake";
import { randomUUID } from "crypto";
import {
  I2V_STEPS, I2V_MAX_SECONDS, fitDuration,
  clipProfileForProject, endpointForProject, fitDurationFor, maxSecondsFor,
  resolutionForProject,
} from "./clip-limits";

// 길이 눈금은 lib/clip-limits.js 에 있다 — 화면도 봐야 해서 fs 의존을 끊어 두었다.
// 여기서 다시 내보내는 이유는 기존 import 경로(lib/i2v)를 깨지 않기 위해서다.
export { I2V_STEPS, I2V_MAX_SECONDS, fitDuration };

export async function generateClip({ imageUrl, seconds, aspect_ratio, prompt, projectId, project, fetchImpl = fetch }) {
  // 모델마다 받는 길이와 body 가 다르다 — **프로젝트**가 고른 모델의 프로필이 그것을 쥔다.
  // env 는 폐지됐다. project 를 안 넘기면 레거시(Kling)로 떨어진다 —
  // 옛 호출부가 조용히 다른 모델로 갈아타 비싸지는 것보다 낫다(clip-limits 의 LEGACY_I2V_MODEL).
  const profile = clipProfileForProject(project);
  const want = Number(seconds) || 1;
  const duration = fitDurationFor(profile, want);
  // 낭독이 상한을 넘으면 뒤가 잘린다 — 눈금에 맞춘 것(6초로 올림 등)은 잘린 것이 아니다
  const truncated = want > maxSecondsFor(profile);

  // 가짜 모드 — 정지 영상 취급. 이미지 URL을 그대로 클립으로 돌려준다.
  if (fakeFal()) return { url: imageUrl, seconds: duration, truncated };

  // 엔드포인트도 프로필과 같은 곳에서 받는다 — 여기서 `env || "..."` 를 다시 쓰면
  // 기본값이 두 군데가 되고, 갈리는 날 프로필과 모델이 어긋난다(clip-limits 주석 참조).
  const endpoint = endpointForProject(project);
  // 사장님이 ⑤에서 고른 화질. **프로필이 해상도를 여는 모델에만** 실린다 —
  // 안 여는 모델(Kling·LTX)에서는 `""` 라 요청 본문에 키 자체가 안 생긴다.
  // 모르는 필드를 보내면 fal 이 거절할 수 있다.
  const resolution = resolutionForProject(project);
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
      image_url: imageUrl, prompt, duration, aspect_ratio,
      ...(resolution ? { resolution } : {}),
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
    prompt: (prompt || "-").slice(0, 300), duration: String(duration), aspect_ratio,
    // ★ 해상도를 함께 넘긴다 — Seedance 2.0 은 단가가 해상도로 갈린다($0.3034 vs $0.682).
    //   안 넘기면 1080p 를 사고 720p 로 기록되어 원장과 실청구가 갈린다.
    est_cost_usd: estimateCost(endpoint, duration, resolution), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds: duration, truncated };
}
