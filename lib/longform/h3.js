// MiniMax H3 r2v — **큐로만** 부른다.
//
// ★★★ 동기 호출(fal.run)을 안 쓰는 이유: H3 는 "출력 1초당 30초 안팎"이라 15초면 ~7.5분이다.
//   동기 호출은 300초에 끊기고(undici 헤더 타임아웃) fal 은 그와 무관하게 만들어 **과금한다** —
//   lib/i2v.js 머리말: "$0.90 이 나가고 영상은 못 받았다".
// ★★ lib/i2v.js 의 submitClip 을 안 쓰는 이유: 그 함수는 falWebhookUrl 로 **프로덕션 웹훅**을
//   붙인다. 로컬 측정이 가짜 projectId 로 프로덕션을 부르게 된다(계획서 「스펙과 다르게
//   가는 곳」 3). 모양(접수 → 접수증 → 수거)은 그 함수와 같게 둔다.
import { profileFor, fitDurationFor } from "../clip-limits.js";
import { toDataUri } from "../refs-io.js";
// ★★ 머리말은 한 자리(lib/fal-auth.js)에서 온다 — 인증만이 아니라 **X-Fal-Store-IO: 0**(요청 몸통을
//   fal 에 보관하지 않는다)이 함께 붙는다. 이 파일의 몸통에는 닻 프레임(실사 얼굴)과 올린 사진이
//   data URI 로 든다. 처음에 머리말을 손으로 적었다가 tests/fal-auth.test.js 가 잡았다.
import { falHeaders } from "../fal-auth.js";
import { H3_R2V } from "./plan.js";

// textOnly: 글만(H3_T2V) — 참조 칸을 안 만든다. 캐스팅 클립이 이것으로 간다(lib/longform/casting.js).
export function h3Body({ prompt, seconds, aspect, resolution, refs, audios = [], seed, textOnly = false }) {
  return {
    prompt,
    duration: fitDurationFor(profileFor(H3_R2V), Number(seconds) || 0),
    aspect_ratio: aspect,
    // ★ t2v 는 resolution 기본값이 2K 다 — 늘 싣는다(안 실으면 값이 두 배 넘게 나간다).
    resolution,
    ...(textOnly ? {} : { reference_image_urls: (refs || []).map((r) => (r.url ? r.url : toDataUri(r.bytes, r.key))) }),
    // 목소리 참조(voice-ref.js) — 구간 1 에서 자른 mp3. toDataUri 는 이미지 전용이라 여기서 싣는다.
    ...(audios.length
      ? { reference_audio_urls: audios.map((a) => (a.url ? a.url : `data:audio/mpeg;base64,${a.bytes.toString("base64")}`)) }
      : {}),
    ...(seed ? { seed } : {}),
  };
}

export async function submitH3(body, { fetchImpl = fetch, endpoint = H3_R2V } = {}) {
  const res = await fetchImpl(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: falHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`H3 접수 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const j = await res.json();
  if (!j?.status_url || !j?.response_url) throw new Error("H3 접수 응답에 status_url/response_url 이 없어요");
  return { requestId: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url };
}

export async function collectH3(job, { fetchImpl = fetch } = {}) {
  const headers = falHeaders();
  const st = await fetchImpl(job.statusUrl, { headers });
  if (!st.ok) throw new Error(`H3 상태 조회 실패 (${st.status})`);
  const s = await st.json();
  if (s?.status !== "COMPLETED") return { done: false, status: s?.status || "?" };
  const r = await fetchImpl(job.responseUrl, { headers });
  if (!r.ok) throw new Error(`H3 생성 실패 (${r.status}) ${(await r.text().catch(() => "")).slice(0, 300)}`);
  const d = await r.json();
  const url = d?.video?.url;
  if (!url) throw new Error("H3 결과가 비었어요");
  return { done: true, url };
}

export async function waitH3(job, {
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now, intervalMs = 10000, timeoutMs = 30 * 60 * 1000, onTick,
} = {}) {
  const t0 = now();
  for (;;) {
    const out = await collectH3(job, { fetchImpl });
    if (out.done) return out.url;
    const took = now() - t0;
    onTick?.(out.status, took);
    if (took > timeoutMs) {
      throw new Error(`H3 가 ${Math.round(timeoutMs / 60000)}분 안에 안 끝났어요 — 접수증은 run.json 에 있으니 다시 돌리면 이어서 기다려요`);
    }
    await sleep(intervalMs);
  }
}
