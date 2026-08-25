// 실제 비용 화면 — **내부 테스트 단계에서 모든 사용자가 본다**(2026-08-25 사장님 지시:
// "지금 비용표 실제 비용이라고 사이드바에 만들어서 모든 사용자가 볼 수 있게").
//
// ★ 여기서 못 박는 것은 셋이다:
//   ① 값을 **손으로 안 적는다**(estimateCost 한 자리에서 뽑는다)
//   ② 사이드바 링크가 **운영자 전용이 아니다**
//   ③ 크레딧을 말하지 않는다 — 이 화면은 원가만 말한다(두 장부는 단위부터 다르다)
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { estimateCost } from "../lib/costs.js";

const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const page = strip(readFileSync("app/cost-table/page.js", "utf8"));
const sidebar = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

describe("값의 출처", () => {
  it("★ 표를 손으로 적지 않는다 — estimateCost 에서 뽑는다", () => {
    expect(page).toContain("estimateCost");
    // 달러 숫자를 본문에 박아 두면 단가가 바뀌는 날 이 화면만 낡는다.
    expect(page, "값을 손으로 적은 자리가 있다").not.toMatch(/\$\d+\.\d\d/);
  });

  it("서버 컴포넌트다 — lib/costs.js 는 화면이 import 할 수 없다", () => {
    expect(page).not.toContain('"use client"');
    // 빌드 시점에 미리 굽지 않는다(그 사슬이 env 를 요구할 수 있다).
    expect(page).toContain('dynamic = "force-dynamic"');
  });
});

describe("무엇을 말하는 화면인가", () => {
  it("★ 크레딧 **값**을 보여 주지 않는다 — 원가만 말한다", () => {
    // ★ "크레딧이 아니라 원가예요"라고 **말하는 것**은 맞다 — 두 장부를 가르는 문장이다.
    //   막으려는 것은 크레딧 **숫자**가 이 표에 섞이는 것이다(단위가 달라 섞여 읽힌다).
    expect(page, "크레딧 값이 표에 섞였다").not.toMatch(/\d\s*크레딧/);
    expect(page).not.toContain("videoPrice");
    expect(page).not.toContain("priceLabel");
  });

  it("환율은 **기준일과 함께** 적는다 — 참고값이라 언제 것인지가 정확도보다 중요하다", () => {
    expect(page).toContain("USD_KRW");
    expect(page).toContain("RATE_AT");
    expect(page).toMatch(/기준/);
  });

  it("스토리보드가 한 장이라는 것을 말한다 — 컷 수와 무관하다", () => {
    expect(page).toContain("한 장");
  });
});

describe("사이드바", () => {
  it("★★ 운영자 전용이 아니다 — 모든 사용자가 본다", () => {
    const at = sidebar.indexOf('href="/cost-table"');
    expect(at, "사이드바에 링크가 없다").toBeGreaterThan(-1);
    // 앞 200자 안에 isAdmin 게이트가 있으면 지시가 통째로 무효가 된다.
    expect(sidebar.slice(Math.max(0, at - 200), at), "운영자 전용으로 잠겼다").not.toContain("isAdmin");
  });

  it("운영자 전용 [비용 기록](/costs)과 다른 자리다", () => {
    expect(sidebar).toContain('href="/costs"');
    expect(sidebar).toContain('href="/cost-table"');
  });
});

describe("표가 실제로 값을 낸다", () => {
  it("이미지 + 영상 = 합계다", () => {
    const img = estimateCost("openai/gpt-image", 1, "high");
    const vid = estimateCost("bytedance/seedance-2.0/reference-to-video", 15, "480p");
    expect(img).toBeGreaterThan(0);
    expect(vid).toBeGreaterThan(0);
    // 이 값이 화면의 첫 줄이 된다 — 표가 비면 여기서 먼저 걸린다.
    expect(img + vid).toBeCloseTo(2.42, 1);
  });
});

describe("좁은 화면", () => {
  it("표만 옆으로 구른다 — 본문이 가로로 구르면 안 된다", () => {
    expect(css).toContain(".tablewrap");
    const at = css.indexOf(".tablewrap");
    expect(css.slice(at, at + 120)).toContain("overflow-x: auto");
  });
});
