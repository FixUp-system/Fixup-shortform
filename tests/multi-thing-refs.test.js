// 물건 사진이 여러 장이면 **서로 다른 물건**이다.
//
// 실측(2026-08-18, 프로젝트 b9f31ac3 — 키링 4종). 사장님이 키링 사진 넷을 올렸는데:
//   · 컷2 에서 키링2 와 키링3 이 **한 개로 합쳐졌고**, 키링4 는 **아예 빠졌다**
//   · 컷1·컷3 에서 키링3 의 고리에 달린 고무밴드가 안 그려졌다
//
// 프롬프트를 재조립하니 원인이 셋이었다.
//
// ① **네 장이 전부 같은 이름을 얻었다.**
//      "Attached reference images, in order: [1] a set of four small character keyrings,
//       [2] a set of four small character keyrings, [3] …, [4] …"
//    아침에 물건에도 번호를 붙이면서 이름으로 **프로젝트 앵커**를 썼는데, 앵커는 영상
//    한 편에 하나뿐이라 장마다 같은 말이 나온다. 같은 이름이 넷이면 모델은 "같은 것을
//    여러 각도에서 찍은 사진"으로 읽는다 — 그래서 **섞는다**.
//    게다가 그 앵커가 "네 개짜리 **세트**"라, 한 장이 세트 전체라고 말하는 셈이었다.
//
// ② **제품 결속이 [1] 한 장만 가리켰다.** `Match … to attached image [1] exactly` —
//    나머지 장은 무엇을 위한 것인지 프롬프트가 끝내 말하지 않는다.
//
// ③ **다섯째가 잘렸다.** 사진 4장 + 인물 1명인데 상한이 4라 `things.slice(0, 3)` 에서
//    키링4 가 떨어졌다(인물 자리를 남기는 규칙 자체는 옳다 — 상한 값이 낮았다).
import { describe, it, expect } from "vitest";
import { buildImagePrompt } from "../lib/cuts.js";
import { resolveCutRefs } from "../lib/cast.js";

const PROJECT = {
  settings: { aspect_ratio: "9:16" },
  scenario: { focus: { mode: "물건", subject: "a set of four small character keyrings", look: "pastel plush charms" } },
  cast: [{ id: "c1", who: "Korean woman in her 20s", look: "long dark hair", cuts: [0, 1], ref: { from: "avatar", id: "av-woman-20s" } }],
  material: { photos: [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }] },
};
const thing = (n) => ({ kind: "thing", who: null, source: "upload", photo_id: `p${n}`, key: `p${n}.png` });
const PERSON = { kind: "person", who: "Korean woman in her 20s", source: "avatar", key: "w.jpg" };

describe("물건 사진이 여럿일 때", () => {
  it("★★ 장마다 **다른** 이름을 얻는다 — 같은 이름이면 모델이 하나로 합친다", () => {
    const p = buildImagePrompt({ idx: 0, shows: "four keyrings on a table", ref_ids: ["p1","p2","p3","p4"] }, PROJECT,
      [thing(1), thing(2), thing(3), thing(4)]);
    const list = p.match(/Attached reference images, in order: ([^.]+)\./)[1];
    const names = list.split(/,\s*(?=\[)/).map((x) => x.replace(/^\[\d+\]\s*/, "").trim());
    expect(names.length, "네 장이 목록에 다 없다").toBe(4);
    expect(new Set(names).size, "장마다 이름이 같다 — 모델이 같은 물건의 다른 사진으로 읽는다")
      .toBe(4);
  });

  it("★★ 서로 다른 물건이라고 **말한다** — 번호만 달라도 합치는 것을 못 막는다", () => {
    const p = buildImagePrompt({ idx: 0, shows: "four keyrings", ref_ids: ["p1","p2","p3"] }, PROJECT,
      [thing(1), thing(2), thing(3)]);
    expect(p, "합치지 말라는 말이 없다").toMatch(/different|distinct/i);
    expect(p, "섞지 말라고 못 박지 않는다").toMatch(/do not (merge|blend|combine)/i);
  });

  it("★ 제품 결속이 **한 장만** 가리키지 않는다", () => {
    const p = buildImagePrompt({ idx: 0, shows: "four keyrings", ref_ids: ["p1","p2","p3"] }, PROJECT,
      [thing(1), thing(2), thing(3)]);
    const at = p.indexOf("Match the product");
    const clause = p.slice(at, at + 200);
    expect(clause, "물건이 셋인데 결속은 [1] 한 장만 가리킨다").not.toMatch(/attached image \[1\] exactly/);
  });

  // 물건 첨부가 한 장이면 결속은 **그 한 번호**에 건다(여럿일 때의 "각자 제 사진" 문형이
  // 아니다). 이름을 무엇으로 부르는지는 아래 두 테스트가 갈라서 잰다.
  it("★ 물건이 한 장뿐이면 결속은 그 번호 하나를 가리킨다", () => {
    const p = buildImagePrompt({ idx: 0, shows: "one keyring", ref_ids: ["p1", "c1"] }, PROJECT,
      [thing(1), PERSON]);
    expect(p, "물건 하나뿐인데 결속이 번호를 안 가리킨다").toMatch(/attached image \[1\] exactly/);
    expect(p, "한 장뿐인데 '서로 다른 물건들' 문구가 붙었다").not.toMatch(/different individual items/);
  });

  // ★★ 한 장짜리 컷에서도 같은 뿌리의 결함이 남아 있었다(사장님: "1·3컷에서 키링3의
  //    고무밴드가 반영이 안 됐다"). 앵커가 "a set of **four** small character keyrings" 인데
  //    그 컷의 첨부는 **한 개**다 — 한 장을 세트 전체라고 부르면 모델은 그 사진을 "세트의
  //    대표 이미지" 정도로 읽고, 그 물건만의 세부(고리에 달린 고무밴드)를 안 옮긴다.
  //    앵커를 쓰는 근거는 "그 장이 곧 이 영상의 피사체"인데, 피사체가 여러 개체의 집합이면
  //    그 근거가 깨진다.
  it("★★ 피사체가 여럿인 영상에서는, 한 장짜리 첨부도 '세트'라고 부르지 않는다", () => {
    const p = buildImagePrompt({ idx: 2, shows: "the chosen keyring on a bag", ref_ids: ["p3", "c1"] },
      PROJECT, [thing(3), PERSON]);
    const list = p.match(/Attached reference images, in order: ([^.]+)\./)[1];
    const first = list.split(/,\s*(?=\[)/)[0];
    expect(first, "한 장을 세트 전체로 부른다 — 그 물건만의 세부가 안 옮겨진다")
      .not.toMatch(/set of four/);
    expect(p, "무엇을 맞추라는 것인지 사라졌다").toMatch(/attached image \[1\] exactly/);
  });

  it("★ 사진이 한 장뿐인 영상은 앵커 그대로다 — 그 장이 곧 피사체다", () => {
    const one = { ...PROJECT, material: { photos: [{ id: "p1" }] },
      scenario: { focus: { mode: "물건", subject: "a walnut espresso tamper" } } };
    const p = buildImagePrompt({ idx: 0, shows: "the tamper", ref_ids: ["p1"] }, one, [thing(1)]);
    expect(p, "한 장뿐인 영상에서 앵커 이름이 사라졌다").toMatch(/tamper/);
  });

  it("★★ 사진 4장 + 인물 1명이 **다 실린다** — 사장님이 올린 것이 잘리면 안 된다", () => {
    const cut = { idx: 0, ref_ids: ["p1", "p2", "p3", "p4", "c1"] };
    const refs = resolveCutRefs(cut, PROJECT);
    expect(refs.length, "다섯 중 하나가 잘렸다").toBe(5);
    expect(refs.filter((r) => r.kind === "thing").length, "사진이 잘렸다").toBe(4);
    expect(refs.some((r) => r.kind === "person"), "인물 자리가 사라졌다").toBe(true);
  });
});
