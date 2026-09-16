// 모델이 **언제 말했는가**를 잰다 — 자막 시각의 유일한 근거.
//
// ★★ 왜 필요한가: 통짜로 굽는 영상은 모델이 자기 리듬으로 말한다. 컷 경계로 계산한
//   시각과 최대 2초 어긋나고 **방향도 일정하지 않다**(2026-08-25 떡볶이 실측: +0.03 ·
//   +1.47 · -0.41 · -1.99). 상수 보정이 안 되므로 재는 수밖에 없다.
//
// ★ 재기만 한다 — **글자는 안 받는다.** 같은 실측에서 모델이 "끓이기"를 "끄기"로 말했다.
//   무엇을 말했나는 시나리오가 답한다(lib/speech-timing.js 의 alignSpeech 참고).
//
// ★★★ 2026-09-16 — whisper(chunk_level: "segment")를 **fal Scribe v2**(낱말 단위)로
//   바꾼다. whisper 는 말 사이 쉼을 다음 조각의 시작에 붙여, 그 쉼만큼 자막이 일찍 떴다
//   (실측 2.75초까지, 설계 문서 §2). Scribe v2 는 낱말마다 시각을 주고 쉼은 비워 둔다 —
//   문장 경계를 그 낱말 시각에 맞추면(lib/speech-timing.js 의 speechUnits) 쉼이 안 섞인다.
// ★ 인자·반환이 바뀐다: 영상 URL 이 아니라 **오디오 data URI**(lib/speech-audio.js 가
//   뽑는다)를 받고, 조각 배열이 아니라 `{ words, text }`를 준다. 부르는 곳은
//   app/api/reel/[id]/render/route.js 하나다(2026-09-16 함께 고쳤다).
import { fakeFal } from "./fake.js";
// ★★ 2026-08-27 — `costActor` 를 **`./actor.js` 에서 가져오고 있었다.** 그 파일이 안
//   내보내는 이름이라 값이 `undefined` 였고, 아래에서 부르는 순간 TypeError 가 나
//   바깥 catch 가 그것을 삼켜 **whisper 결과가 통째로 버려졌다**(`return []`).
//   즉 자막 시각을 재는 이 장치가 조용히 죽어 있었고, 원장에도 그 줄이 안 남았다.
//   빌드 경고("Attempted import error")로만 보이던 것이라 테스트가 못 잡았다 —
//   그래서 tests/import-exports.test.js 를 함께 뒀다.
import { addRecord, estimateCost, costActor } from "./costs.js";
import { randomUUID } from "crypto";
import { falHeaders } from "./fal-auth.js";

const ENDPOINT = "fal-ai/elevenlabs/speech-to-text/scribe-v2";

// ★★ **못 재도 던지지 않는다.** 여기까지 왔다는 것은 영상값을 이미 다 치렀다는 뜻이다 —
//   자막 하나 때문에 한 편을 잃을 수 없다. 못 재면 빈 목록을 주고, 그러면 자막은
//   옛 방식(컷 경계 누적)으로 흐른다(lib/subtitles.js 의 buildCues).
export async function probeSpeech(audioDataUri, { fetchImpl = fetch, projectId, seconds, lang = "ko" } = {}) {
  const empty = { words: [], text: "" };
  // 가짜 모드는 소리가 없다 — 부를 이유도 없고 값도 안 나간다.
  if (fakeFal()) return empty;
  if (typeof audioDataUri !== "string" || !audioDataUri) return empty;
  try {
    const res = await fetchImpl(`https://fal.run/${ENDPOINT}`, {
      method: "POST",
      headers: falHeaders({ "Content-Type": "application/json" }),
      // ★ 언어를 넘긴다 — 옛 whisper 호출은 안 넘겨 자동 감지에 맡겼다.
      body: JSON.stringify({ audio_url: audioDataUri, language_code: lang }),
    });
    if (!res.ok) return empty;
    const data = await res.json();
    // ★ type 이 "word" 인 것만 쓴다. "spacing"·"audio_event" 는 말이 아니다.
    const words = (Array.isArray(data?.words) ? data.words : [])
      .filter((w) => (w?.type ? w.type === "word" : true))
      .map((w) => ({ timestamp: [Number(w.start), Number(w.end)], text: String(w.text || "") }))
      .filter((w) => Number.isFinite(w.timestamp[0]) && Number.isFinite(w.timestamp[1]));
    // ★ 값이 나갔으면 장부에 남긴다 — 이 저장소의 규율이다(원장 없는 지출을 두지 않는다).
    //   초를 모르면 안 적는다(모르는 값으로 장부를 흐리지 않는다).
    if (words.length && Number(seconds) > 0) {
      await addRecord({
        request_id: randomUUID(), ts: Date.now(), endpoint: ENDPOINT,
        stage: "자막 시각", user: costActor(), project_id: projectId,
        prompt: "-", duration: String(seconds), aspect_ratio: "-",
        est_cost_usd: estimateCost(ENDPOINT, Number(seconds)),
      }).catch(() => {});
    }
    return { words, text: words.map((w) => w.text).join(" ").trim() };
  } catch {
    return empty;
  }
}
