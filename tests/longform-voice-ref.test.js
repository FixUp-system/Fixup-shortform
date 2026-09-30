// 목소리 참조 — 구간 1 에서 H3 가 낸 인물별 목소리를 잘라 구간 2 의 reference_audio_urls 로 싣는다.
// 사장님 결정(2026-09-30): TTS·립싱크 길은 접고 **H3 가 직접 말한다**. 남는 걱정은 구간마다 목소리가
// 바뀌는 것이라, "달라지면 다음에"가 아니라 **처음부터 넣는다**("안전하게 그냥 넣는게 나을것 같아").
// fal 문서(minimax/h3/reference-to-video): 한 개 2~15초 · 합쳐서 15초 이하 · 지문에서 "Audio n" ·
// 이미지·영상·오디오 합쳐 12개 이하.
import { describe, it, expect } from "vitest";
import { parseVoiceAt, H3_AUDIO_MIN_S, H3_AUDIO_MAX_TOTAL_S } from "../lib/longform/voice-ref.js";
import { voiceClipArgs } from "../lib/longform/ffmpeg.js";
import { segmentRefs, H3_MAX_FILES } from "../lib/longform/refs.js";
import { h3Body } from "../lib/longform/h3.js";
import { buildSegmentPrompt } from "../lib/longform/segment-prompt.js";
import { buildBible } from "../lib/longform/bible.js";
import { fakeLongformResponse, validateLongformScenario } from "../lib/longform/scenario.js";

describe("--voice-at 해석", () => {
  it("인물마다 구간 여럿을 받는다", () => {
    const out = parseVoiceAt("A=1.18-2.52+9.68-10.96;B=6.8-8.22+12.42-14.84", { keys: ["A", "B"] });
    expect(out.ok).toBe(true);
    expect(out.voices).toEqual([
      { key: "A", ranges: [[1.18, 2.52], [9.68, 10.96]], seconds: 2.62 },
      { key: "B", ranges: [[6.8, 8.22], [12.42, 14.84]], seconds: 3.84 },
    ]);
  });

  it("값이 없으면 목소리 참조 없이 간다(오류가 아니다)", () => {
    expect(parseVoiceAt(undefined, { keys: ["A"] })).toEqual({ ok: true, voices: [] });
  });

  it("★★ 한 인물이 2초보다 짧으면 막는다 — H3 가 받지 않는다", () => {
    const out = parseVoiceAt("A=1.48-2.22", { keys: ["A"] });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/A 목소리가 0.74초/);
    expect(H3_AUDIO_MIN_S).toBe(2);
  });

  it("★★ 모두 합쳐 15초를 넘으면 막는다", () => {
    const out = parseVoiceAt("A=0-8;B=8-16", { keys: ["A", "B"] });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/16초/);
    expect(H3_AUDIO_MAX_TOTAL_S).toBe(15);
  });

  it("모르는 인물이면 막는다", () => {
    expect(parseVoiceAt("Z=0-3", { keys: ["A", "B"] }).reason).toMatch(/"Z"/);
  });

  it("끝이 시작보다 앞이거나 숫자가 아니면 막는다", () => {
    expect(parseVoiceAt("A=3-1", { keys: ["A"] }).ok).toBe(false);
    expect(parseVoiceAt("A=x-3", { keys: ["A"] }).ok).toBe(false);
    expect(parseVoiceAt("A", { keys: ["A"] }).ok).toBe(false);
  });
});

describe("목소리 자르기(ffmpeg 인자)", () => {
  const args = voiceClipArgs({ input: "seg1.mp4", ranges: [[1.18, 2.52], [9.68, 10.96]], out: "voice-A.mp3" });
  it("구간마다 잘라 한 줄로 잇고, 소리만 낸다", () => {
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toMatch(/atrim=start=1.18:end=2.52/);
    expect(fc).toMatch(/atrim=start=9.68:end=10.96/);
    expect(fc).toMatch(/concat=n=2:v=0:a=1/);
    expect(args).toContain("-vn");
    expect(args.at(-1)).toBe("voice-A.mp3");
  });
});

describe("참조 목록 — 목소리", () => {
  const voices = [{ key: "A", bytes: Buffer.from("a"), seconds: 2.6 }, { key: "B", bytes: Buffer.from("b"), seconds: 3.8 }];

  it("목소리는 이미지와 **따로** 돌려준다 — 번호가 Audio 1 부터 따로 센다", () => {
    const { refs, audios } = segmentRefs({ sheet: { url: "s" }, anchor: { key: "a" }, voices });
    expect(refs.map((r) => r.kind)).toEqual(["sheet", "anchor"]);
    expect(audios.map((a) => a.key)).toEqual(["A", "B"]);
  });

  it("목소리가 없으면 빈 목록", () => {
    expect(segmentRefs({ sheet: {} }).audios).toEqual([]);
  });

  it("★ 이미지·오디오 합쳐 12개를 넘으면 목소리를 뒤에서 버리고 이유를 말한다", () => {
    expect(H3_MAX_FILES).toBe(12);
    const photos = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, role: "product", vision: { person: false, any_face: false }, url: `u${i}` }));
    const many = ["A", "B", "C", "D", "E"].map((key) => ({ key, bytes: Buffer.from(key), seconds: 2 }));
    const { refs, audios, dropped } = segmentRefs({ sheet: {}, photos, anchor: { key: "a" }, last: { key: "l" }, voices: many });
    expect(refs.length + audios.length).toBe(12);
    expect(dropped).toContainEqual({ kind: "voice", id: "E", reason: "room" });
  });
});

describe("H3 몸통 — 목소리", () => {
  it("reference_audio_urls 에 audio data URI 로 싣는다", () => {
    const body = h3Body({ prompt: "p", seconds: 15, aspect: "9:16", resolution: "768P", refs: [], audios: [{ key: "A", bytes: Buffer.from("a") }] });
    expect(body.reference_audio_urls).toHaveLength(1);
    expect(body.reference_audio_urls[0]).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it("목소리가 없으면 칸을 안 만든다", () => {
    expect(h3Body({ prompt: "p", seconds: 15, aspect: "9:16", resolution: "768P", refs: [] }).reference_audio_urls).toBeUndefined();
  });
});

describe("지문 — 목소리", () => {
  const scn = validateLongformScenario(fakeLongformResponse(), 0).scenario;
  const bible = buildBible(scn, { style: "photo" });
  const audios = [{ key: "A" }, { key: "B" }];
  const p = buildSegmentPrompt({ scenario: scn, seg: 2, bible, refs: [{ kind: "sheet" }], audios });

  it("Audio n 이 누구 목소리인지 알린다", () => {
    expect(p).toMatch(/Audio 1 is the voice of A/);
    expect(p).toMatch(/Audio 2 is the voice of B/);
  });

  it("★ 대사 줄이 그 오디오를 가리킨다 — 글 묘사가 오디오와 싸우지 않게", () => {
    // 2026-09-30 부터 대사 줄 앞에 "Shot n — [연기 지시]" 가 붙는다(tests/longform-outfits.test.js).
    const aLine = p.split("\n").find((l) => l.includes(" A (") && l.includes("says"));
    expect(aLine).toMatch(/A \(the voice in Audio 1\) says/);
  });

  it("목소리가 없으면 예전 그대로 — 글 묘사를 쓴다", () => {
    const plain = buildSegmentPrompt({ scenario: scn, seg: 2, bible, refs: [{ kind: "sheet" }] });
    expect(plain).not.toMatch(/Audio 1/);
  });
});
