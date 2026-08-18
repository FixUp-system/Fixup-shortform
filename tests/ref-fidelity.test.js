// 레퍼런스는 **바뀌면 안 되는 것**이다 — 프롬프트가 그렇게 말해야 한다.
//
// 사장님 지적(2026-08-18): "참조되는 이미지는 사실상 변형이 되면 안 되는 이미지야."
//
// 프롬프트를 실제로 뽑아 보니 강제 문구는 있는데(`… exactly`), **같은 프롬프트가 그것과
// 다투는 말을 두 줄 더** 주고 있었다.
//
//  ① 제품 외형 재서술 — `Its appearance, identical in every scene: four palm-sized keyrings
//     in soft pastel and cream tones, …`. 이건 **사진이 아니라 시나리오가 지어낸 말**이다.
//     실제 물건은 흰·초록·파랑인데 "파스텔·크림"이라 적혀 있었다. 사진이 붙어 있는 컷에서
//     이 줄은 **두 번째 원천**이 되어 모델을 사진에서 멀어지게 한다.
//     ★ 첨부가 없는 컷에서는 반대다 — 그때는 이 말이 일관성의 **유일한** 근거다(실측:
//       맞는 아바타가 없어 첨부가 빈 컷에서 컷마다 다른 사람이 그려졌다). 그래서 지운다가
//       아니라 **첨부가 있을 때만 뺀다**.
//
//  ② `no text or letters in the image` — 원래 **AI가 만들어 내는 엉터리 글자**를 막는 말이다
//     (정확한 글자는 자막이 ffmpeg 로 태운다). 그런데 첨부에 인쇄된 글자가 있으면 그것까지
//     지우라는 말로 읽힌다. 증상이 정확히 그 모양이었다: `KONKUK UNIV.` → `KU`,
//     슬리퍼 옆면 `FASHION` → `SPORT`. 레퍼런스가 있을 때는 **거기 있는 글자는 지키라고**
//     말해야 한다.
//
// 남는 한계는 문구로 못 넘는다: 모델은 픽셀을 보존하는 것이 아니라 참조를 보고 **다시 그린다**.
import { describe, it, expect } from "vitest";
import { buildImagePrompt } from "../lib/cuts.js";

const PROJECT = {
  settings: { aspect_ratio: "9:16" },
  scenario: { focus: { mode: "물건", subject: "a set of four character keyrings", look: "soft pastel and cream tones, glossy acrylic charms" } },
  material: { photos: [{ id: "p1" }, { id: "p2" }] },
};
const CUT = { idx: 0, shows: "the keyrings on a table", ref_ids: ["p1", "p2"] };
const thing = (n) => ({ kind: "thing", who: null, source: "upload", photo_id: `p${n}`, key: `p${n}.png` });

const withRefs = () => buildImagePrompt(CUT, PROJECT, [thing(1), thing(2)]);
const noRefs = () => buildImagePrompt({ ...CUT, ref_ids: [] }, PROJECT, []);

describe("레퍼런스가 붙은 컷 — 사진이 유일한 원천이다", () => {
  // ★★ **서술을 지우지 않고 우선순위를 선언한다**(설계 판단, 2026-08-18).
  //    지우는 쪽이 더 강해 보이지만, 그 줄은 **본문**에 있고 본문은 refs 를 모른다 —
  //    화면(④이미지)이 같은 함수로 본문을 다시 계산해 그 길이만큼 꼬리를 떼어 내기
  //    때문이다(`full.slice(seed.length)`). 본문이 첨부 유무로 갈리면 화면이 만든 본문과
  //    서버가 보내는 본문이 어긋나고, 사장님이 그 상태에서 [저장]을 누르면 **틀린 본문이
  //    덮어쓰기로 굳는다**. 그래서 꼬리(=refs 를 아는 자리)에서 **사진이 이긴다**고 말한다.
  it("★★ 사진이 있으면 '사진이 이긴다'고 못 박는다", () => {
    const p = withRefs();
    expect(p, "말과 사진이 다툴 때 무엇을 따를지 안 말한다")
      .toMatch(/photo(graph)?s? (take precedence|win|are the authority)|follow the attached photo/i);
    // 다투는 상대를 지목해야 말이 선다 — "위의 서술"이 무엇인지 모르면 규칙이 뜬다
    expect(p, "무엇과 다투는지 안 가리킨다").toMatch(/written|description/i);
  });

  it("★ 사진이 없으면 그 우선순위 문구를 안 붙인다 — 이길 사진이 없다", () => {
    expect(noRefs(), "첨부도 없는데 사진을 따르라고 한다")
      .not.toMatch(/photos take precedence|follow the attached photo/i);
    expect(noRefs(), "첨부가 없으면 외형 서술이 유일한 근거인데 그것마저 없다")
      .toContain("Its appearance, identical in every scene");
  });

  it("★★ 레퍼런스에 인쇄된 글자·로고는 **지키라고** 말한다", () => {
    const p = withRefs();
    expect(p, "첨부의 글자를 지우라는 말만 있고 지키라는 말이 없다")
      .toMatch(/lettering|printed|logo/i);
    // 엉터리 글자를 막는 원래 규칙은 살아 있어야 한다 — 없애는 것이 아니라 범위를 좁힌다
    expect(p, "AI 가 글자를 지어내는 것을 막는 말이 사라졌다").toMatch(/no (new |added |invented )?text/i);
  });

  it("★ 첨부가 없으면 글자 금지는 예전 그대로다 — 지킬 글자가 없다", () => {
    expect(noRefs(), "첨부도 없는데 글자를 지키라고 한다").not.toMatch(/lettering|printed/i);
    expect(noRefs()).toContain("no text or letters in the image");
  });

  it("★★ 다시 디자인하지 말라고 못 박는다 — 'exactly' 만으로는 무엇이 금지인지 안 말한다", () => {
    const p = withRefs();
    expect(p, "재해석 금지가 없다").toMatch(/do not redesign|do not restyle|do not simplify/i);
    expect(p, "부속(고리·스트랩)을 지키라는 말이 없다").toMatch(/hardware|strap|attachment/i);
  });
});
