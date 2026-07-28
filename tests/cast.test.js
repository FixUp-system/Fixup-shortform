import { describe, it, expect } from "vitest";
import { buildCastMessages } from "../lib/cast.js";
import { AVATARS } from "../lib/refs.js";

const project = {
  briefing: { topic: "성수동 자전거 수리점 소개" },
  script: { text: "작년에 초등학생이 형에게 물려받은 자전거를 끌고 왔습니다. 그냥 교체해줬습니다." },
};

describe("buildCastMessages", () => {
  it("원고 전문과 아바타 목록을 넘긴다", () => {
    const { system, messages } = buildCastMessages(project, AVATARS);
    const user = messages[0].content;
    expect(user).toContain("초등학생이 형에게 물려받은");
    expect(user).toContain(AVATARS[0].id);
    expect(user).toContain(AVATARS[0].traits);
    expect(system).toContain("JSON");
  });

  it("아바타가 없으면 (없음) 이라고 적는다 — 없는 것을 고르라고 하면 안 된다", () => {
    const { messages } = buildCastMessages(project, []);
    expect(messages[0].content).toContain("(없음)");
  });

  it("이름 없이 불리는 사람도 화면에 보이면 넣으라고 지시한다 — 손님이 빠지던 결함", () => {
    const { system } = buildCastMessages(project, AVATARS);
    expect(system).toContain("손님·아이·직원처럼 이름 없이 일반명사로 불려도");
    expect(system).toContain("✗ \"미용사가 아이 머리를 자릅니다\" 인데 cast 에 미용사만 두는 것");
    expect(system).toContain("전화 통화 상대"); // 화면에 안 나오는 사람을 빼는 원래 의도는 남아 있다
  });

  it("주제를 안 밝힌 프로젝트도 견딘다", () => {
    const { messages } = buildCastMessages({ script: { text: "한 문장." } }, AVATARS);
    expect(messages[0].content).toContain("한 문장.");
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
