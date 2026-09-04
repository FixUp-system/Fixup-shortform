// 15초 이하 한 편은 **스토리보드 한 장 + 프롬프트 하나 → r2v 한 번**이다.
//
// ★ 2026-08-25 실측(scripts/measure/bake-storyboard-r2v.mjs · $2.02 · 15.07초): 스토리보드
//   한 장을 통째로 r2v 에 주면 이음새 없는 한 편이 나왔다. 그러면 컷별 프롬프트·컷별
//   굽기가 15초 이하에서는 통째로 필요 없다.
// ★ **컷별 배선은 지우지 않는다** — 45·60초는 통짜가 물리적으로 불가라(Seedance 2.0 은
//   한 번에 15초가 최대) 그 길을 그대로 쓴다. 그래서 갈래 판정을 순수 함수 하나에 두고
//   여기서 못 박는다(planReelImages 가 그 선례다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  ONESHOT_MAX_SECONDS, planReelBake, reelSheetUrl, reelWholePrompt,
  buildOneShotPrompt, reelVoice, reelNarrates, canBakeReel, isReelOneShotStale, storyboardGridFor,
} from "../lib/reel/oneshot.js";
import { runReelOneShot, collectReelOneShot } from "../lib/reel/pipeline.js";
// ★★ 2026-08-31 — 통짜가 **큐로 옮겨 갔다.** 굽기는 이제 접수만 하고 돌아오고, 결과는
//   상태 조회가 수거한다(lib/reel/pipeline.js 의 collectReelOneShot). 그래서 주입 이름이
//   makeClip → submitClip 이고, **결과를 재는 판은 수거까지 거쳐야** 한다.
//   요청 모양(refs·프롬프트)을 재는 판은 접수가 같은 인자를 받으므로 그대로다.
const JOB = { requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 };
const collectDone = (f, url = "https://x/v.mp4", seconds = 15) =>
  collectReelOneShot("pid", "uid", { ...f, collectClip: async () => ({ done: true, url, seconds }) });


const cut = (idx, extra = {}) => ({
  idx, shows: `panel ${idx}`, seconds: 5,
  image: { url: `https://x/c${idx}.jpg`, sheet: "https://fal/sheet.png", cell: idx },
  ...extra,
});

function doc(over = {}) {
  return {
    id: "pid",
    kind: "reel",
    settings: { target_seconds: 15, aspect_ratio: "9:16", i2v_model: "seedance-2.0" },
    scenario: { text: "A quiet workshop bench; the camera drifts left." },
    cuts: [cut(0), cut(1), cut(2)],
    ...over,
  };
}

describe("순수 규율", () => {
  it("fs·env 로 이어지는 import 가 없다 — 같은 lib/reel 안의 순수 모듈만 허용", () => {
    const src = readFileSync("lib/reel/oneshot.js", "utf8");
    const specs = [...src.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["'];?\s*$/gm)].map((m) => m[1]);
    // ★★ 2026-08-25 — 한 칸 넓혔다. 지키려는 것은 "사슬 끝에 fs·env 가 안 닿는 것"이지
    //   경로 모양이 아니다(tests/reel-steps.test.js 가 같은 이유로 먼저 넓혔다).
    //   lib/clip-limits.js 는 스스로 순수하고 lib/tiers.js → lib/ad/models.js 만 무는데
    //   그 둘도 순수하다. 통짜 상한을 **모델이 정하게** 하면서 필요해진 자리다 —
    //   여기서 다시 15 를 적으면 2.5(30초)에서 두 값이 갈린다.
    // ★★ 2026-08-27 — 한 칸 더 넓혔다. lib/progress.js 는 스스로 순수하고
    //   (import 는 lib/failure.js 하나, 그 파일은 import 0 건) 화면 다섯이 이미 읽는다.
    //   "끝났는가"의 판정(isCutDone)을 여기서 다시 적으면 파이프라인과 조용히 갈린다 —
    //   그 갈림이 images_error 버그(2026-08-14)의 뿌리였다.
    // ★ `../` 를 통째로 열지 않는다 — 이 둘만 허용한다.
    // ★ 2026-08-31 — `../aspects.js` 를 더했다. **import 가 0 건인 순수 데이터 파일**이라
    //   (실측) 이 판이 지키려는 것("사슬 끝에 fs·env 가 안 닿는다")을 안 깬다. 여기서
    //   "9:16" 을 손으로 파싱하면 화면 비율 표와 두 벌이 된다.
    // ★ 2026-09-04 — `../photos.js` 를 더했다. **import 가 0 건인 순수 파일**이고 화면
    //   둘(app/reel/new · app/ads/new)이 이미 읽는다. 통짜가 함께 보낼 사진을 고르려면
    //   "인물인가"(isPersonPhoto)와 첨부 문구(attachedRoleLine)가 필요한데, 여기서 다시
    //   적으면 컷별 갈래와 **두 벌**이 되어 갈래마다 다른 지시가 나간다.
    const ALLOWED_OUTSIDE = ["../clip-limits.js", "../progress.js", "../cuts.js", "../aspects.js", "../photos.js"];
    for (const spec of specs) {
      if (ALLOWED_OUTSIDE.includes(spec)) continue;
      expect(spec, `허용 밖의 import: ${spec}`).toMatch(/^\.\//);
    }
  });
});

describe("갈래 판정 — planReelBake", () => {
  it("15초 이하 + 스토리보드 + 격자에 떨어지는 칸 수면 통짜다", () => {
    const p = planReelBake(doc());
    expect(p.mode).toBe("oneshot");
    expect(p.sheet).toBe("https://fal/sheet.png");
    // ★ 2026-08-25 — canvas 는 프리셋 이름이 아니라 실제 치수 비다(격자가 계산이 됐다).
    expect({ rows: p.grid.rows, cols: p.grid.cols }).toEqual({ rows: 1, cols: 3 });
    expect(p.seconds).toBe(15);
  });

  it("16초 이상이면 컷별이다 — 통짜가 물리적으로 불가한 길이다", () => {
    expect(planReelBake(doc({ settings: { target_seconds: 30 } })).mode).toBe("percut");
    expect(ONESHOT_MAX_SECONDS).toBe(15);
  });

  it("스토리보드가 없으면(컷별로 그린 그림) 컷별이다", () => {
    const d = doc();
    d.cuts = d.cuts.map((c) => ({ ...c, image: { url: c.image.url } }));
    expect(planReelBake(d).mode).toBe("percut");
  });

  it("★ 안 여는 칸 수면 컷별이다 — 던지지 않는다", () => {
    const d = doc();
    d.cuts = [cut(0), cut(1)];          // 2컷 — 하한(3) 아래라 안 연다
    expect(planReelBake(d).mode).toBe("percut");
    const d7 = doc();
    d7.cuts = [0, 1, 2, 3, 4, 5, 6].map(cut);  // 7컷 — 빈 칸이 생겨 아직 안 연다
    expect(planReelBake(d7).mode).toBe("percut");
  });

  it("컷이 없으면 컷별이다 — 0개를 굽고 완성이 되지 않는다", () => {
    expect(planReelBake(doc({ cuts: [] })).mode).toBe("percut");
  });

  it("빈 값에도 안 던진다", () => {
    expect(planReelBake(null).mode).toBe("percut");
    expect(planReelBake({}).mode).toBe("percut");
  });

  it("격자 판정은 계산 하나다 — 여기서 새로 만들지 않는다", () => {
    const g = storyboardGridFor(9, { resolution: "720p" });
    expect({ rows: g.rows, cols: g.cols }).toEqual({ rows: 3, cols: 3 });
    expect(storyboardGridFor(7, { resolution: "720p" })).toBe(null);
  });
});

describe("스토리보드 주소 판독 — reelSheetUrl", () => {
  it("컷에 적힌 sheet 를 읽는다", () => {
    expect(reelSheetUrl(doc().cuts)).toBe("https://fal/sheet.png");
  });
  it("없으면 빈 문자열이다", () => {
    expect(reelSheetUrl([{ idx: 0, image: { url: "u" } }])).toBe("");
    expect(reelSheetUrl(null)).toBe("");
  });
});

describe("전체 프롬프트 하나 — reelWholePrompt", () => {
  it("기본은 시나리오 원문이다 — 통짜 지시문으로 이미 쓰여 있다", () => {
    expect(reelWholePrompt(doc())).toBe("A quiet workshop bench; the camera drifts left.");
  });
  it("사장님이 고친 것이 있으면 그것이 이긴다", () => {
    expect(reelWholePrompt(doc({ reel: { prompt: "  더 천천히  " } }))).toBe("더 천천히");
  });
  it("빈 값에도 안 던진다", () => {
    expect(reelWholePrompt(null)).toBe("");
  });
});

describe("굽기 지문 — buildOneShotPrompt", () => {
  const grid = { rows: 2, cols: 3 };
  const p = () => buildOneShotPrompt(grid, 6, "본문이다");

  it("패널을 순서대로 읽으라고 못 박는다 — 행이 둘부터는 순서가 자명하지 않다", () => {
    expect(p()).toContain("6-panel storyboard");
    expect(p()).toContain("2-row by 3-column grid");
    expect(p()).toMatch(/read in order left to right across each row, top row first/);
  });

  it("분할 화면을 금지한다 — 이 문장이 없으면 모델이 격자를 그대로 움직인다", () => {
    expect(p()).toMatch(/Do NOT show the grid, panel borders, or any split screen/);
    expect(p()).toContain("one single continuous");
  });

  it("본문(전체 프롬프트)이 머리말 뒤에 그대로 실린다", () => {
    expect(p().endsWith("본문이다")).toBe(true);
  });

  it("본문이 없으면 머리말만 나간다 — 빈 줄을 안 만든다", () => {
    expect(buildOneShotPrompt(grid, 6, "")).not.toMatch(/\n\n$/);
  });
});

describe("굽기 게이트 — canBakeReel", () => {
  it("통짜는 컷별 프롬프트 없이도 열린다 — 프롬프트가 시나리오 원문이라서다", () => {
    const d = doc();
    expect(d.cuts.every((c) => !c.clip_prompt)).toBe(true);
    expect(canBakeReel(d)).toBe(true);
  });

  it("통짜인데 프롬프트가 통째로 비면 안 열린다", () => {
    expect(canBakeReel(doc({ scenario: { text: "" } }))).toBe(false);
  });

  it("컷별은 예전 판정 그대로다 — 컷마다 프롬프트와 그림이 있어야 한다", () => {
    const d = doc({ settings: { target_seconds: 30 } });
    expect(canBakeReel(d)).toBe(false);
    d.cuts = d.cuts.map((c) => ({ ...c, clip_prompt: "b" }));
    expect(canBakeReel(d)).toBe(true);
  });
});

describe("낡음 — isReelOneShotStale", () => {
  const baked = () => {
    const d = doc();
    d.cuts[0].video = {
      url: "https://x/v.mp4", seconds: 15,
      of: "A quiet workshop bench; the camera drifts left.", imageOf: "https://fal/sheet.png",
    };
    return d;
  };

  it("아직 안 구웠으면 낡지 않았다", () => {
    expect(isReelOneShotStale(doc())).toBe(false);
  });
  it("각인이 지금 프롬프트와 같으면 낡지 않았다", () => {
    expect(isReelOneShotStale(baked())).toBe(false);
  });
  it("프롬프트를 고치면 낡는다", () => {
    const d = baked();
    d.reel = { prompt: "다르게" };
    expect(isReelOneShotStale(d)).toBe(true);
  });
  it("스토리보드를 다시 그리면 낡는다", () => {
    const d = baked();
    d.cuts = d.cuts.map((c) => ({ ...c, image: { ...c.image, sheet: "https://fal/sheet2.png" } }));
    expect(isReelOneShotStale(d)).toBe(true);
  });
  it("그림 각인을 모르는 옛 클립은 그 축으로 안 낡는다", () => {
    const d = baked();
    delete d.cuts[0].video.imageOf;
    expect(isReelOneShotStale(d)).toBe(false);
  });
});

// ── 굽기 배선 ────────────────────────────────────────────────────────────
function fixture(over = {}) {
  const d = doc(over);
  return {
    doc: d,
    getProject: async () => d,
    updateProject: async (_id, _owner, fn) => { Object.assign(d, fn(d)); return d; },
    toFalUrl: async (u) => u,
  };
}

describe("runReelOneShot", () => {
  it("굽기가 **한 번**이다 — 원장·예산에도 한 번만 적힌다", async () => {
    const f = fixture();
    const seen = [];
    await runReelOneShot("pid", "uid", {
      ...f,
      submitClip: async (a) => { seen.push(a); return JOB; },
    });
    expect(seen).toHaveLength(1);
  });

  it("스토리보드 한 장만 참조로 실린다 — 첫 프레임(image_url)이 아니라 참조다", async () => {
    const f = fixture();
    const seen = [];
    await runReelOneShot("pid", "uid", {
      ...f,
      submitClip: async (a) => { seen.push(a); return JOB; },
    });
    expect(seen[0].refs).toEqual([{ url: "https://fal/sheet.png" }]);
    expect(seen[0].imageUrl).toBe(null);
    expect(seen[0].seconds).toBe(15);
  });

  it("지문은 머리말 + 전체 프롬프트다", async () => {
    const f = fixture();
    const seen = [];
    await runReelOneShot("pid", "uid", {
      ...f, submitClip: async (a) => { seen.push(a); return JOB; },
    });
    expect(seen[0].prompt).toContain("3-panel storyboard");
    expect(seen[0].prompt).toContain("A quiet workshop bench");
  });

  it("결과는 첫 컷에 담고 각인을 남긴다 — ⑥완성이 그 컷을 재료로 읽는다", async () => {
    const f = fixture();
    await runReelOneShot("pid", "uid", { ...f, submitClip: async () => JOB });
    await collectDone(f);
    // ★ 2026-09-03 — `said` 가 늘었다. **각인이 아니다**(낡음 판정에 안 쓴다) — 자막이
    //   무엇을 태울지를 정하는 값이다. 이 fixture 에는 한 벌이 없어 빈 문자열이다.
    expect(f.doc.cuts[0].video).toEqual({
      url: "https://x/v.mp4", seconds: 15, whole: true, said: "",
      of: "A quiet workshop bench; the camera drifts left.", imageOf: "https://fal/sheet.png",
    });
    // 나머지 컷은 온전하다 — 같은 클립을 여러 번 담으면 합성이 그만큼 이어 붙인다.
    expect(f.doc.cuts[1].video).toBeUndefined();
    expect(f.doc.cuts[2].video).toBeUndefined();
    expect(f.doc.cuts).toHaveLength(3);
  });

  it("컷별로 구워 둔 옛 클립은 걷어낸다 — 안 걷으면 완성본이 한 편 + 옛 컷들로 이어 붙는다", async () => {
    const f = fixture();
    f.doc.cuts[1].video = { url: "https://x/old1.mp4", seconds: 4, of: "b1" };
    f.doc.cuts[2].video = { url: "https://x/old2.mp4", seconds: 4, of: "b2" };
    await runReelOneShot("pid", "uid", { ...f, submitClip: async () => JOB });
    await collectDone(f);
    expect(f.doc.cuts[0].video.url).toBe("https://x/v.mp4");
    expect(f.doc.cuts[1].video).toBeUndefined();
    expect(f.doc.cuts[2].video).toBeUndefined();
    // 컷 자체는 온전하다 — 문장·그림·초는 그대로다(자막이 그것을 읽는다).
    expect(f.doc.cuts[1].sentence ?? f.doc.cuts[1].shows).toBe("panel 1");
    expect(f.doc.cuts[2].image.url).toBe("https://x/c2.jpg");
  });

  it("이미 구웠고 안 낡았으면 다시 안 굽는다 — 순수 이중지출을 닫는다", async () => {
    const f = fixture();
    let calls = 0;
    const submitClip = async () => { calls += 1; return JOB; };
    await runReelOneShot("pid", "uid", { ...f, submitClip });
    await collectDone(f);
    await runReelOneShot("pid", "uid", { ...f, submitClip });
    expect(calls).toBe(1);
  });

  it("프롬프트를 고치면 다시 굽는다", async () => {
    const f = fixture();
    let calls = 0;
    const submitClip = async () => { calls += 1; return JOB; };
    await runReelOneShot("pid", "uid", { ...f, submitClip });
    await collectDone(f);
    f.doc.reel = { ...(f.doc.reel || {}), prompt: "다르게 만들어 줘" };
    await runReelOneShot("pid", "uid", { ...f, submitClip });
    expect(calls).toBe(2);
  });

  it("통짜 갈래가 아니면 값이 나가기 전에 던진다", async () => {
    const f = fixture({ settings: { target_seconds: 45 } });
    let calls = 0;
    await expect(runReelOneShot("pid", "uid", {
      ...f, submitClip: async () => { calls += 1; return JOB; },
    })).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it("전체 프롬프트가 비어 있으면 값이 나가기 전에 던진다", async () => {
    const f = fixture({ scenario: { text: "" } });
    let calls = 0;
    await expect(runReelOneShot("pid", "uid", {
      ...f, submitClip: async () => { calls += 1; return JOB; },
    })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});

// ── 라우트·화면이 같은 판정을 본다 ────────────────────────────────────────
describe("갈래 판정은 한 곳이다", () => {
  const clips = readFileSync("app/api/reel/[id]/clips/route.js", "utf8");
  const prompts = readFileSync("app/reel/[id]/prompts/page.js", "utf8");
  const video = readFileSync("app/reel/[id]/video/page.js", "utf8");
  const images = readFileSync("app/reel/[id]/images/page.js", "utf8");

  it("굽는 문이 판정을 lib 에서 가져온다 — 손으로 초를 다시 세지 않는다", () => {
    expect(clips).toContain("planReelBake");
    expect(clips).toContain("runReelOneShot");
  });

  it("④화면도 같은 판정을 본다", () => {
    expect(prompts).toContain("planReelBake");
  });

  it("⑤화면도 같은 판정을 본다", () => {
    expect(video).toContain("planReelBake");
  });

  it("스토리보드 주소 판독도 한 곳이다 — ③화면이 손으로 안 찾는다", () => {
    expect(images).toContain("reelSheetUrl");
    expect(images).not.toMatch(/c\?\.image\?\.sheet/);
  });
});

describe("④영상 프롬프트 화면 — 통짜 갈래", () => {
  const src = readFileSync("app/reel/[id]/prompts/page.js", "utf8");
  it("스토리보드 원본 한 장을 보여 준다", () => {
    expect(src).toContain("reelSheetUrl");
  });
  it("전체 프롬프트 하나를 보여 준다", () => {
    expect(src).toContain("reelWholePrompt");
  });
  it("컷별 목록은 컷별 갈래에서만 그린다", () => {
    expect(src).toMatch(/oneShot\s*\?/);
  });
});

// ── 목소리 ──────────────────────────────────────────────────────────────
//
// ★★ 2026-08-27 — 시나리오는 목소리를 **정한다**(lib/ad/scenario.js: "★ 목소리도 함께
//   정한다(voice)"). 광고(lib/ad/generate.js 의 withSpokenLines)와 컷별(lib/cuts.js)은
//   그 값을 지문에 싣는데 **통짜 갈래만 안 실었다** — 길이 하나로 목소리 지정이 있고
//   없고가 갈렸고, 15초는 전부 이 갈래라 사장님이 쓰는 길에서만 사라졌다.
//   증상: 영상 모델이 제 기본값으로 읽는다(lib/ad/generate.js 주석의 "AI 가 읽어주는 느낌").
//
// ★★ **머리말 쪽에 붙인다.** 각인(video.of)은 본문(body)만 문다(lib/reel/pipeline.js 의
//   `of: body`). 그래서 여기 붙는 글은 각인을 **안 흔든다** — 이미 구운 옛 편이 낡지
//   않는다. 사장님 지시가 정확히 그것이었다: "옛 문서는 건드리지 말고."
describe("목소리 — buildOneShotPrompt", () => {
  const grid = { rows: 2, cols: 3 };
  const voice = "a warm, unhurried Korean woman in her late twenties";

  it("목소리를 지문에 싣는다 — 안 실으면 모델이 제 기본값으로 읽는다", () => {
    expect(buildOneShotPrompt(grid, 6, "본문이다", { voice })).toContain(`Voice: ${voice}.`);
  });

  it("목소리가 화면 글자로 새지 않게 못 박는다 — 소리지 자막이 아니다", () => {
    expect(buildOneShotPrompt(grid, 6, "본문이다", { voice }))
      .toMatch(/it is audio only, never on-screen text/);
  });

  it("본문 뒤에 온다 — 뒤에 올수록 모델이 강하게 받는다(이 저장소의 규약)", () => {
    const p = buildOneShotPrompt(grid, 6, "본문이다", { voice });
    expect(p.indexOf("본문이다")).toBeLessThan(p.indexOf("Voice:"));
  });

  it("★목소리가 없으면 지문이 **글자 그대로** 예전과 같다 — 옛 문서 보호", () => {
    const was = buildOneShotPrompt(grid, 6, "본문이다");
    expect(buildOneShotPrompt(grid, 6, "본문이다", { voice: "" })).toBe(was);
    expect(buildOneShotPrompt(grid, 6, "본문이다", { voice: "   " })).toBe(was);
    expect(buildOneShotPrompt(grid, 6, "본문이다", { voice: null })).toBe(was);
    expect(was).not.toContain("Voice:");
  });
});

describe("목소리 읽기 — reelVoice", () => {
  it("시나리오가 정한 목소리를 읽는다 — 앞뒤 공백은 걷는다", () => {
    expect(reelVoice(doc({ scenario: { text: "t", voice: "  차분한 20대 여성  " } })))
      .toBe("차분한 20대 여성");
  });

  it("정한 적 없으면 빈 문자열이다 — 옛 문서에는 아무것도 안 붙는다", () => {
    expect(reelVoice(doc())).toBe("");
    expect(reelVoice(null)).toBe("");
  });
});

describe("runReelOneShot — 목소리", () => {
  const withVoice = () =>
    fixture({ scenario: { text: "A quiet workshop bench.", voice: "차분한 20대 여성" } });

  it("시나리오가 정한 목소리가 fal 로 나간다", async () => {
    const f = withVoice();
    const seen = [];
    await runReelOneShot("pid", "uid", {
      ...f, submitClip: async (a) => { seen.push(a); return JOB; },
    });
    expect(seen[0].prompt).toContain("Voice: 차분한 20대 여성.");
    expect(seen[0].prompt).toContain("A quiet workshop bench.");
  });

  it("★각인은 본문 그대로다 — 목소리가 각인에 안 섞인다", async () => {
    const f = withVoice();
    // ★ 2026-08-31 — 각인이 정해지는 자리가 **접수증**으로 옮겨 갔다(큐 이전). 수거가
    //   그 값을 그대로 video.of 에 옮기므로, 여기서는 접수증을 재는 것이 더 곧다.
    await runReelOneShot("pid", "uid", { ...f, submitClip: async () => ({ requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }), });
    expect(f.doc.reel.job.of).toBe("A quiet workshop bench.");
    expect(f.doc.reel.job.of).not.toContain("Voice:");
  });

  it("★목소리가 생겨도 이미 구운 옛 편은 안 낡는다 — 다시 굽지 않는다(돈이 안 나간다)", async () => {
    const old = { url: "https://x/old.mp4", of: "A quiet workshop bench.", imageOf: "https://fal/sheet.png", whole: true };
    const f = fixture({
      scenario: { text: "A quiet workshop bench.", voice: "차분한 20대 여성" },
      cuts: [cut(0, { video: old }), cut(1), cut(2)],
    });
    let baked = 0;
    await runReelOneShot("pid", "uid", {
      ...f, makeClip: async () => { baked++; return { url: "https://x/v.mp4", seconds: 15 }; },
    });
    expect(baked).toBe(0);
  });
});

// ── 화면 밖 목소리 명시 ──────────────────────────────────────────────────
//
// ★★ 2026-08-27 — 컷별 갈래는 화자를 보고 **셋으로 갈라** 못 박는다(lib/cuts.js):
//   내레이션이면 `A narrator speaks in voiceover, off-screen — no one in frame speaks
//   or moves their lips.` · 화면 속 인물이면 `… speaks to the camera with natural lip
//   sync.` · 대사가 없으면 `No talking faces or lip sync.`
//   **통짜 갈래에는 그 셋 중 아무것도 없었다.** 남은 단서는 LLM 이 지시문에 자연어로 써 준
//   "as the narrator says …" 하나인데 그것은 **지시가 아니라 묘사**라, 모델이 인물의 입을
//   움직여도 막는 문장이 없다.
//
// ★ **내레이션일 때만 붙인다.** 화면 속 인물이 말하는 시나리오에 "아무도 입을 안 움직인다"를
//   실으면 틀린 지시가 된다 — 그 갈래(립싱크)는 배선이 따로 없어 여기서 열지 않는다.
// ★ 화자 판정은 **다시 적지 않는다** — lib/cuts.js 의 isNarrationSpeaker 하나다.
//   두 벌로 재면 컷별과 통짜의 판단이 조용히 갈린다(이 저장소 규율).
describe("화면 밖 목소리 — reelNarrates", () => {
  const shot = (line, speaker) => ({ line, speaker });

  it("대사가 있는 장면의 화자가 전부 내레이션이면 참이다", () => {
    expect(reelNarrates(doc({ scenario: { text: "t", shots: [
      shot("오늘도 수고했어요.", "내레이션"), shot("", ""), shot("그 맛, 그대로.", "나레이션"),
    ] } }))).toBe(true);
  });

  it("화면 속 인물이 하나라도 말하면 거짓이다 — 그 사람은 입이 움직여야 한다", () => {
    expect(reelNarrates(doc({ scenario: { text: "t", shots: [
      shot("오늘도 수고했어요.", "내레이션"), shot("맛있어요!", "40대 남성 제빵사"),
    ] } }))).toBe(false);
  });

  it("대사가 아예 없으면 거짓이다 — 붙일 이유가 없다", () => {
    expect(reelNarrates(doc({ scenario: { text: "t", shots: [shot("", ""), shot("", "")] } }))).toBe(false);
    expect(reelNarrates(doc())).toBe(false);
    expect(reelNarrates(null)).toBe(false);
  });
});

describe("화면 밖 목소리 — buildOneShotPrompt", () => {
  const grid = { rows: 2, cols: 3 };
  const voice = "a warm, unhurried Korean woman in her late twenties";

  it("아무도 입을 안 움직인다고 못 박는다 — 컷별 갈래의 그 문장 그대로다", () => {
    expect(buildOneShotPrompt(grid, 6, "본문이다", { narrates: true }))
      .toContain("A narrator speaks in voiceover, off-screen — no one in frame speaks or moves their lips.");
  });

  it("목소리보다 앞에 온다 — 컷별 갈래와 같은 차례다", () => {
    const p = buildOneShotPrompt(grid, 6, "본문이다", { voice, narrates: true });
    expect(p.indexOf("voiceover")).toBeLessThan(p.indexOf("Voice:"));
    expect(p.indexOf("본문이다")).toBeLessThan(p.indexOf("voiceover"));
  });

  it("★내레이션이 아니면 안 붙는다 — 지문이 글자 그대로 예전과 같다", () => {
    const was = buildOneShotPrompt(grid, 6, "본문이다", { voice });
    expect(buildOneShotPrompt(grid, 6, "본문이다", { voice, narrates: false })).toBe(was);
    expect(was).not.toContain("voiceover");
  });
});

describe("runReelOneShot — 화면 밖 목소리", () => {
  const narrated = (over = {}) => fixture({
    scenario: {
      text: "A quiet workshop bench.",
      voice: "차분한 20대 여성",
      shots: [{ line: "오늘도 수고했어요.", speaker: "내레이션" }],
      ...over,
    },
  });

  it("내레이션 시나리오면 그 문장이 fal 로 나간다", async () => {
    const f = narrated();
    const seen = [];
    await runReelOneShot("pid", "uid", {
      ...f, submitClip: async (a) => { seen.push(a); return JOB; },
    });
    expect(seen[0].prompt).toContain("no one in frame speaks or moves their lips");
  });

  it("화면 속 인물이 말하면 안 나간다 — 립싱크 갈래는 여기서 안 연다", async () => {
    const f = narrated({ shots: [{ line: "맛있어요!", speaker: "40대 남성 제빵사" }] });
    const seen = [];
    await runReelOneShot("pid", "uid", {
      ...f, submitClip: async (a) => { seen.push(a); return JOB; },
    });
    expect(seen[0].prompt).not.toContain("voiceover");
  });

  it("★각인은 여전히 본문 그대로다 — 옛 편이 이 변경으로 안 낡는다", async () => {
    const f = narrated();
    // ★ 2026-08-31 — 각인이 정해지는 자리가 **접수증**으로 옮겨 갔다(큐 이전). 수거가
    //   그 값을 그대로 video.of 에 옮기므로, 여기서는 접수증을 재는 것이 더 곧다.
    await runReelOneShot("pid", "uid", { ...f, submitClip: async () => ({ requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }), });
    expect(f.doc.reel.job.of).toBe("A quiet workshop bench.");
    expect(f.doc.reel.job.of).not.toContain("voiceover");
  });
});
