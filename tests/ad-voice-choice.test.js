// 나레이션 목소리를 **사장님이 고른다** — 그리고 코드가 그것을 지킨다.
//
// ★★ 왜 생겼나(2026-08-24): 지문이 목소리를 정하게 두었더니 최근 6건 중 **5건이
//   "20대 후반 한국 여성"** 이었다. 지문의 ✓ 예시를 모델이 글자 그대로 베낀 것이다 —
//   이 저장소가 옷차림에서 이미 겪은 사고와 같다(4cf7af0).
//
// ★★ 그리고 **모델은 목소리를 바꿀 수 있다**는 것이 실측으로 확인됐다
//   (scripts/measure/probe-voice.mjs): 같은 장면·같은 대사에 정반대를 시키니
//   F0 가 78.8Hz vs 307.7Hz — **3.9배** 갈렸다. 못 하는 게 아니라 안 시킨 것이었다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AD_VOICES, DEFAULT_AD_OPTIONS, normalizeAdOptions } from "../lib/ad/options.js";
import { buildScenarioMessages, generateScenario } from "../lib/ad/scenario.js";
import { withSpokenLines } from "../lib/ad/generate.js";

const settings = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0", resolution: "720p",
};
const material = { text: "소재", photos: [] };
const userMsg = (voice_style) =>
  buildScenarioMessages({ kind: "ad", settings: { ...settings, voice_style }, material }).messages[0].content;

// LLM 을 갈아 끼운다 — **늘 "20대 여성"이라고 답하는** 모델을 흉내 낸다(실측에서 본 모양).
const alwaysWoman = async () => ({
  text: "t", shots: [{ beat: "b", seconds: 15 }], voice: "a woman in her late twenties",
});
const run = (voice_style) =>
  generateScenario({
    project: { id: "x", kind: "ad", settings: { ...settings, voice_style }, material },
    deps: { callJson: alwaysWoman },
  });

describe("목소리 축", () => {
  it("자동이 기본이다 — 안 고르면 예전처럼 시나리오가 정한다", () => {
    expect(DEFAULT_AD_OPTIONS.voice_style).toBe("auto");
    expect(AD_VOICES[0].id).toBe("auto");
    expect(AD_VOICES[0].line).toBe("");
  });

  it("자동 말고는 전부 영어 한 줄을 든다 — 이 값이 fal 프롬프트에 그대로 실린다", () => {
    for (const v of AD_VOICES.filter((x) => x.id !== "auto")) {
      expect(v.line, `${v.id} 의 line 이 비었다`).toBeTruthy();
      expect(v.line, `${v.id} 의 line 에 한글이 섞였다`).not.toMatch(/[가-힣]/);
    }
  });

  it("성별·나이대가 다 갈린다 — 목록이 한쪽으로 쏠려 있지 않다", () => {
    const ids = AD_VOICES.map((v) => v.id);
    expect(ids.filter((i) => i.startsWith("f")).length).toBeGreaterThanOrEqual(3);
    expect(ids.filter((i) => i.startsWith("m")).length).toBeGreaterThanOrEqual(3);
  });

  // ★ 다른 축과 같은 방식으로 실패시킨다 — 조용히 기본값으로 안 떨어뜨린다.
  it("모르는 값은 던진다", () => {
    expect(() => normalizeAdOptions({ voice_style: "오타" })).toThrow(/voice_style/);
    expect(normalizeAdOptions({ voice_style: "m50" }).voice_style).toBe("m50");
    // 값이 아예 없는 옛 문서는 자동으로 떨어진다 — 그때는 없는 것이 정상이다.
    expect(normalizeAdOptions({}).voice_style).toBe("auto");
  });
});

describe("고른 목소리가 지문에 실린다", () => {
  it("고르면 그 줄이 붙는다", () => {
    const u = userMsg("m50");
    expect(u).toContain("나레이션 목소리(사장님이 고름)");
    expect(u).toContain("a man in his fifties");
  });

  // ★ 안 고르면 줄이 통째로 없다 — 옛 문서의 지문이 글자 그대로다(각인 보호).
  it("자동이면 그 줄이 통째로 없다", () => {
    expect(userMsg("auto")).not.toContain("나레이션 목소리(사장님이 고름)");
    expect(userMsg(undefined)).not.toContain("나레이션 목소리(사장님이 고름)");
  });
});

describe("★ 지문에 싣는 것만으로 끝내지 않는다 — 코드가 덮어쓴다", () => {
  // ★★ 이것이 이 파일의 핵심이다. 지문이 목소리를 정하라고 시켜도 모델은 늘 같은 사람을
  //   냈다(6건 중 5건). "지켜져야 하는 것은 프롬프트가 아니라 코드가 판정한다."
  it("모델이 딴소리를 해도 사장님이 고른 값이 이긴다", async () => {
    const out = await run("m50");
    expect(out.voice).toContain("a man in his fifties");
    expect(out.voice).not.toContain("woman");
  });

  it("자동이면 안 덮는다 — 그때는 시나리오가 정하는 것이 맞다", async () => {
    expect((await run("auto")).voice).toBe("a woman in her late twenties");
    expect((await run(undefined)).voice).toBe("a woman in her late twenties");
  });

  it("고른 값이 실제로 fal 프롬프트까지 간다", async () => {
    const out = await run("f50");
    const prompt = withSpokenLines(out.text, out.shots, out.voice, out);
    expect(prompt).toContain("Voice: a woman in her fifties");
  });
});

describe("지문이 목소리 예시를 더는 안 준다 — 베낄 문장을 안 만든다", () => {
  const src = readFileSync("lib/ad/scenario.js", "utf8");

  // ★ 실제로 베껴진 그 문장이다. 다시 넣으면 같은 사고가 난다.
  it("'woman in her late twenties' 예시가 지문에 없다", () => {
    expect(src).not.toContain("woman in her late twenties");
  });

  // ★ 예시를 걷는 대신 **적을 것을 목록으로** 준다 — 베낄 문장이 아니라 뼈대를 준다
  //   (cast 칸에서 쓴 것과 같은 처방이다).
  it("대신 적을 요소를 알려 준다", () => {
    expect(src).toContain("성별 · 나이대 · 음색 · 속도 · 거리감");
  });

  it("습관적으로 한쪽을 고르지 말라고 말한다", () => {
    expect(src).toContain("습관처럼 20대 여성을 고르지 마라");
  });
});

describe("화면과 서버가 같은 목록을 본다", () => {
  const tray = readFileSync("components/AdOptionTray.jsx", "utf8");
  const newPage = readFileSync("app/ads/new/page.js", "utf8");
  const detail = readFileSync("app/ads/[id]/page.js", "utf8");

  it("트레이가 표에서 칩을 그린다 — 라벨을 손으로 안 적는다", () => {
    expect(tray).toContain("AD_VOICES");
    expect(tray).toContain("목소리");
    // ★ 주석은 걷고 잰다 — 이 화면에는 "자동이 기본이다" 같은 **설명**이 주석으로 있다.
    //   원문을 통째로 훑으면 그 설명이 걸려, 코드가 멀쩡한데도 실패하는 시험이 된다
    //   (2026-08-21 에 같은 함정을 한 번 밟았다).
    const code = tray.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^\s*\/\/.*$/gm, " ");
    for (const v of AD_VOICES) expect(code, `${v.label} 을 화면에 박았다`).not.toContain(`"${v.label}"`);
  });

  it("두 화면 다 값을 나르고 저장한다", () => {
    expect(newPage).toContain("voiceStyle");
    expect(newPage).toContain("voice_style: voiceStyle");
    expect(detail).toContain("voiceStyle: st.voice_style");
    expect(detail).toContain("voice_style: draftOpts.voiceStyle");
  });

  // ★ 안 바뀐 것을 PATCH 로 보내면 라우트가 등급을 다시 잰다 — 목소리도 그 판정에 들어가야 한다.
  it("입력 수정 화면이 목소리 변경도 '바뀜'으로 센다", () => {
    expect(detail).toContain("draftOpts.voiceStyle !== project.settings.voice_style");
  });
});
