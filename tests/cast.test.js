import { describe, it, expect } from "vitest";
import { buildCastMessages } from "../lib/cast.js";
import { AVATARS } from "../lib/refs.js";

describe("buildCastMessages", () => {
  const cuts = [
    { idx: 0, sentence: "손님이 코트를 들고 오셨습니다.", shows: "손님이 코트를 들고 문을 들어서는 미디엄 샷" },
    { idx: 1, sentence: "안감을 통째로 갈았습니다.", shows: "주인이 작업대에서 옷을 수선하는 클로즈업" },
    { idx: 2, sentence: "치수는 입은 채로 잽니다.", shows: "주인이 손님에게 옷을 입히고 치수를 재는 미디엄 샷" },
  ];

  it("컷별 화면을 번호와 함께 넘긴다 — 인물은 여기 이미 쓰여 있다", () => {
    const user = buildCastMessages(cuts, AVATARS).messages[0].content;
    expect(user).toContain("1. 손님이 코트를 들고 문을 들어서는 미디엄 샷");
    expect(user).toContain("3. 주인이 손님에게 옷을 입히고 치수를 재는 미디엄 샷");
  });

  it("화면이 없는 컷은 문장으로 대신한다 — 화면 설계가 실패해도 캐스팅은 돈다", () => {
    const user = buildCastMessages([{ idx: 0, sentence: "문장뿐인 컷." }], AVATARS).messages[0].content;
    expect(user).toContain("1. 문장뿐인 컷.");
  });

  it("아바타 목록을 id 와 설명으로 넘긴다", () => {
    const user = buildCastMessages(cuts, AVATARS).messages[0].content;
    expect(user).toContain(AVATARS[0].id);
    expect(user).toContain(AVATARS[0].traits);
  });

  it("아바타가 없으면 (없음) — 없는 것을 고르라고 하면 안 된다", () => {
    expect(buildCastMessages(cuts, []).messages[0].content).toContain("(없음)");
  });

  it("어느 컷에 나오는지 함께 답하라고 지시한다 — 같은 사람을 컷에 꽂는 것은 코드가 한다", () => {
    const { system } = buildCastMessages(cuts, AVATARS);
    expect(system).toContain("cuts");
    expect(system).toContain("컷 번호");
  });

  it("화면에 보이는 사람만 세라고 지시한다", () => {
    expect(buildCastMessages(cuts, AVATARS).system).toContain("화면에 보이는 사람");
  });
});

import { resolveCastRefs, resolveCutRefs } from "../lib/cast.js";

const CAST = [
  { id: "c1", who: "50대 남성 가게 주인", avatar_id: "av-owner" },
  { id: "c2", who: "10세 전후 남자아이", avatar_id: "av-child" },
];
const AV_IDS = ["av-owner", "av-child", "av-adult"];

describe("resolveCastRefs — 사진이 먼저다", () => {
  it("사진이 없으면 아바타를 쓴다", () => {
    const got = resolveCastRefs(CAST, [], AV_IDS);
    expect(got[0].ref).toEqual({ from: "avatar", id: "av-owner" });
    expect(got[1].ref).toEqual({ from: "avatar", id: "av-child" });
  });

  it("인물 사진이 있으면 그 인물은 사진을 쓴다 — 사장님 얼굴이 아바타로 바뀌면 안 된다", () => {
    const photos = [{ id: "p2", vision: { person: true, who: "50대 남성" } }];
    const got = resolveCastRefs(CAST, photos, AV_IDS);
    expect(got[0].ref).toEqual({ from: "photo", id: "p2" });
    expect(got[1].ref).toEqual({ from: "avatar", id: "av-child" }); // 아이는 사진이 없다
  });

  it("사물 사진은 인물에 붙지 않는다", () => {
    const photos = [{ id: "p1", vision: { person: false, what: "가게 내부" } }];
    const got = resolveCastRefs(CAST, photos, AV_IDS);
    expect(got[0].ref).toEqual({ from: "avatar", id: "av-owner" });
  });

  it("판정되지 않은 사진도 인물에 붙지 않는다 — 모르는 것을 얼굴로 쓰지 않는다", () => {
    const got = resolveCastRefs(CAST, [{ id: "p9" }], AV_IDS);
    expect(got[0].ref).toEqual({ from: "avatar", id: "av-owner" });
  });

  it("사진 한 장이 인물 둘에 겹쳐 붙지 않는다", () => {
    const photos = [{ id: "p2", vision: { person: true, who: "사람" } }];
    const got = resolveCastRefs(CAST, photos, AV_IDS);
    const used = got.filter((c) => c.ref?.from === "photo").map((c) => c.ref.id);
    expect(used).toEqual(["p2"]);
  });

  it("파일이 없는 아바타는 배정하지 않는다 — 레퍼런스 없이 간다", () => {
    const got = resolveCastRefs(CAST, [], ["av-child"]);
    expect(got[0].ref).toBeUndefined();
    expect(got[1].ref).toEqual({ from: "avatar", id: "av-child" });
  });

  it("캐스팅이 비면 빈 배열", () => {
    expect(resolveCastRefs([], [], AV_IDS)).toEqual([]);
    expect(resolveCastRefs(null, null, AV_IDS)).toEqual([]);
  });
});

describe("resolveCutRefs — 컷이 실제로 쓸 레퍼런스", () => {
  const project = {
    cast: [
      { id: "c1", who: "주인", ref: { from: "photo", id: "p2" } },
      { id: "c2", who: "아이", ref: { from: "avatar", id: "av-child" } },
      { id: "c3", who: "손님" }, // 레퍼런스 없음
    ],
    material: { photos: [{ id: "p1" }, { id: "p2" }] },
  };

  it("인물과 사물을 함께 붙인다", () => {
    expect(resolveCutRefs({ ref_ids: ["c2", "p1"] }, project)).toEqual([
      { from: "photo", id: "p1", kind: "thing" },
      { from: "avatar", id: "av-child", kind: "person" },
    ]);
  });

  it("업로드 사진이 먼저다 — 2장 상한에 걸릴 때 잘려나가면 안 된다", () => {
    const got = resolveCutRefs({ ref_ids: ["c2", "c1", "p1"] }, project);
    expect(got).toHaveLength(2);
    expect(got[0].from).toBe("photo");
  });

  it("레퍼런스가 없는 인물은 건너뛴다", () => {
    expect(resolveCutRefs({ ref_ids: ["c3"] }, project)).toEqual([]);
  });

  it("모르는 id 는 무시한다", () => {
    expect(resolveCutRefs({ ref_ids: ["없음", "p9"] }, project)).toEqual([]);
  });

  it("옛 프로젝트의 ref_photo_id 도 읽는다", () => {
    expect(resolveCutRefs({ ref_photo_id: "p2" }, project)).toEqual([
      { from: "photo", id: "p2", kind: "thing" },
    ]);
  });

  it("ref 가 아무것도 없으면 빈 배열", () => {
    expect(resolveCutRefs({}, project)).toEqual([]);
    expect(resolveCutRefs({}, {})).toEqual([]);
  });
});

import { mergeCastIntoCuts } from "../lib/cast.js";

describe("mergeCastIntoCuts — 인물을 컷에 꽂는다", () => {
  const cuts = [
    { idx: 0, ref_ids: ["p1"] },
    { idx: 1 },
    { idx: 2, ref_ids: ["p2"] },
  ];
  const cast = [
    { id: "c1", who: "주인", cuts: [1, 2] },
    { id: "c2", who: "손님", cuts: [0, 2] },
  ];

  it("인물이 적힌 컷에만 그 id 를 더한다", () => {
    const got = mergeCastIntoCuts(cuts, cast);
    expect(got[0].ref_ids).toEqual(["p1", "c2"]);
    expect(got[1].ref_ids).toEqual(["c1"]);
    expect(got[2].ref_ids).toEqual(["p2", "c1", "c2"]);
  });

  it("사진 id 를 지우지 않는다 — 사장님이 올린 것이 먼저다", () => {
    expect(mergeCastIntoCuts(cuts, cast)[0].ref_ids[0]).toBe("p1");
  });

  it("원본을 바꾸지 않는다", () => {
    mergeCastIntoCuts(cuts, cast);
    expect(cuts[1].ref_ids).toBeUndefined();
  });

  it("캐스팅이 비면 컷이 그대로다", () => {
    expect(mergeCastIntoCuts(cuts, [])).toEqual(cuts);
    expect(mergeCastIntoCuts(cuts, null)).toEqual(cuts);
  });

  it("같은 인물이 두 번 적혀도 한 번만 꽂는다", () => {
    const got = mergeCastIntoCuts([{ idx: 0 }], [{ id: "c1", who: "주인", cuts: [0, 0] }]);
    expect(got[0].ref_ids).toEqual(["c1"]);
  });
});

describe("resolveCutRefs — 인물 하나 + 사물 하나", () => {
  const project = {
    cast: [
      { id: "c1", who: "주인", ref: { from: "avatar", id: "av-owner" } },
      { id: "c2", who: "손님", ref: { from: "avatar", id: "av-adult" } },
    ],
    material: { photos: [{ id: "p1" }, { id: "p2" }] },
  };

  it("사진 둘이 있어도 인물 자리를 남긴다 — 안 그러면 인물 일관성이 통째로 죽는다", () => {
    const got = resolveCutRefs({ ref_ids: ["p1", "p2", "c1"] }, project);
    expect(got).toHaveLength(2);
    expect(got.filter((r) => r.kind === "person")).toHaveLength(1);
    expect(got.filter((r) => r.kind === "thing")).toHaveLength(1);
    expect(got[0].id).toBe("p1"); // 사진이 먼저다
  });

  it("인물 둘이면 첫 인물만 쓴다", () => {
    const got = resolveCutRefs({ ref_ids: ["c1", "c2"] }, project);
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe("av-owner");
  });

  it("사진만 있으면 두 장까지 쓴다", () => {
    expect(resolveCutRefs({ ref_ids: ["p1", "p2"] }, project)).toHaveLength(2);
  });

  it("같은 레퍼런스를 두 번 싣지 않는다", () => {
    const got = resolveCutRefs({ ref_ids: ["p1", "p1"] }, project);
    expect(got).toHaveLength(1);
  });
});
