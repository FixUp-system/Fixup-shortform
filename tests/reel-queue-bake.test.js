// **단계별 통짜 굽기를 큐로 옮긴다** — 원클릭(코드에선 ad)이 2026-08-13 에 넘은 그 벽이다.
//
// ★★★ 2026-08-31 실측으로 터졌다. `lib/i2v.js` 는 동기 호출(`https://fal.run/…`)이라 영상이
//   끝날 때까지 연결을 붙잡는데, **300초에 끊긴다**(undici 헤더 타임아웃).
//   fal 은 그것과 무관하게 **계속 만들어 완료했고**, 우리만 `fetch failed` 를 받고 URL 을
//   잃었다 — **$0.90 이 나가고 영상은 못 받았다**(사장님이 fal.ai 대시보드에서 확인).
//
// ★ 그 전제는 코드에 적혀 있었다(lib/ad/generate.js 머리말):
//   *"lib/i2v.js 는 **컷 하나(5~10초)** 라 fal.run 동기 호출이 5분 안에 끝났다."*
//   통짜는 컷 하나가 아니라 **한 편 전체**다 — 원클릭이 큐로 옮긴 바로 그 이유다.
//
// ★★ 옮기는 것은 **통짜뿐이다.** 컷별은 컷 하나가 5~10초라 위 전제가 아직 유효하고,
//   함께 옮기면 변경 폭이 두 배가 된다. 필요해지면 그때 옮긴다.
//
// ★★ 모양은 원클릭을 그대로 따른다: **접수증을 문서에 저장** → 화면이 상태를 두드릴 때마다
//   **한 번 수거 시도**. 이러면 프로세스가 사라져도 결과를 안 잃는다(오늘 잃은 그 상황).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { submitClip, collectClip, generateClip } from "../lib/i2v.js";
import { runReelOneShot, collectReelOneShot } from "../lib/reel/pipeline.js";
// ★ assertBudget·addRecord 가 actor 컨텍스트를 요구한다(lib/actor.js) — 라우트는
//   requireUser 가, 스크립트·판은 runWithActor 가 세운다.
import { runWithActor } from "../lib/actor.js";

const OK_SUBMIT = {
  ok: true,
  json: async () => ({
    request_id: "req-1",
    status_url: "https://queue.fal.run/minimax/h3/requests/req-1/status",
    response_url: "https://queue.fal.run/minimax/h3/requests/req-1",
  }),
};
const statusRes = (s) => ({ ok: true, json: async () => ({ status: s }) });
const resultRes = (url) => ({ ok: true, json: async () => ({ video: { url } }) });

const project = (over = {}) => ({
  id: "pid", kind: "reel",
  settings: { target_seconds: 15, aspect_ratio: "9:16", i2v_model: "minimax-h3", resolution: "768P" },
  scenario: { text: "A bright product film." },
  ...over,
});

describe("접수 — 큐로 던지고 즉시 돌아온다", () => {
  it("★★ `queue.fal.run` 으로 간다 — 동기 `fal.run` 이 아니다", async () => {
    const seen = [];
    await runWithActor("admin", () => submitClip({
      // ★ 5초로 재는 이유 — 체험 한도(FREE_TRIAL_USD $0.5)가 접수 **앞**에 있어서,
      //   15초(768P $0.90)면 엔드포인트를 보기도 전에 예산에서 막힌다(그 자체는 정상 동작).
      imageUrl: null, refs: [{ url: "https://fal/sheet.png" }], seconds: 5,
      aspect_ratio: "9:16", prompt: "p", projectId: "pid", project: project(),
      fetchImpl: async (u, o) => { seen.push(u); return OK_SUBMIT; },
    }));
    expect(seen[0], "동기 엔드포인트로 갔다").toMatch(/^https:\/\/queue\.fal\.run\//);
    expect(seen[0]).not.toMatch(/^https:\/\/fal\.run\//);
  });

  it("★ 접수증을 돌려준다 — 이 값이 문서에 저장돼야 이어받을 수 있다", async () => {
    const job = await runWithActor("admin", () => submitClip({
      imageUrl: null, refs: [{ url: "https://fal/sheet.png" }], seconds: 5,
      aspect_ratio: "9:16", prompt: "p", projectId: "pid", project: project(),
      fetchImpl: async () => OK_SUBMIT,
    }));
    expect(job.requestId).toBe("req-1");
    expect(job.statusUrl).toMatch(/\/status$/);
    expect(job.responseUrl).toBeTruthy();
    expect(job.seconds).toBe(5);
  });

  it("★ status_url·response_url 은 **응답에서 받은 값**을 쓴다 — 우리가 조립하지 않는다", () => {
    // 모델 id 에 슬래시가 여럿이라(bytedance/seedance-2.0/…) 직접 조립하면 틀리기 쉽다.
    const src = readFileSync("lib/i2v.js", "utf8");
    expect(src).toMatch(/status_url/);
    expect(src, "URL 을 손으로 조립한다").not.toMatch(/queue\.fal\.run\/\$\{endpoint\}\/requests/);
  });
});

describe("수거 — 한 번만 물어본다", () => {
  const job = { requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "minimax/h3/reference-to-video", seconds: 15 };

  it("아직이면 done:false 다 — 결과를 안 부른다", async () => {
    const seen = [];
    const got = await runWithActor("admin", () => collectClip({
      job, projectId: "pid", prompt: "p", aspect_ratio: "9:16", resolution: "768P",
      fetchImpl: async (u) => { seen.push(u); return statusRes("IN_PROGRESS"); },
    }));
    expect(got).toEqual({ done: false });
    expect(seen, "아직인데 결과까지 불렀다").toEqual(["s"]);
  });

  it("★ 끝났으면 결과를 받아 온다", async () => {
    const got = await runWithActor("admin", () => collectClip({
      job, projectId: "pid", prompt: "p", aspect_ratio: "9:16", resolution: "768P",
      fetchImpl: async (u) => (u === "s" ? statusRes("COMPLETED") : resultRes("https://fal/v.mp4")),
    }));
    expect(got.done).toBe(true);
    expect(got.url).toBe("https://fal/v.mp4");
    expect(got.seconds).toBe(15);
  });

  it("★★ 원장의 열쇠가 **fal 접수번호**다 — 두 번 수거해도 행이 하나다", () => {
    // cost_records 는 request_id 가 기본키(=멱등키)다. randomUUID 를 쓰면 겹쳐 적힌다.
    const src = readFileSync("lib/i2v.js", "utf8");
    expect(src).toMatch(/request_id:\s*job\.requestId/);
  });
});

describe("컷별 갈래는 안 건드렸다 — 이 회차의 범위는 통짜뿐이다", () => {
  it("★ generateClip 은 **동기 엔드포인트 그대로**다", async () => {
    // 컷 하나는 5~10초라 300초 벽에 안 닿는다. 함께 옮기면 변경 폭이 두 배가 되고,
    // 그 길을 쓰는 판이 쉰 개가 넘는다 — 필요해지면 그때 옮긴다.
    const src = readFileSync("lib/i2v.js", "utf8");
    const at = src.indexOf("export async function generateClip");
    expect(src.slice(at)).toMatch(/https:\/\/fal\.run\//);
    expect(src.slice(at), "컷별까지 큐로 갔다").not.toMatch(/queue\.fal\.run/);
  });

  it("★★ 긴 영상을 이 길로 태우지 말라고 적어 둔다 — 오늘 $0.90 을 그렇게 잃었다", () => {
    const src = readFileSync("lib/i2v.js", "utf8");
    expect(src).toMatch(/300초/);
  });
});

describe("통짜 굽기 — 접수하고 문서에 남긴다", () => {
  function fixture(over = {}) {
    const d = {
      id: "pid", kind: "reel",
      settings: { target_seconds: 15, aspect_ratio: "9:16", i2v_model: "minimax-h3", resolution: "768P" },
      scenario: { text: "A bright product film." },
      cuts: [0, 1, 2].map((i) => ({ idx: i, shows: `panel ${i}`, seconds: 5, image: { url: `https://x/c${i}.jpg`, sheet: "https://fal/sheet.png", cell: i } })),
      ...over,
    };
    return {
      d,
      getProject: async () => d,
      updateProject: async (_id, _o, fn) => { Object.assign(d, fn(d)); return d; },
      toFalUrl: async (u) => u,
    };
  }

  it("★★ 굽기를 **안 기다린다** — 접수증만 문서에 남긴다", async () => {
    const f = fixture();
    await runReelOneShot("pid", "uid", {
      ...f,
      submitClip: async () => ({ requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }),
    });
    expect(f.d.reel?.job, "접수증이 문서에 없다").toBeTruthy();
    expect(f.d.reel.job.requestId).toBe("req-1");
    expect(f.d.cuts[0].video, "기다리지 않았는데 클립이 꽂혔다").toBeFalsy();
  });

  it("★ 각인을 접수증에 함께 담는다 — 수거 때 다시 계산하면 그 사이 바뀐 값에 물린다", async () => {
    const f = fixture();
    await runReelOneShot("pid", "uid", {
      ...f,
      submitClip: async () => ({ requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }),
    });
    expect(typeof f.d.reel.job.of, "각인이 없다").toBe("string");
    expect(f.d.reel.job.of.length).toBeGreaterThan(0);
    expect(f.d.reel.job.imageOf).toBe("https://fal/sheet.png");
  });

  it("가짜 모드는 큐를 안 탄다 — 그 자리에서 끝난다", async () => {
    const f = fixture();
    await runReelOneShot("pid", "uid", {
      ...f,
      submitClip: async () => ({ fake: true, url: "/samples/reel-15s.mp4", seconds: 15 }),
    });
    expect(f.d.cuts[0].video?.url).toBe("/samples/reel-15s.mp4");
    expect(f.d.reel?.job ?? null, "가짜인데 접수증이 남았다").toBeNull();
  });
});

describe("수거 — 화면이 두드릴 때 이어받는다", () => {
  function fixture(job) {
    const d = {
      id: "pid", kind: "reel",
      settings: { target_seconds: 15, aspect_ratio: "9:16", i2v_model: "minimax-h3", resolution: "768P" },
      cuts: [0, 1, 2].map((i) => ({ idx: i, shows: `p${i}`, seconds: 5, image: { url: `https://x/c${i}.jpg`, sheet: "https://fal/sheet.png", cell: i }, ...(i > 0 ? { video: { url: "old" } } : {}) })),
      reel: { status: "rendering", job },
    };
    return { d, getProject: async () => d, updateProject: async (_i, _o, fn) => { Object.assign(d, fn(d)); return d; } };
  }
  const JOB = { requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15, of: "본문", imageOf: "https://fal/sheet.png" };

  it("★★ 끝났으면 첫 컷에 꽂고 접수증을 지운다 — 각인은 접수증의 것", async () => {
    const f = fixture(JOB);
    await collectReelOneShot("pid", "uid", { ...f, collectClip: async () => ({ done: true, url: "https://fal/v.mp4", seconds: 15 }) });
    expect(f.d.cuts[0].video).toMatchObject({ url: "https://fal/v.mp4", seconds: 15, of: "본문", imageOf: "https://fal/sheet.png", whole: true });
    expect(f.d.reel.job ?? null, "접수증이 안 지워졌다").toBeNull();
  });

  it("★ 나머지 컷의 옛 클립을 걷는다 — 안 걷으면 완성본이 '한 편 + 옛 컷들'이 된다", async () => {
    const f = fixture(JOB);
    await collectReelOneShot("pid", "uid", { ...f, collectClip: async () => ({ done: true, url: "https://fal/v.mp4", seconds: 15 }) });
    expect(f.d.cuts.slice(1).every((c) => !c.video), "옛 클립이 남았다").toBe(true);
  });

  it("아직이면 아무것도 안 바꾼다", async () => {
    const f = fixture(JOB);
    await collectReelOneShot("pid", "uid", { ...f, collectClip: async () => ({ done: false }) });
    expect(f.d.cuts[0].video).toBeFalsy();
    expect(f.d.reel.job).toBeTruthy();
  });

  it("접수증이 없으면 fal 에 묻지도 않는다 — 겹친 수거를 막는 자리다", async () => {
    const f = fixture(null);
    let asked = 0;
    await collectReelOneShot("pid", "uid", { ...f, collectClip: async () => { asked++; return { done: false }; } });
    expect(asked).toBe(0);
  });

  it("★★ **던지지 않는다** — 부르는 쪽이 상태 조회라, 던지면 화면이 상태조차 못 읽는다", async () => {
    const f = fixture(JOB);
    await expect(collectReelOneShot("pid", "uid", {
      ...f, collectClip: async () => { throw new Error("fal 이 이상해요"); },
    })).resolves.toBeTruthy();
    expect(f.d.reel.error, "실패가 문서에 안 남았다").toBeTruthy();
  });
});

describe("배선", () => {
  it("★ 상태 라우트가 수거를 먼저 한다 — 순서가 바뀌면 방금 끝난 영상을 한 박자 늦게 본다", () => {
    const src = readFileSync("app/api/reel/[id]/status/route.js", "utf8");
    expect(src, "수거를 안 부른다").toMatch(/collectReelOneShot/);
    expect(src.indexOf("collectReelOneShot")).toBeLessThan(src.indexOf("getProject(id"));
  });
});
