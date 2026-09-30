// 인물 참조 — 판을 그릴 때와 H3 에 **인물 얼굴 이미지를 계속 싣는다**(사장님 2026-09-30:
// "보드를 생성할 때 인물 레퍼런스가 계속 전달이 되어야 할 것 같아. 그래야 일관성이 유지될 것 같은데").
// 그전에는 판이 글 묘사만 보고 그려서 구간 2·3 판의 남자가 구간 1 보다 어려졌다(영상에서는 닻이
// 되돌렸지만 판부터 어긋났다). 인물 이미지는 구간 1 영상에서 잘라 run.json 에 적어 두고 모든 구간이 쓴다.
import { describe, it, expect } from "vitest";
import { parseCastAt, sheetCastLines } from "../lib/longform/cast.js";
import { castFrameArgs } from "../lib/longform/ffmpeg.js";
import { segmentRefs } from "../lib/longform/refs.js";
import { h3Body } from "../lib/longform/h3.js";
import { buildSegmentPrompt } from "../lib/longform/segment-prompt.js";
import { buildBible } from "../lib/longform/bible.js";
import { fakeLongformResponse, validateLongformScenario } from "../lib/longform/scenario.js";

const scn = validateLongformScenario(fakeLongformResponse(), 0).scenario;

describe("--cast-at 해석", () => {
  it("인물마다 구간@초, 잘라낼 칸(x,y,w,h)은 골라서", () => {
    const out = parseCastAt("A=1@8.5;B=1@4.5:300,230,468,760", { keys: ["A", "B"], segments: 2 });
    expect(out).toEqual({
      ok: true,
      cast: [
        { key: "A", seg: 1, at: 8.5, crop: null },
        { key: "B", seg: 1, at: 4.5, crop: { x: 300, y: 230, w: 468, h: 760 } },
      ],
    });
  });

  it("값이 없으면 인물 참조 없이 간다", () => {
    expect(parseCastAt(undefined, { keys: ["A"], segments: 2 })).toEqual({ ok: true, cast: [] });
  });

  it("모르는 인물 · 없는 구간 · 이상한 칸은 막는다", () => {
    expect(parseCastAt("Z=1@2", { keys: ["A"], segments: 2 }).reason).toMatch(/"Z"/);
    expect(parseCastAt("A=3@2", { keys: ["A"], segments: 2 }).reason).toMatch(/구간 3/);
    expect(parseCastAt("A=1@x", { keys: ["A"], segments: 2 }).ok).toBe(false);
    expect(parseCastAt("A=1@2:1,2,3", { keys: ["A"], segments: 2 }).ok).toBe(false);
  });
});

describe("인물 이미지 자르기(ffmpeg 인자)", () => {
  it("그 초의 한 장, 칸이 있으면 잘라낸다", () => {
    const args = castFrameArgs({ input: "seg1.mp4", at: 4.5, crop: { x: 300, y: 230, w: 468, h: 760 }, out: "cast-B.jpg" });
    expect(args).toEqual(expect.arrayContaining(["-ss", "4.5", "-i", "seg1.mp4", "-vf", "crop=468:760:300:230", "cast-B.jpg"]));
  });

  it("칸이 없으면 통째로", () => {
    expect(castFrameArgs({ input: "seg1.mp4", at: 8.5, crop: null, out: "cast-A.jpg" })).not.toContain("-vf");
  });
});

describe("판 지문 — 인물 참조", () => {
  const lines = sheetCastLines([{ key: "A" }, { key: "B" }], { characters: scn.characters, startAt: 1 });

  it("첨부 번호마다 누구인지, 그 얼굴로 **모든 칸**에서 그리라고 말한다", () => {
    expect(lines).toMatch(/Attached reference image 1 shows A/);
    expect(lines).toMatch(/Attached reference image 2 shows B/);
    expect(lines).toMatch(/exactly this face, hairstyle and build in every panel where A appears/);
  });

  it("참조의 배경·자세·옷을 베끼지 말라고 한다 — 장면은 칸 설명이 정한다", () => {
    expect(lines).toMatch(/do not copy the background, pose or clothing/i);
  });

  it("★ 인물 설명(who)은 안 싣는다 — 구간 1 장면(버스 정류장)이 섞여 몽타주 판을 헷갈리게 한다", () => {
    expect(lines).not.toContain(scn.characters[0].who);
  });

  it("번호는 앞에 실린 첨부 뒤부터 센다", () => {
    expect(sheetCastLines([{ key: "A" }], { characters: scn.characters, startAt: 3 })).toMatch(/Attached reference image 3 shows A/);
  });

  it("인물 참조가 없으면 빈 문자열", () => expect(sheetCastLines([], { characters: scn.characters })).toBe(""));
});

describe("H3 참조 — 인물 이미지", () => {
  const cast = [{ key: "A", bytes: Buffer.from("a") }, { key: "B", bytes: Buffer.from("b") }];

  it("순서는 판 → 사진 → 인물 → 닻 → 직전", () => {
    const { refs } = segmentRefs({ sheet: { url: "s" }, cast, anchor: { key: "a" }, last: { key: "l" } });
    expect(refs.map((r) => r.kind)).toEqual(["sheet", "cast", "cast", "anchor", "last"]);
  });

  it("★ H3 몸통에는 jpeg data URI 로 실린다 — 인물 기호가 파일 이름 자리에 새지 않는다", () => {
    const { refs } = segmentRefs({ sheet: { url: "s" }, cast });
    const body = h3Body({ prompt: "p", seconds: 15, aspect: "9:16", resolution: "768P", refs });
    expect(body.reference_image_urls[1]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("지문이 Image n 이 누구인지 말한다", () => {
    const { refs } = segmentRefs({ sheet: { url: "s" }, cast });
    const p = buildSegmentPrompt({ scenario: scn, seg: 1, bible: buildBible(scn, { style: "photo" }), refs });
    expect(p).toMatch(/Image 2 shows A — keep A's face, hair and build exactly like this/);
    expect(p).toMatch(/Image 3 shows B/);
  });
});
