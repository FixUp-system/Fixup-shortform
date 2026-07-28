// fal TTS — 컷 하나(문장 하나)를 읽는다.
//
// 원고를 통째로 읽히지 않고 컷별로 나눠 읽는 이유는 하나다: 길이를 알아야 한다.
// 이 길이가 곧 클립 길이(⑤영상)이자 자막 타이밍(⑥완성)이 된다.
// 컷은 이미 문장 단위로 잘려 있어 끊어 읽어도 부자연스럽지 않다.
import { addRecord, costActor, estimateCost, assertBudget } from "./costs";
import { fakeFal } from "./fake";
import { CHARS_PER_SEC } from "./script";
import { randomUUID } from "crypto";

// 목소리 목록은 lib/voices.js 에 있다(클라이언트도 봐야 해서 fs 의존을 끊었다)
export { VOICES } from "./voices";


// 1초짜리 무음 WAV — 가짜 모드에서 미리듣기 자리를 채운다(재생해도 소리는 나지 않는다).
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

function estimateSeconds(text) {
  const chars = (text || "").replace(/\s/g, "").length;
  return Math.max(1, Math.round(chars / CHARS_PER_SEC));
}

export async function generateSpeech({ text, voiceId, projectId, fetchImpl = fetch }) {
  if (fakeFal()) return { url: SILENT_WAV, seconds: estimateSeconds(text) };

  const endpoint = process.env.FAL_TTS_ENDPOINT || "fal-ai/elevenlabs/tts/turbo-v2.5";
  // TTS 는 글자당 과금이라 amount 가 글자 수다
  await assertBudget({ projectId, endpoint, amount: (text || "").length });
  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify({ text, voice: voiceId }),
  });
  if (!res.ok) {
    throw new Error(`목소리 생성 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.audio?.url;
  if (!url) throw new Error("목소리 결과가 비어 있어요");

  // 길이는 모델이 준 값이 우선 — 없으면 글자 수로 어림한다.
  // 어림값이 섞이면 소리와 그림이 미세하게 어긋나지만, 아예 못 만드는 것보다 낫다.
  const seconds = Number(data?.audio?.duration) || estimateSeconds(text);

  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    stage: "목소리", user: costActor(), project_id: projectId,
    prompt: (text || "").slice(0, 300), duration: String(seconds), aspect_ratio: "-",
    est_cost_usd: estimateCost(endpoint, (text || "").length), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds };
}
