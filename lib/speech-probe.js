// 모델이 **언제 말했는가**를 잰다 — 자막 시각의 유일한 근거.
//
// ★★ 왜 필요한가: 통짜로 굽는 영상은 모델이 자기 리듬으로 말한다. 컷 경계로 계산한
//   시각과 최대 2초 어긋나고 **방향도 일정하지 않다**(2026-08-25 떡볶이 실측: +0.03 ·
//   +1.47 · -0.41 · -1.99). 상수 보정이 안 되므로 재는 수밖에 없다.
//
// ★ 재기만 한다 — **글자는 안 받는다.** 같은 실측에서 모델이 "끓이기"를 "끄기"로 말했다.
//   무엇을 말했나는 시나리오가 답한다(lib/speech-timing.js 의 alignSpeech 참고).
import { fakeFal } from "./fake.js";
import { addRecord, estimateCost } from "./costs.js";
import { costActor } from "./actor.js";
import { randomUUID } from "crypto";

const ENDPOINT = "fal-ai/whisper";

// ★★ **못 재도 던지지 않는다.** 여기까지 왔다는 것은 영상값을 이미 다 치렀다는 뜻이다 —
//   자막 하나 때문에 한 편을 잃을 수 없다. 못 재면 빈 목록을 주고, 그러면 자막은
//   옛 방식(컷 경계 누적)으로 흐른다(lib/subtitles.js 의 buildCues).
export async function probeSpeech(mediaUrl, { fetchImpl = fetch, projectId, seconds } = {}) {
  // 가짜 모드는 소리가 없다 — 부를 이유도 없고 값도 안 나간다.
  if (fakeFal()) return [];
  if (typeof mediaUrl !== "string" || !mediaUrl) return [];
  try {
    const res = await fetchImpl(`https://fal.run/${ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
      body: JSON.stringify({
        audio_url: mediaUrl,
        task: "transcribe",
        // ★ 조각 단위 — 낱말 단위(word)는 우리에게 과하다. 자막은 문장으로 뜬다.
        chunk_level: "segment",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const chunks = Array.isArray(data?.chunks) ? data.chunks : [];
    // ★ 값이 나갔으면 장부에 남긴다 — 이 저장소의 규율이다(원장 없는 지출을 두지 않는다).
    //   초를 모르면 안 적는다(모르는 값으로 장부를 흐리지 않는다).
    if (chunks.length && Number(seconds) > 0) {
      await addRecord({
        request_id: randomUUID(), ts: Date.now(), endpoint: ENDPOINT,
        stage: "자막 시각", user: costActor(), project_id: projectId,
        prompt: "-", duration: String(seconds), aspect_ratio: "-",
        est_cost_usd: estimateCost(ENDPOINT, Number(seconds)),
      }).catch(() => {});
    }
    return chunks;
  } catch {
    return [];
  }
}
