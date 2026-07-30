// fal image-to-video — 컷 이미지를 시작 프레임으로 삼아 움직이게 한다.
import { addRecord, costActor, estimateCost, assertBudget } from "./costs";
import { fakeFal } from "./fake";
import { randomUUID } from "crypto";
import {
  I2V_STEPS, I2V_MAX_SECONDS, fitDuration,
  activeClipProfile, fitDurationFor, maxSecondsFor,
} from "./clip-limits";

// 길이 눈금은 lib/clip-limits.js 에 있다 — 화면도 봐야 해서 fs 의존을 끊어 두었다.
// 여기서 다시 내보내는 이유는 기존 import 경로(lib/i2v)를 깨지 않기 위해서다.
export { I2V_STEPS, I2V_MAX_SECONDS, fitDuration };

export async function generateClip({ imageUrl, seconds, aspect_ratio, prompt, projectId, fetchImpl = fetch }) {
  // 모델마다 받는 길이와 body 가 다르다 — env 가 고른 프로필이 그것을 쥔다
  const profile = activeClipProfile();
  const want = Number(seconds) || 1;
  const duration = fitDurationFor(profile, want);
  // 낭독이 상한을 넘으면 뒤가 잘린다 — 눈금에 맞춘 것(6초로 올림 등)은 잘린 것이 아니다
  const truncated = want > maxSecondsFor(profile);

  // 가짜 모드 — 정지 영상 취급. 이미지 URL을 그대로 클립으로 돌려준다.
  if (fakeFal()) return { url: imageUrl, seconds: duration, truncated };

  const endpoint = process.env.FAL_I2V_ENDPOINT || "fal-ai/ltx-2.3/image-to-video/fast";
  // 클립이 한 편에서 가장 비싸다($1.20/30초) — 여기서 막히는 것이 정상이다
  await assertBudget({ projectId, endpoint, amount: duration });
  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    // prompt 가 이 컷이 어떻게 움직일지를 정한다 — 없으면 모델 재량이 된다(lib/cuts.js buildClipPrompt)
    // profile.extra 는 모델별 필드다(Kling 의 generate_audio:false). 모르는 필드를 다른 모델에
    // 보내면 거절될 수 있어 코드에 분기를 흩지 않고 프로필이 쥔다.
    body: JSON.stringify({ image_url: imageUrl, prompt, duration, aspect_ratio, ...(profile.extra || {}) }),
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
    est_cost_usd: estimateCost(endpoint, duration), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds: duration, truncated };
}
