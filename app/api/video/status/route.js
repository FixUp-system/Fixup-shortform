// GET /api/video/status?id=<request_id> — fal 큐 상태 폴링
// 응답: {status:"queued"|"running"|"done"|"error", video_url?, error?}
// 참고: fal 큐의 상태 조회는 모델의 상위 앱 id 기준
//   (예: fal-ai/kling-video/v2.1/standard/text-to-video → fal-ai/kling-video)

import { updateRecord } from "../../../../lib/costs";

const DEFAULT_ENDPOINT = "fal-ai/kling-video/v3/standard/text-to-video";

function appBase(endpoint) {
  const parts = endpoint.split("/");
  return parts.slice(0, 2).join("/");
}

export async function GET(req) {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return Response.json({ error: "FAL_KEY 미설정" }, { status: 500 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id가 필요해요" }, { status: 400 });
  }
  const endpoint = process.env.FAL_VIDEO_ENDPOINT || DEFAULT_ENDPOINT;
  const base = appBase(endpoint);
  const headers = { Authorization: `Key ${falKey}` };

  const statusRes = await fetch(
    `https://queue.fal.run/${base}/requests/${id}/status`,
    { headers }
  );
  if (!statusRes.ok) {
    const detail = await statusRes.text().catch(() => "");
    console.error("fal status error:", statusRes.status, detail.slice(0, 300));
    return Response.json(
      { status: "error", error: `상태 조회 실패 (${statusRes.status})` },
      { status: 502 }
    );
  }
  const status = await statusRes.json();

  if (status?.status === "COMPLETED") {
    const resultRes = await fetch(
      `https://queue.fal.run/${base}/requests/${id}`,
      { headers }
    );
    if (!resultRes.ok) {
      const detail = await resultRes.text().catch(() => "");
      console.error("fal result error:", resultRes.status, detail.slice(0, 300));
      return Response.json(
        { status: "error", error: "결과 조회 실패" },
        { status: 502 }
      );
    }
    const result = await resultRes.json();
    const videoUrl = result?.video?.url || result?.output?.video?.url || null;
    if (!videoUrl) {
      console.error("fal result: no video url", JSON.stringify(result).slice(0, 500));
      await updateRecord(id, { status: "error" }).catch(() => {});
      return Response.json({ status: "error", error: "결과에 영상이 없어요" });
    }
    await updateRecord(id, { status: "done", video_url: videoUrl }).catch(() => {});
    return Response.json({ status: "done", video_url: videoUrl });
  }

  if (status?.status === "IN_PROGRESS") {
    return Response.json({ status: "running" });
  }
  if (status?.status === "IN_QUEUE") {
    return Response.json({ status: "queued", queue_position: status?.queue_position });
  }
  return Response.json({ status: "error", error: `알 수 없는 상태: ${status?.status}` });
}
