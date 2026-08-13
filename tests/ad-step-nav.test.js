// 광고 단계 사이를 오갈 수 있어야 한다 (2026-08-13 사용자 요청).
//
// 그전에는 `/ads/[id]` 한 주소가 status 로 넷을 오갔고, 사이드바 단계는 <span> 이라
// 눌러도 아무 데도 안 갔다. 시나리오를 다시 보고 싶어도 돌아갈 길이 없었다.
//
// 고른 방식: **주소에 남긴다**(`?step=scenario`). 페이지를 넷으로 쪼개지 않고도 뒤로가기·
// 새로고침·링크 공유가 다 살아난다. 아직 안 온 단계는 잠근다 — 없는 것을 보여줄 수 없다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { AD_STEPS, adStepIndex, isAdStepReachable } from "../lib/ad/steps.js";

const sidebar = readFileSync("components/Sidebar.jsx", "utf8");
const page = readFileSync("app/ads/[id]/page.js", "utf8");

describe("지나온 단계는 다시 볼 수 있다", () => {
  it("지금 단계와 지나온 단계가 열린다", () => {
    // 지금이 '만드는 중'이면 입력·시나리오·만드는 중까지 열린다
    expect(isAdStepReachable("draft", "rendering")).toBe(true);
    expect(isAdStepReachable("scenario", "rendering")).toBe(true);
    expect(isAdStepReachable("rendering", "rendering")).toBe(true);
  });

  it("아직 안 온 단계는 잠긴다 — 없는 것을 보여줄 수 없다", () => {
    expect(isAdStepReachable("done", "rendering")).toBe(false);
    expect(isAdStepReachable("scenario", "draft")).toBe(false);
  });

  it("모르는 값에도 안 죽는다 — 첫 단계 기준으로 본다", () => {
    expect(isAdStepReachable("draft", undefined)).toBe(true);
    expect(isAdStepReachable("없는단계", "done")).toBe(false);
  });

  it("표의 모든 단계가 완성 상태에서는 열린다", () => {
    for (const s of AD_STEPS) expect(isAdStepReachable(s.key, "done"), s.key).toBe(true);
    expect(adStepIndex("done")).toBe(AD_STEPS.length - 1);
  });
});

describe("사이드바에서 눌러 간다", () => {
  it("단계가 링크다 — 눌러도 아무 데도 안 가던 <span> 이 아니다", () => {
    expect(sidebar).toMatch(/\/ads\/\$\{[^}]*\}\?step=/);
  });

  it("갈 수 있는 단계만 링크다", () => {
    expect(sidebar).toMatch(/isAdStepReachable/);
  });
});

describe("화면이 주소를 읽는다", () => {
  it("?step 을 읽어 그 단계를 그린다", () => {
    expect(page).toMatch(/useSearchParams/);
    expect(page).toMatch(/step/);
  });

  // 폴링·자동 진행은 **진짜 status** 를 따라야 한다 — 보고 있는 화면이 그것을 바꾸면 안 된다.
  it("보는 단계와 실제 상태를 갈라 쓴다", () => {
    expect(page).toMatch(/const view\b|viewStep/);
  });
});
