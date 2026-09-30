// 고정 블록 — 구간마다 코드가 **글자 그대로** 붙인다(스펙 결정 8).
import { describe, it, expect } from "vitest";
import { buildBible, segmentCharacters } from "../lib/longform/bible.js";
import { fakeLongformResponse, validateLongformScenario } from "../lib/longform/scenario.js";
import { AD_STYLE_LINES } from "../lib/ad/options.js";

const scn = validateLongformScenario(fakeLongformResponse(), 0).scenario;

describe("고정 블록", () => {
  it("★★★ 같은 입력이면 한 글자도 안 다르다 — 이것이 잠금의 전제다", () => {
    expect(buildBible(scn, { style: "photo" })).toBe(buildBible(structuredClone(scn), { style: "photo" }));
  });

  it("화풍은 영상용 문구 표에서 읽는다", () => {
    expect(buildBible(scn, { style: "photo" })).toContain(AD_STYLE_LINES.photo);
  });

  it("무대·의상·색감을 싣는다", () => {
    const b = buildBible(scn, { style: "photo" });
    expect(b).toContain("Setting: a small neighborhood bakery at dawn.");
    expect(b).toContain("Wardrobe: flour-dusted aprons.");
    expect(b).toContain("Color treatment: warm natural color.");
  });

  it("★ 빈 칸은 줄째로 빠진다 — 'Subject: .' 같은 빈 줄을 안 남긴다", () => {
    expect(buildBible(scn, { style: "photo" })).not.toMatch(/Subject:/);
  });

  it("★★ 인물마다 생김새와 목소리를 한 줄에 싣는다 — 대사와 묶을 key 가 앞에 온다", () => {
    const b = buildBible(scn, { style: "photo" });
    expect(b).toContain("- A: Korean woman in her 30s, the baker — short black hair, round glasses — voice: warm, low, unhurried.");
    expect(b.indexOf("- A:")).toBeLessThan(b.indexOf("- B:"));
  });
});

describe("구간 출연자", () => {
  it("보이거나 말하는 사람을 인물 목록 순서로 돌려준다", () => {
    expect(segmentCharacters(scn, 1)).toEqual(["A", "B"]);
  });

  it("말하기만 해도 출연자다", () => {
    const s = structuredClone(scn);
    s.shots[0].on_screen = [];
    expect(segmentCharacters(s, 1)).toContain("A");
  });

  it("★ 화면 밖 목소리는 출연자가 아니다", () => {
    const s = structuredClone(scn);
    s.shots = [{ segment: 1, on_screen: [], speaker_id: "narration", line: "옛날 옛적에" }];
    expect(segmentCharacters(s, 1)).toEqual([]);
  });

  it("다른 구간의 사람은 안 든다", () => {
    const s = structuredClone(scn);
    s.shots = [{ segment: 1, on_screen: ["A"] }, { segment: 2, on_screen: ["B"] }];
    expect(segmentCharacters(s, 1)).toEqual(["A"]);
  });
});
