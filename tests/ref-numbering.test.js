// 첨부가 둘 이상이면 **전부** 번호로 부른다 — 물건도.
//
// 2026-08-18 실측(프로젝트 a8a4ac93, 슬리퍼 3컷). 사장님이 제품 사진 한 장을 올렸고,
// 컷1(첨부 1장)과 컷3은 제품이 정확했는데 **컷2만 전혀 다른 슬리퍼**가 나왔다.
// 사진은 실렸다(컷3이 같은 두 장으로 밑창 글자까지 옮겨 그렸다) — 틀린 것은 프롬프트다.
//
// 첨부 2장(제품 + 인물 아바타)일 때 실제로 나간 문장:
//   "Attached reference images, in order: [2] East Asian man in his 30s, poolside swimmer."
//   …
//   "Match the product/subject appearance to the attached reference image exactly …"
//
// 결함이 둘이다:
//  ① **목록이 [2]부터 시작한다.** 번호를 붙이는 코드가 인물만 남기고 거른다. "in order"
//     라고 선언해 놓고 첫 장을 통째로 빠뜨리니, [1]이 무엇인지 모델은 끝내 듣지 못한다.
//  ② **제품 지시가 단수·무번호다**("the attached reference image"). 첨부가 둘인데 어느
//     장이 제품인지 안 가리킨다 — 바로 앞에서 이름을 얻은 것은 [2](사람)뿐이다.
//
// 이 저장소는 같은 교훈을 이미 인물에 대해 적어 두었다("익명으로 두 장을 보냈더니 모델이
// 배역을 뒤바꿨다", 2026-07-29). 그 처방을 물건에는 적용하지 않은 것이 이번 결함이다.
// 컷3이 맞았던 것은 밑창 무늬를 보여 달라는 요구라 사진을 볼 수밖에 없어서다 — 즉 지금
// 구조는 운에 맡겨져 있었다.
import { describe, it, expect } from "vitest";
import { buildImagePrompt } from "../lib/cuts.js";

const PROJECT = {
  settings: { aspect_ratio: "9:16" },
  scenario: { focus: { mode: "물건", subject: "a lightweight summer sport slide sandal", look: "wide contoured footbed, matte finish" } },
  cast: [{ id: "c1", who: "East Asian man in his 30s, poolside swimmer", look: "lean athletic build, navy swim shorts", cuts: [1] }],
  material: { photos: [{ id: "p1", url: "/api/uploads/p1.png" }] },
};
const CUT = { idx: 1, sentence: "발이 편한 넉넉한 폭.", shows: "close-up of a bare foot sliding into the sandal", ref_ids: ["p1", "c1"] };

const THING = { kind: "thing", who: null, source: "upload", photo_id: "p1", key: "p1.png" };
const PERSON = { kind: "person", who: "East Asian man in his 30s, poolside swimmer", source: "avatar", photo_id: null, key: "man.png" };

const both = () => buildImagePrompt(CUT, PROJECT, [THING, PERSON]);

describe("첨부 번호 — 둘 이상이면 물건도 이름을 얻는다", () => {
  it("★ 목록이 [1]부터다 — 첫 장을 빠뜨리면 모델은 그것이 무엇인지 끝내 못 듣는다", () => {
    const p = both();
    const list = p.match(/Attached reference images, in order: ([^.]+)\./);
    expect(list, "번호 목록이 아예 없다").toBeTruthy();
    expect(list[1], "목록이 [1]로 시작하지 않는다 — 물건이 이름 없이 남는다").toMatch(/^\[1\]/);
    expect(list[1], "인물이 목록에서 빠졌다").toContain("[2]");
  });

  it("★ 물건 첨부를 무엇이라고 부르는지 목록에 있다", () => {
    const list = both().match(/Attached reference images, in order: ([^.]+)\./)[1];
    // 이름은 프로젝트가 이미 아는 것을 쓴다 — 없는 말을 지어내지 않는다.
    expect(list, "물건을 뭐라 부르는지 안 적었다").toMatch(/\[1\][^[]*sandal/);
  });

  it("★★ 제품을 맞추라는 지시가 **어느 번호**인지 가리킨다", () => {
    // 이것이 이번 결함의 핵심이다. 단수 "the attached reference image" 는 첨부가 둘일 때
    // 아무것도 가리키지 않는다 — 바로 앞에서 이름을 얻은 것은 사람뿐이다.
    const p = both();
    const at = p.indexOf("Match the product");
    expect(at, "제품 결속 문장이 없다").toBeGreaterThan(-1);
    expect(p.slice(at, at + 200), "어느 첨부가 제품인지 안 가리킨다").toMatch(/\[1\]/);
  });

  it("★ 구도 금지 문장은 한 번만 나온다 — 두 번 붙으면 잡음이다", () => {
    const p = both();
    const hits = p.split("never for its camera angle").length - 1;
    expect(hits, "같은 문장이 두 번 실린다").toBe(1);
  });

  it("★ 첨부가 하나면 번호 목록을 안 붙인다 — 모호하지 않은 자리를 어지럽히지 않는다", () => {
    const one = buildImagePrompt({ ...CUT, ref_ids: ["p1"] }, PROJECT, [THING]);
    expect(one, "한 장뿐인데 번호를 매겼다").not.toMatch(/Attached reference images, in order/);
    expect(one, "제품 결속이 사라졌다").toMatch(/Match the product/);
  });
});
