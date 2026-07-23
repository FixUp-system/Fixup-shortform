// POST /api/video — fal.ai 큐에 영상 생성 요청 제출
// 입력: {prompt, duration:"5"|"10", aspect_ratio:"9:16"|"1:1"|"16:9"}
// 응답: {request_id, endpoint}

const DEFAULT_ENDPOINT = "fal-ai/kling-video/v2.1/standard/text-to-video";

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

  const res = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${falKey}`,
    },
    body: JSON.stringify({ prompt, duration, aspect_ratio }),
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
  return Response.json({ request_id: data.request_id, endpoint });
}
