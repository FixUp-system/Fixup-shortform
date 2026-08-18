// ①단계의 이름은 **입력**이다 — 광고와 같은 말을 쓴다.
//
// 사장님 지시(2026-08-18): "단계별 영상 만들기도 자료라고 하지 말고 입력으로."
//
// 광고 흐름은 이미 ①을 "입력"이라 부른다(app/ads/[id]/page.js 의 단계 표시).
// 같은 제품의 두 흐름이 첫 단계를 다른 말로 부르고 있었다 — 사장님이 둘을 오가며 쓰는데
// 같은 자리를 다른 이름으로 만나면 배운 것이 안 통한다.
//
// ★ 바꾸는 것은 **사장님이 읽는 말**이지 코드의 키가 아니다. `key: "material"` 은 라우팅
//   가드·각인·저장 문서가 함께 쓰는 값이라, 그것까지 바꾸면 옛 프로젝트가 길을 잃는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { STEPS } from "../lib/steps.js";

describe("①단계의 이름", () => {
  it("★★ 사장님에게는 '입력'이라고 말한다", () => {
    const first = STEPS[0];
    expect(first.label, "①이 아직 다른 이름이다").toBe("입력");
  });

  it("★★ 코드의 키는 그대로다 — 바꾸면 옛 프로젝트가 길을 잃는다", () => {
    expect(STEPS[0].key, "단계 키가 바뀌었다").toBe("material");
    expect(STEPS[0].seg, "주소가 바뀌었다 — 사장님이 받아 간 링크가 죽는다").toBe("briefing");
  });

  it("★ 그 화면의 제목도 같은 말이다", () => {
    const page = readFileSync("app/create/[id]/briefing/page.js", "utf8");
    const h2 = page.match(/<h2>([^<]+)<\/h2>/)?.[1] || "";
    expect(h2, `화면 제목이 단계 이름과 다른 말이다("${h2}")`).toMatch(/입력/);
  });

  it("★ 보관함 카드의 상태 이름도 같다", () => {
    const cards = readFileSync("components/ProjectCards.jsx", "utf8");
    expect(cards, "보관함이 옛 이름으로 부른다").not.toMatch(/draft: "자료"/);
  });
});
