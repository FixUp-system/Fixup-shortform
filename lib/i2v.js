// fal image-to-video — 컷 이미지를 시작 프레임으로 삼아 움직이게 한다.
import { addRecord, costActor, estimateCost, assertBudget } from "./costs";
import { fakeFal } from "./fake";
import { randomUUID } from "crypto";

// i2v 모델의 현실적 상한.
// 원고 컷이 이보다 길게 나오는 경우가 있다(12~13초). 그런 컷은 잘라 만들고,
// 남는 시간은 합성에서 마지막 프레임 정지로 늘린다(lib/compose.js).
// 컷을 애초에 잘게 나누는 것이 근본 해결이지만 그건 컷 분할 쪽 과제다.
export const I2V_MAX_SECONDS = 10;

export async function generateClip({ imageUrl, seconds, aspect_ratio, projectId, fetchImpl = fetch }) {
  const want = Number(seconds) || 1;
  const duration = Math.min(Math.max(want, 1), I2V_MAX_SECONDS);
  const truncated = want > I2V_MAX_SECONDS;

  // 가짜 모드 — 정지 영상 취급. 이미지 URL을 그대로 클립으로 돌려준다.
  if (fakeFal()) return { url: imageUrl, seconds: duration, truncated };

  const endpoint = process.env.FAL_I2V_ENDPOINT || "fal-ai/ltx-2.3/image-to-video/fast";
  // 클립이 한 편에서 가장 비싸다($1.20/30초) — 여기서 막히는 것이 정상이다
  await assertBudget({ projectId, endpoint, amount: duration });
  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify({ image_url: imageUrl, duration, aspect_ratio }),
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
    prompt: "-", duration: String(duration), aspect_ratio,
    est_cost_usd: estimateCost(endpoint, duration), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds: duration, truncated };
}
