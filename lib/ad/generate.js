// 광고 영상 생성 — fal 을 부르는 유일한 자리.
//
// 기존 lib/i2v.js·lib/imagegen.js 와 같은 모양이다: 가짜 판정 → 예산 → 호출 → 원장.
// ★ 가짜 판정이 assertBudget **앞**이다. 그래서 가짜 모드에서는 기록도 안 남는다
//   (CLAUDE.md 가 적어 둔 성질 그대로다 — 비용 배선을 검증하려면 SHOTFORM_FAKE=fal 이 아니라
//   진짜로 돌려야 한다).
import { addRecord, costActor, estimateCost, assertBudget } from "../costs.js";
import { fakeFal } from "../fake.js";
import { toDataUri } from "../refs-io.js";
import { adEndpoint, adModel } from "./models.js";
import { randomUUID } from "crypto";

// 가짜 모드에서 돌려주는 자리표시자. 실제 mp4 가 아니다 — 배선과 상태 전이만 확인한다.
const FAKE_URL = "data:video/mp4;base64,";

export async function generateAdVideo({ project, scenario, refs = [], fetchImpl = fetch }) {
  const settings = project?.settings || {};
  const seconds = Number(settings.seconds) || 15;
  const kind = scenario?.endpoint || "t2v";
  const endpoint = adEndpoint(settings.model, kind);

  if (fakeFal()) return { url: FAKE_URL, seconds };

  // 나가기 전에 막는다 — 한 번이 $3.63 이다
  await assertBudget({ projectId: project.id, endpoint, amount: seconds });

  const input = {
    prompt: scenario.text,
    duration: seconds,
    aspect_ratio: settings.aspect_ratio,
    resolution: "720p",
  };
  // 업로드는 비공개 버킷이라 URL 을 fal 이 못 읽는다 — 바이트를 data URI 로 넘긴다
  // (lib/imagegen.js 가 이미 푼 문제이고 같은 헬퍼를 쓴다).
  if (kind === "i2v" && refs[0]) input.image_url = toDataUri(refs[0].bytes, refs[0].key);
  if (kind === "r2v" && refs.length) input.image_urls = refs.map((r) => toDataUri(r.bytes, r.key));

  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`영상 생성 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.video?.url;
  if (!url) throw new Error("영상 결과가 비어 있어요");

  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    stage: "광고영상", user: costActor(), project_id: project.id,
    prompt: String(scenario.text || "-").slice(0, 300),
    duration: String(seconds), aspect_ratio: settings.aspect_ratio,
    est_cost_usd: estimateCost(endpoint, seconds), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds };
}

// 모델의 길이 범위를 벗어나면 만들 수 없다 — 라우트가 이것으로 미리 막는다.
export function fitsAdModel(modelId, seconds) {
  const m = adModel(modelId);
  return seconds >= m.minSeconds && seconds <= m.maxSeconds;
}
