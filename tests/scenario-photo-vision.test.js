import { describe, it, expect, vi } from "vitest";
import { buildScenarioMessages, generateScenario } from "../lib/scenario.js";
import { clipProfileForProject, minSecondsFor, maxSecondsFor } from "../lib/clip-limits.js";
import { CONTENT_MAX_SECONDS } from "../lib/cuts.js";

// ★ 사진에서 읽은 값(photos[].vision)이 ②시나리오 지문까지 가는가.
//
// 2026-08-18 실측 사고: 참조 사진은 **라벤더 토끼·검은 리본**인데 클립에는 크림색 토끼·분홍
// 리본이 나왔다. 사진은 제대로 읽혔고(`vision.what` = "가방에 달린 보라색 토끼 인형")
// 그 값이 시나리오 지문에 실리지 않아, LLM 이 소재 글의 브랜드명만 보고 그 브랜드의 흔한
// 제품을 상상해 `focus.look` 을 지어냈다. 그 값이 그대로 클립 프롬프트로 나갔다.
//
// ⚠️ 이 파일이 지키는 것은 둘이다: ①읽은 값이 실린다 ②**못 읽은 프로젝트의 지문은 글자
//    그대로 예전과 같다**(지문이 흔들리면 각인이 흔들려 이미 값을 치른 산출물이 낡는다).

const BASE = {
  id: "aaaaaaaa-0000-4000-8000-00000000ffff",
  settings: { i2v_model: "seedance-2.0", target_seconds: 30, aspect_ratio: "9:16" },
  material: { text: "에스더버니 키링을 소개하는 영상", photos: [] },
};
const withPhotos = (photos) => ({ ...BASE, material: { ...BASE.material, photos } });
const PHOTO = { id: "p1", filename: "bunny.jpg", url: "/api/uploads/360cb1cb.jpg" };
const VISION = { person: false, what: "가방에 달린 보라색 토끼 인형", who: null, lettering: "Esther Bunny" };

const userOf = (project) => buildScenarioMessages(project).messages[0].content;

describe("시나리오 지문 — 사진을 못 읽었으면 예전과 글자 그대로 같다", () => {
  // 골든이다. 한 글자라도 달라지면 같은 자료에서 다른 시나리오가 나오고, 각인을 통해
  // 이미 값을 치른 산출물이 낡는다. 그러니 여기는 **일부러** 통째 비교다.
  it("★ vision 이 없는 프로젝트의 지문 전문이 예전 그대로다", () => {
    const p = withPhotos([PHOTO]);
    const profile = clipProfileForProject(p);
    const expected = `[사장님 설명]
${p.material.text}

[올린 사진]
- id:p1 bunny.jpg

[영상 길이] 30초 — 장면 초의 합이 정확히 이 값이어야 한다
[화면 비율] 9:16 (세로 — 세로 구도로 짠다)
[장면 길이] 하한 ${minSecondsFor(profile)}초 · 상한 ${CONTENT_MAX_SECONDS}초 (영상 모델 상한은 ${maxSecondsFor(profile)}초지만 그림 한 장의 상한이 더 낮다)
[담을 수 있는 장면 수] 최대 ${Math.max(1, Math.floor(30 / minSecondsFor(profile)))}개`;
    expect(userOf(p)).toBe(expected);
  });

  it("사진이 아예 없어도 같다 — (없음) 한 줄", () => {
    expect(userOf(BASE)).toContain("[올린 사진]\n(없음)\n");
    expect(userOf(BASE)).not.toContain("사진에서 본 것");
  });

  it("판정이 실패해 빈 값만 들어 있으면 예전 지문 그대로다", () => {
    const empty = { ...PHOTO, vision: { person: false, what: "", who: null, lettering: "" } };
    expect(userOf(withPhotos([empty]))).toBe(userOf(withPhotos([PHOTO])));
  });
});

describe("시나리오 지문 — 읽은 값이 실린다", () => {
  it("★ 사진에서 본 것이 지문에 그대로 실린다", () => {
    const u = userOf(withPhotos([{ ...PHOTO, vision: VISION }]));
    expect(u).toContain("가방에 달린 보라색 토끼 인형");
    expect(u).toContain("Esther Bunny");
  });

  it("★ 브랜드명보다 사진이 이긴다는 것을 못 박는다", () => {
    const u = userOf(withPhotos([{ ...PHOTO, vision: VISION }]));
    // 이번 사고의 원인이 정확히 그 반대였다 — 브랜드명이 사진을 이겼다
    expect(u).toMatch(/브랜드명[\s\S]{0,80}사진이 이긴다/);
    // look 이 어디서 나와야 하는지를 지목한다
    expect(u).toContain("look");
  });

  it("인물 사진이면 나이대·성별도 실린다", () => {
    const u = userOf(withPhotos([{ ...PHOTO, vision: { person: true, what: "매장에 선 사장님", who: "50대 남성", lettering: "" } }]));
    expect(u).toContain("50대 남성");
  });
});

describe("generateScenario — 사진은 한 번만 읽는다", () => {
  const scenario = {
    topic: "키링 소개",
    focus: { mode: "물건", subject: "a lavender bunny plush keyring", look: "lavender fur, black ribbon" },
    angle: "가방을 꾸미는 이야기",
    shots: [8, 8, 8, 6].map((seconds, i) => ({ beat: `장면 ${i + 1}`, line: "오늘도 꾸며요.", speaker: "20대 여성", seconds })),
  };

  it("★ 아직 안 읽은 사진은 읽고, 그 값이 지문에 실리고, 돌려준다", async () => {
    const call = vi.fn(async () => scenario);
    const describePhoto = vi.fn(async () => VISION);
    const readBytes = vi.fn(async () => Buffer.from("x"));
    const got = await generateScenario(withPhotos([PHOTO]), { call, describePhoto, readBytes });
    expect(describePhoto).toHaveBeenCalledTimes(1);
    expect(describePhoto.mock.calls[0][0].photoKey).toBe("360cb1cb.jpg");
    expect(call.mock.calls[0][0].messages[0].content).toContain("가방에 달린 보라색 토끼 인형");
    // 읽은 값을 돌려줘야 부르는 쪽이 문서에 남긴다 — 안 남기면 다음 회차에 또 값을 치른다
    expect(got.photos[0].vision).toEqual(VISION);
  });

  it("★ 이미 읽어 둔 사진은 다시 읽지 않는다 — 사진당 값이 든다", async () => {
    const call = vi.fn(async () => scenario);
    const describePhoto = vi.fn(async () => VISION);
    const readBytes = vi.fn(async () => Buffer.from("x"));
    await generateScenario(withPhotos([{ ...PHOTO, vision: VISION }]), { call, describePhoto, readBytes });
    expect(describePhoto).not.toHaveBeenCalled();
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("판정이 실패하면 저장하지도 싣지도 않는다", async () => {
    const call = vi.fn(async () => scenario);
    const describePhoto = vi.fn(async () => ({ person: false, what: "", who: null, lettering: "" }));
    const got = await generateScenario(withPhotos([PHOTO]), { call, describePhoto, readBytes: async () => Buffer.from("x") });
    expect(got.photos).toBeUndefined();
    expect(call.mock.calls[0][0].messages[0].content).not.toContain("사진에서 본 것");
  });

  it("바이트를 못 얻으면 판정하지 않는다 — 못 보고 내리는 판정에 값을 치르지 않는다", async () => {
    const describePhoto = vi.fn(async () => VISION);
    await generateScenario(withPhotos([PHOTO]), { call: async () => scenario, describePhoto, readBytes: async () => null });
    expect(describePhoto).not.toHaveBeenCalled();
  });
});
