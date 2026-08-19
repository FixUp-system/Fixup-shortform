import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { imagePlanFor } from "../lib/film/mode.js";

const src = readFileSync("lib/ad/scenario.js", "utf8");

const SCENARIO = {
  shots: [
    { beat: "키링으로 시선을 끈다", shows: "a lavender bunny keyring swaying on a tan leather handbag", camera: "느린 푸시인", lighting: "부드러운 낮빛", action: "키링이 흔들린다", seconds: 5 },
    { beat: "손에 들어 보여준다", shows: "a hand holding the small bunny charm close to the lens", camera: "클로즈업", lighting: "창가 빛", action: "손이 들어올린다", seconds: 5 },
  ],
};

describe("시나리오가 이미지용 영어 한 줄을 낸다", () => {
  it("★ 스키마가 shows 를 요구한다 — 영어로", () => {
    expect(src).toMatch(/"shows"/);
  });

  it("★ 사장님이 고칠 수 있는 칸에도 들어간다", () => {
    expect(src).toMatch(/EDITABLE_SHOT_FIELDS[^\]]*"shows"/);
  });
});

describe("이미지 프롬프트가 영어에서 나온다", () => {
  it("★ 장면 순서 — 그 장면의 shows 가 실린다", () => {
    const plan = imagePlanFor("order", SCENARIO);
    expect(plan[0].prompt).toContain("lavender bunny keyring");
    // 한국어 필드가 프롬프트를 채우지 않는다 — 이미지 모델이 읽는 글이다
    expect(plan[0].prompt).not.toContain("느린 푸시인");
  });

  it("★ 참고 그림 — 축들이 shows 에서 나온다", () => {
    const plan = imagePlanFor("refs", SCENARIO);
    const joined = plan.map((p) => p.prompt).join(" ");
    expect(joined).toContain("lavender bunny keyring");
    expect(joined).not.toContain("손이 들어올린다");
  });

  it("★ shows 가 없는 옛 문서에서도 죽지 않는다", () => {
    const old = { shots: [{ beat: "무엇을 한다", seconds: 5 }] };
    expect(() => imagePlanFor("order", old)).not.toThrow();
    expect(() => imagePlanFor("refs", old)).not.toThrow();
  });
});
