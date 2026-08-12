// fal 이미지 생성 (동기 fal.run) — 기본 nano-banana. 배포·모델 교체 시 응답 파싱 확인 필수.
import { addRecord, costActor, assertBudget, estimateCost } from "./costs";
import { toDataUri } from "./refs-io.js";
import { fakeFal } from "./fake";
import { randomUUID } from "crypto";

// 단가는 lib/costs.js 의 표에 있다 — 여기에 또 두면 둘이 어긋나도 아무도 모른다
const ONE_IMAGE = 1;
function placeholderImage(prompt, aspect_ratio) {
  const [w, h] = aspect_ratio === "16:9" ? [640, 360] : aspect_ratio === "1:1" ? [512, 512] : [360, 640];
  const scene = (prompt.match(/Scene:\s*(.+?)\.\s/)?.[1] || prompt).slice(0, 60);
  const esc = (s) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="#1F242A"/>
<rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="#6633FF" stroke-width="2" stroke-dasharray="6 6"/>
<text x="50%" y="40%" fill="#6633FF" font-family="sans-serif" font-size="22" font-weight="700" text-anchor="middle">TEST</text>
<foreignObject x="20" y="46%" width="${w - 40}" height="${h / 2}">
<div xmlns="http://www.w3.org/1999/xhtml" style="color:#9CA3AF;font-family:sans-serif;font-size:14px;text-align:center;line-height:1.5">${esc(scene)}</div>
</foreignObject></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// 지금 쓰는 이미지 모델. 문자열을 여기 하나만 둔다 — 예산 테스트도 이것으로 단가를 잰다.
// (레퍼런스가 있으면 뒤에 `/edit` 이 붙지만 PRICE_TABLE 은 같은 prefix 로 잡아 단가가 같다.)
export function activeImageEndpoint() {
  return process.env.FAL_IMAGE_ENDPOINT || "fal-ai/nano-banana-2";
}

export async function generateImage({ prompt, aspect_ratio, refs = [], projectId, fetchImpl = fetch }) {
  // 가짜 모드 — fal을 부르지 않고 플레이스홀더를 즉시 돌려준다. 비용도 기록하지 않는다.
  if (fakeFal()) return { url: placeholderImage(prompt, aspect_ratio) };
  // 레퍼런스가 있으면 edit 계열 엔드포인트 사용 — base 모델은 image_urls를 받지 않음
  // 기본값은 지금 쓰는 모델과 같아야 한다 — env 를 안 옮긴 환경(배포·CI·새 클론)이 조용히
  // 옛 모델로 돌면 값과 품질이 함께 갈린다. 2026-07-30 에 nano-banana → -2 로 맞췄다.
  const base = activeImageEndpoint();
  const endpoint = refs.length ? `${base}/edit` : base;
  // 나가기 전에 막는다 — 컷마다 한 장이지만 컷 수만큼 곱해져 쌓인다
  await assertBudget({ projectId, endpoint, amount: ONE_IMAGE });
  const input = { prompt, aspect_ratio, num_images: 1 };
  if (refs.length) {
    // 바이트는 부르는 쪽(파이프라인)이 이미 읽어 왔다 — 여기서 다시 읽지 않는다.
    // 확장자는 키에서 딴다: 업로드 키든 아바타 파일명이든 확장자를 달고 있다.
    input.image_urls = refs.map((r) => toDataUri(r.bytes, r.key));
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
    stage: "이미지", user: costActor(), project_id: projectId,
    prompt: prompt.slice(0, 300), duration: "-", aspect_ratio,
    est_cost_usd: estimateCost(endpoint, ONE_IMAGE), status: "done", video_url: url,
  }).catch(() => {});
  return { url };
}
