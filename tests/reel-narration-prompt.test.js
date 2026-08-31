// 굽기 지시문이 내레이션 **한 벌**을 싣는다.
//
// ★★ 2026-08-27 — 지금까지 말은 `scenario.text` 안에 `as the narrator says "…"` 로 장면마다
//   흩어져 있었다. 모델은 그것을 **장면 하나 = 문장 하나**로 읽고 장면 경계에서 끊는다.
//   이제 장면 서술은 그림만 말하고, 말은 **끝에 한 번** 한 덩어리로 간다.
//
// ★ **새 문장을 발명하지 않는다** — lib/cuts.js 의 내레이션 갈래가 쓰는 문장을 한 벌 단위로
//   옮긴다(그 문구는 실측으로 다듬어진 것이다). 더하는 것은 **이어짐을 요구하는 한 마디**뿐이다.
// ★★ **회귀 0 은 각인 기준이다** — 각인(video.of)이 무는 것은 본문(body) 하나이고
//   (lib/reel/pipeline.js 의 `of: body`) 이 절들은 지문 쪽에 붙는다. 그래서 이미 값을 치른
//   옛 편이 이 변경으로 낡지 않는다.
import { describe, it, expect } from "vitest";
import { buildOneShotPrompt, reelNarrates } from "../lib/reel/oneshot.js";
import { runReelOneShot } from "../lib/reel/pipeline.js";

const grid = { rows: 2, cols: 3 };
const VOICE = "a warm, unhurried Korean woman in her late twenties";
const TEXT = "오늘도 수고했어요. 끓이기만 하면 돼요. 집에서, 간편하게.";

const build = (speech) => buildOneShotPrompt(grid, 6, "본문이다", speech);

describe("한 벌이 지시문에 실린다", () => {
  const p = () => build({ narration: { text: TEXT, sayAs: "" }, langLine: "Korean", narrates: true });

  it("그 글을 **글자 그대로** 말하라고 한다", () => {
    expect(p()).toContain(`Says exactly, in Korean: "${TEXT}"`);
  });

  it("★끊지 말라고 못 박는다 — 컷 경계에서 쉬면 그 자리가 공백이 된다", () => {
    expect(p()).toMatch(/one continuous narration across the whole film/);
    expect(p()).toMatch(/not one line per shot/);
    expect(p()).toMatch(/do not pause between shots/);
  });

  it("화면 밖 목소리라고 함께 말한다 — 인물의 입이 움직이면 안 된다", () => {
    expect(p()).toContain("no one in frame speaks or moves their lips");
  });

  it("목소리 절과 함께 설 수 있다 — 차례는 컷별 갈래와 같다", () => {
    const s = build({ voice: VOICE, narration: { text: TEXT, sayAs: "" }, langLine: "Korean", narrates: true });
    expect(s.indexOf("voiceover")).toBeLessThan(s.indexOf("Voice:"));
    expect(s.indexOf("Voice:")).toBeLessThan(s.indexOf("Says exactly"));
  });

  it("본문 뒤에 온다 — 장면 서술이 먼저다", () => {
    expect(p().indexOf("본문이다")).toBeLessThan(p().indexOf("Says exactly"));
  });
});

describe("읽는 표기", () => {
  it("say_as 가 있으면 그렇게 읽으라고 한다 — 글자와 소리는 다른 축이다", () => {
    const s = build({
      narration: { text: "Giants 에디션이에요.", sayAs: "자이언츠 에디션이에요." },
      langLine: "Korean", narrates: true,
    });
    expect(s).toContain("자이언츠 에디션이에요.");
    expect(s).toMatch(/Pronounce it as/);
  });

  it("없으면 그 문장이 아예 없다", () => {
    expect(build({ narration: { text: TEXT, sayAs: "" }, langLine: "Korean", narrates: true }))
      .not.toMatch(/Pronounce it as/);
  });
});

describe("★회귀 0 — 한 벌이 없으면", () => {
  it("지문이 글자 그대로 예전과 같다", () => {
    const was = build({ voice: VOICE, narrates: true });
    expect(build({ voice: VOICE, narrates: true, narration: null })).toBe(was);
    expect(build({ voice: VOICE, narrates: true, narration: { text: "" } })).toBe(was);
    expect(was).not.toMatch(/Says exactly/);
  });

  it("옛 문서는 말 절이 통째로 없다", () => {
    const bare = build({});
    expect(bare).not.toMatch(/Says exactly|voiceover|Voice:/);
    expect(bare).toContain("본문이다");
  });
});

describe("판정 — reelNarrates 가 한 벌도 근거로 본다", () => {
  const doc = (over) => ({ scenario: { text: "t", ...over } });

  it("★새 길: line 이 전부 비어도 한 벌이 있으면 참이다", () => {
    // 새 길에서는 내레이션이 shots[].line 이 아니라 narration 에 산다 — 옛 판정만으로는
    // "말하는 장면이 하나도 없다"가 되어 화면 밖 목소리 절이 통째로 빠진다.
    expect(reelNarrates(doc({
      narration: { text: TEXT },
      shots: [{ line: "", speaker: "" }, { line: "", speaker: "" }],
    }))).toBe(true);
  });

  it("한 벌이 있어도 화면 속 인물이 말하면 거짓이다 — 그 사람은 입이 움직여야 한다", () => {
    expect(reelNarrates(doc({
      narration: { text: TEXT },
      shots: [{ line: "맛있어요!", speaker: "40대 남성 제빵사" }],
    }))).toBe(false);
  });

  it("옛 길 판정은 그대로다", () => {
    expect(reelNarrates(doc({ shots: [{ line: "오늘도 수고했어요.", speaker: "내레이션" }] }))).toBe(true);
    expect(reelNarrates(doc({ shots: [{ line: "", speaker: "" }] }))).toBe(false);
  });
});

// ── 굽기까지 실제로 나르는가 ─────────────────────────────────────────────
//
// ★ 순수 함수가 옳아도 파이프라인이 안 넘기면 아무 일도 안 일어난다 — 이 저장소가
//   여러 번 밟은 자리다(edits 가 화면·라우트를 다 지나고 프롬프트에만 안 실렸던 일).
const cut = (idx, extra = {}) => ({
  idx, shows: `panel ${idx}`, seconds: 5,
  image: { url: `https://x/c${idx}.jpg`, sheet: "https://fal/sheet.png", cell: idx },
  ...extra,
});

function fixture(over = {}) {
  const d = {
    id: "pid", kind: "reel",
    settings: { target_seconds: 15, aspect_ratio: "9:16", i2v_model: "seedance-2.0", speech_lang: "ko" },
    scenario: { text: "A quiet workshop bench.", voice: "차분한 20대 여성" },
    cuts: [cut(0), cut(1), cut(2)],
    ...over,
  };
  return {
    doc: d,
    getProject: async () => d,
    updateProject: async (_id, _owner, fn) => { Object.assign(d, fn(d)); return d; },
    toFalUrl: async (u) => u,
  };
}

describe("runReelOneShot — 한 벌", () => {
  const withOne = () => fixture({
    scenario: {
      text: "A quiet workshop bench.",
      voice: "차분한 20대 여성",
      narration: { text: TEXT, say_as: "" },
      shots: [{ line: "", speaker: "" }, { line: "", speaker: "" }, { line: "", speaker: "" }],
    },
  });

  it("한 벌이 fal 로 나간다", async () => {
    const f = withOne();
    const seen = [];
    await runReelOneShot("pid", "uid", {
      ...f, submitClip: async (a) => { seen.push(a); return { requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }; },
    });
    expect(seen[0].prompt).toContain(`Says exactly, in Korean: "${TEXT}"`);
    expect(seen[0].prompt).toMatch(/do not pause between shots/);
  });

  // ⚠️ 말 언어는 **셋뿐이다**(lib/subtitle-langs.js: ko·ja·zh). 영어는 목록에 없어
  //   모르는 값으로 한국어에 떨어진다 — 그것이 옛 문서를 지키는 안전장치다.
  it("말 언어를 그 프로젝트에서 읽는다 — 손으로 적지 않는다", async () => {
    const f = withOne();
    f.doc.settings.speech_lang = "ja";
    const seen = [];
    await runReelOneShot("pid", "uid", {
      ...f, submitClip: async (a) => { seen.push(a); return { requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }; },
    });
    expect(seen[0].prompt).toMatch(/Says exactly, in Japanese/);
  });

  it("★각인은 여전히 본문 그대로다 — 한 벌이 각인에 안 섞인다", async () => {
    const f = withOne();
    // ★ 2026-08-31 — 각인이 정해지는 자리가 **접수증**으로 옮겨 갔다(큐 이전). 수거가
    //   그 값을 그대로 video.of 에 옮기므로, 여기서는 접수증을 재는 것이 더 곧다.
    await runReelOneShot("pid", "uid", { ...f, submitClip: async () => ({ requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }), });
    expect(f.doc.reel.job.of).toBe("A quiet workshop bench.");
    expect(f.doc.reel.job.of).not.toMatch(/Says exactly/);
  });

  it("★옛 문서는 그 절이 통째로 없다", async () => {
    const f = fixture();
    const seen = [];
    await runReelOneShot("pid", "uid", {
      ...f, submitClip: async (a) => { seen.push(a); return { requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }; },
    });
    expect(seen[0].prompt).not.toMatch(/Says exactly|do not pause between shots/);
  });
});
