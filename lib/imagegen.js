// fal 이미지 생성 (동기 fal.run) — 기본 nano-banana. 배포·모델 교체 시 응답 파싱 확인 필수.
import { promises as fs } from "fs";
import { addRecord, costActor } from "./costs";
import { randomUUID } from "crypto";

const IMAGE_PRICE_USD = 0.04;

export async function generateImage({ prompt, aspect_ratio, refImagePath, fetchImpl = fetch }) {
  // 레퍼런스 사진이 있으면 edit 계열 엔드포인트 사용 — base 모델은 image_urls를 받지 않음
  const base = process.env.FAL_IMAGE_ENDPOINT || "fal-ai/nano-banana";
  const endpoint = refImagePath ? `${base}/edit` : base;
  const input = { prompt, aspect_ratio, num_images: 1 };
  if (refImagePath) {
    const buf = await fs.readFile(refImagePath);
    const ext = refImagePath.split(".").pop();
    input.image_urls = [`data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`];
  }
  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`이미지 생성 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error("이미지 생성 결과가 비어 있어요");
  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    stage: "이미지", user: costActor(),
    prompt: prompt.slice(0, 300), duration: "-", aspect_ratio,
    est_cost_usd: IMAGE_PRICE_USD, status: "done", video_url: url,
  }).catch(() => {});
  return { url };
}
