// 잃어버린 영상을 문서에 도로 붙인다 — **운영자 전용 구조선**.
//
// 🔴 왜 필요했나(2026-09-08 실물 사고): 원클릭 한 편이 fal 에서는 완성됐는데 우리 수거가
//    계속 죽어(메모리 초과) 문서에 못 붙었다. 그 사이 사장님이 시나리오에서 다시 진행해
//    **새 굽기가 접수**됐고, 그 순간 재시작 단서(ad_request_id)가 덮였다. 즉 이미 값을 치른
//    영상이 fal 에만 남고 앱에서는 되찾을 길이 사라졌다.
//
// 그래서 "fal 접수번호를 주면 그 결과를 우리 문서에 붙인다"를 만든다. 굽지 않는다 —
// **값이 나가는 길이 아니다**(이미 만들어진 것을 가져오기만 한다).
//
// ★ 붙이는 마지막 걸음은 정상 마무리와 **같은 함수**(finishWithVideo)를 쓴다. 두 벌이면
//   파일 이름·자막·ETag 가 갈린다 — 이 저장소가 반복해서 겪은 모양이다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject, updateProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { attachAdVideo } from "../lib/ad/pipeline.js";
import { listRecords } from "../lib/costs.js";

const U = "00000000-0000-4000-8000-00000000000d";
const ADMIN_H = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "admin" };
const USER_H = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };

const SETTINGS = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0",
};
const scenario = { text: "P", shots: [{ beat: "가", line: "안녕하세요" }], endpoint: "t2v" };
const REQ = "01a08010-5caa-7f43-9b9b-94d0dfaac052";

async function madeAd(patch = {}) {
  const p = await runWithActor(U, () =>
    createProject({ settings: SETTINGS, material: { text: "앰플 광고", photos: [] }, ownerId: U, kind: "ad" })
  );
  await runWithActor(U, () => updateProject(p.id, U, (d) => ({ ...d, scenario, status: "scenario", ...patch })));
  return p;
}

// fal 큐가 결과를 주는 모양 그대로다(lib/ad/generate.js 의 collectAdVideo 가 읽는 자리).
const falResult = () => ({ ok: true, status: 200, json: async () => ({ video: { url: "https://fal.example/old.mp4" } }) });

describe("잃어버린 영상 붙이기", () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => vi.unstubAllGlobals());

  it("★ fal 접수번호로 결과를 받아 문서에 붙인다 — 마무리는 정상 경로와 같은 함수다", async () => {
    const p = await madeAd();
    const out = await runWithActor(U, () =>
      attachAdVideo(p.id, U, { requestId: REQ }, {
        fetchImpl: async (url) => (String(url).includes(REQ) ? falResult() : { ok: true, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }),
        // 자막은 진짜 ffmpeg 를 안 부른다 — 여기서 재는 것은 배선이다
        burn: async (args) => ({ url: `/api/renders/${args.projectId}.mp4` }),
      })
    );

    expect(out.attached).toBe(true);
    const back = await getProject(p.id, U);
    expect(back.status).toBe("done");
    expect(back.videos).toHaveLength(1);
    // 원본 이름 규약이 그대로다 — 이름이 어긋나면 저장은 되는데 열 수가 없다
    expect(back.videos[0].rawUrl).toBe(`/api/renders/${p.id}-raw.mp4`);
    expect(await getStore().getObject("renders", `${p.id}-raw.mp4`)).toBeTruthy();
  });

  it("★ 굽는 중이면 붙이지 않는다 — 도는 굽기를 덮어쓰면 그 값이 사라진다", async () => {
    const p = await madeAd({ status: "rendering", ad_job: { requestId: "새-굽기", seconds: 15, startedAt: Date.now() } });
    const out = await runWithActor(U, () => attachAdVideo(p.id, U, { requestId: REQ }, { fetchImpl: async () => falResult() }));

    expect(out.rendering).toBe(true);
    const back = await getProject(p.id, U);
    expect(back.status).toBe("rendering");
    expect(back.videos ?? []).toHaveLength(0);
  });

  it("★ fal 이 결과를 안 주면 아무것도 안 바꾼다", async () => {
    const p = await madeAd();
    const out = await runWithActor(U, () =>
      attachAdVideo(p.id, U, { requestId: REQ }, { fetchImpl: async () => ({ ok: false, status: 404, text: async () => "없음" }) })
    );

    expect(out.error).toMatch(/404|받지 못/);
    const back = await getProject(p.id, U);
    expect(back.status).toBe("scenario");
    expect(back.videos ?? []).toHaveLength(0);
  });

  it("★ 원장에 그 요청번호로 한 줄 남는다 — 값은 이미 나갔고, 장부는 사실을 적어야 한다", async () => {
    const p = await madeAd();
    await runWithActor(U, () =>
      attachAdVideo(p.id, U, { requestId: REQ }, {
        fetchImpl: async (url) => (String(url).includes(REQ) ? falResult() : { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }),
        burn: async (args) => ({ url: `/api/renders/${args.projectId}.mp4` }),
      })
    );
    const rows = (await runWithActor(U, () => listRecords())).filter((r) => r.request_id === REQ);
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe("광고영상");
  });

  it("★★ 라우트는 운영자 전용이다 — 남의 편에 영상을 꽂을 수 있는 문이다", async () => {
    const { POST: attach } = await import("../app/api/ads/[id]/attach/route.js");
    const p = await madeAd();
    const res = await attach(
      new Request("http://x", { method: "POST", headers: USER_H, body: JSON.stringify({ requestId: REQ }) }),
      { params: Promise.resolve({ id: p.id }) }
    );
    expect(res.status).toBe(403);
  });

  it("★ 접수번호가 없으면 400 — 무엇을 붙일지 모르면 아무것도 안 한다", async () => {
    const { POST: attach } = await import("../app/api/ads/[id]/attach/route.js");
    const p = await madeAd();
    const res = await attach(
      new Request("http://x", { method: "POST", headers: ADMIN_H, body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: p.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("★ 마무리만큼 무거우므로 상한이 적혀 있다", () => {
    const src = readFileSync("app/api/ads/[id]/attach/route.js", "utf8");
    const m = src.match(/export const maxDuration\s*=\s*(\d+)/);
    expect(m, "붙이기 라우트에 maxDuration 이 없다").toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(300);
  });
});
