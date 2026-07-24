// POST /api/video — fal.ai 큐에 영상 생성 요청 제출
// 입력: {prompt, duration:"5"|"10", aspect_ratio:"9:16"|"1:1"|"16:9"}
// 응답: {request_id, endpoint}

import { addRecord, estimateCost, costActor } from "../../../lib/costs";

const DEFAULT_ENDPOINT = "fal-ai/kling-video/v3/standard/text-to-video";

export async function POST(req) {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return Response.json(
      { error: "FAL_KEY가 설정되지 않았어요 (.env.local 확인)" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ error: "prompt가 비어 있어요" }, { status: 400 });
  }
  const duration = body?.duration === "10" ? "10" : "5";
  const aspect_ratio = ["9:16", "1:1", "16:9"].includes(body?.aspect_ratio)
    ? body.aspect_ratio
    : "9:16";

  const endpoint = process.env.FAL_VIDEO_ENDPOINT || DEFAULT_ENDPOINT;

  // ── 모델별 입력 어댑터 — 모델마다 파라미터 이름·허용값이 다르다
  let input;
  let seconds; // 실제 생성 초 (비용 기록용)
  if (endpoint.startsWith("fal-ai/veo")) {
    // Veo 3.1: duration "4s"|"6s"|"8s", 비율 16:9|9:16만, resolution 지정
    seconds = duration === "10" ? 8 : 6;
    input = {
      prompt,
      duration: `${seconds}s`,
      aspect_ratio: aspect_ratio === "1:1" ? "9:16" : aspect_ratio,
      resolution: "1080p", // 720p와 동일 가격 — 항상 1080p 사용

      generate_audio: true,
    };
  } else {
    // Kling 계열: duration "3"~"15"(초 숫자 문자열), 16:9|9:16|1:1
    seconds = Number(duration);
    input = { prompt, duration, aspect_ratio, generate_audio: true };
  }

  const res = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${falKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("fal submit error:", res.status, detail.slice(0, 500));
    return Response.json(
      { error: `영상 생성 요청에 실패했어요 (${res.status})` },
      { status: 502 }
    );
  }

  const data = await res.json();
  if (!data?.request_id) {
    console.error("fal submit: no request_id", data);
    return Response.json(
      { error: "영상 생성 요청에 실패했어요 (request_id 없음)" },
      { status: 502 }
    );
  }
  // 비용 기록 — 과금은 제출 시점에 발생
  try {
    await addRecord({
      request_id: data.request_id,
      ts: Date.now(),
      endpoint,
      // 지금 이 라우트의 유일한 호출처는 홈 빠른 생성. 단계별 영상화(M2)가 붙으면
      // body.stage로 "영상"을 넘겨받게 열어둔다.
      stage: typeof body?.stage === "string" ? body.stage : "빠른 생성",
      user: costActor(),
      prompt,
      duration: String(seconds),
      aspect_ratio: input.aspect_ratio,
      est_cost_usd: estimateCost(endpoint, seconds),
      status: "submitted",
    });
  } catch (e) {
    console.error("cost record failed:", e);
  }

  return Response.json({ request_id: data.request_id, endpoint });
}
