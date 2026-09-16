// 소리가 바뀌면 잰 시각은 딴 소리의 것이다. 2026-09-15 신고의 뿌리 둘 중 하나였다.
//
// ★★★ 2026-09-16 리뷰 I3 — 예전 버전은 파일 전체에서 `speech:\s*null` 의 **개수**만
//   셌다. 세 개가 한 함수에 몰려 있어도 통과하고(I2 가 그렇게 새어 나갔다), 지운 것이
//   `speech` 뿐이고 `narration_timing` 은 안 지워도 통과했다 — 계약을 안 재는 그물이었다.
//   여기서는 세 함수(runReelOneShot · collectReelOneShot · attachReelVideo)를 주입된
//   가짜 의존성으로 **실제로 실행**해, 그 결과 문서에서 speech·narration_timing 이
//   지워지는지를 잰다.
import { describe, it, expect } from "vitest";
import { runReelOneShot, collectReelOneShot, attachReelVideo } from "../lib/reel/pipeline.js";

const cut = (idx, extra = {}) => ({
  idx, shows: `panel ${idx}`, seconds: 5,
  image: { url: `https://x/c${idx}.jpg`, sheet: "https://fal/sheet.png", cell: idx },
  ...extra,
});

// 이미 시각을 잰 적이 있는(=지워져야 할 값이 있는) 문서.
function staleDoc(over = {}) {
  return {
    id: "pid",
    kind: "reel",
    settings: { target_seconds: 15, aspect_ratio: "9:16", i2v_model: "seedance-2.0" },
    scenario: { text: "A quiet workshop bench; the camera drifts left." },
    cuts: [cut(0), cut(1), cut(2)],
    reel: {
      speech: { at: 1, source: "scribe-v2", units: [{ start: 1, seconds: 2, ok: true }], heard: { chars: 3, text: "가나다" } },
      narration_timing: [{ start: 1, seconds: 2 }],
    },
    ...over,
  };
}

function fixture(over = {}) {
  const d = staleDoc(over);
  return {
    doc: d,
    getProject: async () => d,
    updateProject: async (_id, _owner, fn) => { Object.assign(d, fn(d)); return d; },
    toFalUrl: async (u) => u,
    fetchImageBytes: async () => null,
  };
}

const JOB = { requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 };

describe("영상이 바뀌면 자막 시각을 버린다 — 세 함수 각각을 실제로 돌려서 잰다", () => {
  it("runReelOneShot — 접수하면 speech·narration_timing 이 둘 다 지워진다", async () => {
    const f = fixture();
    await runReelOneShot("pid", "uid", {
      ...f,
      submitClip: async () => JOB,
      gridFacesOnSheet: async () => ({ bytes: Buffer.from("x"), faces: 0 }),
    });
    expect(f.doc.reel.speech).toBeNull();
    expect(f.doc.reel.narration_timing).toBeNull();
  });

  it("collectReelOneShot — 수거가 끝나면 speech·narration_timing 이 둘 다 지워진다", async () => {
    const d = staleDoc({ reel: { job: { requestId: "req-1", of: "x", imageOf: "y", said: "가나다" } } });
    const f = {
      doc: d,
      getProject: async () => d,
      updateProject: async (_id, _owner, fn) => { Object.assign(d, fn(d)); return d; },
    };
    // ★ 수거는 job 위에 speech·narration_timing 을 심어 둔 문서에서 시작한다 — job 은
    //   접수 때 생기는 것이라 이번 굽기와는 무관한 **이전 편의** 값이 남아 있는 상황이다.
    d.reel.speech = { at: 1, source: "scribe-v2", units: [{ start: 1, seconds: 2, ok: true }], heard: { chars: 3, text: "가" } };
    d.reel.narration_timing = [{ start: 1, seconds: 2 }];
    await collectReelOneShot("pid", "uid", {
      ...f,
      collectClip: async () => ({ done: true, url: "https://x/v.mp4", seconds: 15 }),
    });
    expect(f.doc.reel.speech).toBeNull();
    expect(f.doc.reel.narration_timing).toBeNull();
  });

  it("attachReelVideo — 운영자가 직접 붙여도 speech·narration_timing 이 둘 다 지워진다", async () => {
    const f = fixture();
    const RESULT = { video: { url: "https://fal/rescued.mp4", duration: 30 } };
    await attachReelVideo("pid", "uid", { url: "https://x/direct.mp4" }, {
      ...f,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => RESULT }),
    });
    expect(f.doc.reel.speech).toBeNull();
    expect(f.doc.reel.narration_timing).toBeNull();
  });
});
