// 구간 지문 — 본문 → 고정 블록 → 출연 → 참조 → 대사(스펙 규칙 ④: 뒤에 올수록 강하게 받는다).
import { describe, it, expect } from "vitest";
import { buildSegmentPrompt, segmentShots, segmentSeconds } from "../lib/longform/segment-prompt.js";
import { buildBible } from "../lib/longform/bible.js";
import { fakeLongformResponse, validateLongformScenario } from "../lib/longform/scenario.js";

const scn = validateLongformScenario(fakeLongformResponse(), 0).scenario;
const bible = buildBible(scn, { style: "photo" });
const refs = [{ kind: "sheet" }, { kind: "photo", roleEn: "is the subject — keep it unchanged" }, { kind: "anchor", keys: ["A", "B"] }, { kind: "last" }];

describe("구간 가르기", () => {
  it("그 구간의 샷만", () => expect(segmentShots(scn, 2)).toHaveLength(3));
  it("초를 더한다", () => {
    expect(segmentSeconds(scn, 1)).toBe(14);
    expect(segmentSeconds(scn, 2)).toBe(15);
  });
});

describe("★★★ 판 머리말 — 단계별이 실측으로 검증한 문장을 **맨 앞에** 그대로 쓴다", () => {
  // 실제 구간 1(romance-busstop, 2026-09-30)의 0~4초가 **2×2 판을 그대로 움직인 분할 화면**이었다.
  // 판 설명을 지문 중간에 한 줄만 넣고, 격자 배치·읽는 순서를 안 알렸다. 단계별(lib/reel/oneshot.js)
  // 주석: "이 문장이 없으면 모델이 격자를 그대로 움직일 위험이 크다".
  const grid = { rows: 1, cols: 3 };
  const withSheet = buildSegmentPrompt({ scenario: scn, seg: 2, bible, refs, grid });

  it("지문이 판 머리말로 **시작한다** — 격자 배치와 읽는 순서를 알린다", () => {
    expect(withSheet.startsWith("The attached reference image is a 3-panel storyboard laid out as a 1-row by 3-column grid")).toBe(true);
  });

  it("분할 화면 금지 문장이 든다", () => {
    expect(withSheet).toMatch(/Do NOT show the grid, panel borders, or any split screen/);
  });

  it("판이 없으면 머리말도 없다 — 없는 판을 설명하면 모델이 없는 것을 찾는다", () => {
    const noSheet = buildSegmentPrompt({ scenario: scn, seg: 2, bible, refs: [{ kind: "anchor", keys: ["A"] }], grid });
    expect(noSheet).not.toMatch(/storyboard laid out/);
  });
});

describe("구간 지문", () => {
  const p = buildSegmentPrompt({ scenario: scn, seg: 2, bible, refs });

  it("★★★ 순서가 본문 → 고정 블록 → 출연 → 참조 → 대사다", () => {
    const at = (s) => p.indexOf(s);
    expect(at("Shot 1")).toBeLessThan(at("Fixed setting"));
    expect(at("Fixed setting")).toBeLessThan(at("In this part only"));
    expect(at("In this part only")).toBeLessThan(at("Image 1"));
    expect(at("Image 1")).toBeLessThan(at("says"));
  });

  it("★★ 고정 블록을 글자 그대로 싣는다", () => expect(p).toContain(bible));

  it("그 구간 샷만 본문에 든다", () => {
    expect(p).toContain("A hands B an apron");
    expect(p).not.toContain("pulls a tray of bread");
  });

  it("★ 출연자 밖의 사람을 막는다", () => {
    expect(p).toContain("In this part only A, B appear — no other people, including in the background.");
  });

  it("★★ H3 의 참조 이름(Image n)으로 역할을 말한다", () => {
    expect(p).toMatch(/Image 1 is the storyboard for this part/);
    expect(p).toMatch(/Image 2 is the subject/);
    expect(p).toMatch(/Image 3 is a still from the previous part showing A, B/);
    expect(p).toMatch(/Image 4 is the last frame of the previous part/);
  });

  it("★★★ 대사마다 그 인물의 목소리 묘사를 붙인다 — 목소리의 유일한 글 채널이다", () => {
    expect(p).toContain('A (warm, low, unhurried) says, with natural lip sync, in Korean: "괜찮아, 반죽부터 하자."');
  });

  it("대사 없는 샷은 말하게 하지 않는다", () => {
    expect(p.match(/ says/g)).toHaveLength(1);
  });

  it("사람이 없는 구간은 사람이 없다고 말한다", () => {
    const s = structuredClone(scn);
    for (const sh of s.shots) { sh.on_screen = []; sh.speaker_id = ""; sh.line = ""; }
    expect(buildSegmentPrompt({ scenario: s, seg: 1, bible, refs: [] })).toContain("No people appear in this part.");
  });

  it("★★ 내레이션 줄에도 내레이터 목소리 묘사를 붙인다 — 목소리의 유일한 글 채널이다", () => {
    const s = structuredClone(scn);
    s.voice = "calm, low narrator";
    s.shots[0].speaker_id = "narration";
    const q = buildSegmentPrompt({ scenario: s, seg: 1, bible, refs: [] });
    expect(q).toContain('A narrator (calm, low narrator) says off-screen, in Korean: "오늘도 잘 구워졌네."');
  });

  it("화면 밖 목소리는 입을 안 움직이게 말한다", () => {
    const s = structuredClone(scn);
    s.shots[0].speaker_id = "narration";
    const q = buildSegmentPrompt({ scenario: s, seg: 1, bible, refs: [] });
    expect(q).toContain('A narrator says off-screen, in Korean: "오늘도 잘 구워졌네."');
  });
});
