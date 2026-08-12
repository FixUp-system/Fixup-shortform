// 화면 테스트 — 이 저장소는 렌더링 하네스가 없어 소스를 읽어 판정한다
// (tests/staleness-ui.test.js · tests/credits-ui.test.js 방식).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/ads/new/page.js", "utf8");

describe("/ads/new 화면", () => {
  it("클라이언트 컴포넌트로 시작한다", () => {
    expect(src.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("옵션 세 축(포맷·분위기·언어)을 표에서 읽는다 — 라벨을 화면에 복사하지 않는다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/ad\/options["']/);
    expect(src).toContain("AD_FORMATS");
    expect(src).toContain("AD_MOODS");
    expect(src).toContain("AD_LANGS");
    // 라벨을 복사하면 표와 갈린다 — 세 축에서 하나씩 대표로 확인한다
    expect(src).not.toContain("제품 히어로");
    expect(src).not.toContain("고급스러운");
    expect(src).not.toContain("한국어");
  });

  it("사이즈는 lib/aspects 의 ASPECTS 에서 읽는다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/aspects["']/);
    expect(src).toContain("ASPECTS");
    // 라벨+id 조합을 손으로 적으면 아래 세 값이 늘거나 바뀔 때 화면만 낡는다
    expect(src).not.toContain("세로 · 9:16");
  });

  it("화풍은 STYLE_PRESETS 에서 라벨을 읽되 AD_STYLE_LINES 에 있는 id 로 실제로 거른다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/styles["']/);
    expect(src).toContain("STYLE_PRESETS");
    // import 만 하고 그대로 다 보여주면, styles.js 에 화풍이 늘고 lib/ad/options.js 의
    // AD_STYLE_LINES 가 아직 안 따라온 순간 사장님이 고른 화풍을 서버가 400 으로 거절한다.
    // 그래서 "필터를 실제로 하는가"까지 구조로 확인한다(단순 import 존재만으로는 부족하다).
    const filterIdx = src.indexOf("STYLE_PRESETS.filter(");
    expect(filterIdx, "STYLE_PRESETS 를 거르지 않고 그대로 쓴다").toBeGreaterThan(-1);
    const filterCall = src.slice(filterIdx, filterIdx + 150);
    expect(filterCall, "필터 조건에 AD_STYLE_LINES 가 없다").toContain("AD_STYLE_LINES");
    // 화풍 라벨을 화면에 그대로 박지 않았는지도 확인한다
    expect(src).not.toContain("배경 없는 깔끔한 사진");
  });

  it("가격을 화면에 박지 않는다 — 이 화면은 무료다", () => {
    expect(src).not.toMatch(/\b65\b/);
  });

  it("새 CSS 파일을 만들지 않았다", () => {
    expect(src).not.toMatch(/\.css["']/);
  });

  it("사진은 서버와 같은 상한(4장)을 쓰고, 넘는 선택은 실제로 자른다", () => {
    expect(src).toMatch(/MAX_PHOTOS\s*=\s*4/);
    // 상수만 있고 안 쓰면 사장님이 5장을 골라도 전부 업로드된 뒤 서버 400 을 만난다.
    // slice 로 실제로 자르는지까지 구조로 확인한다.
    expect(src).toMatch(/files\.slice\(0,\s*Math\.max\(room,\s*0\)\)/);
    expect(src).toMatch(/disabled=\{photos\.length >= MAX_PHOTOS\}/);
  });

  it("사진은 기존 업로드 라우트(POST /api/uploads)로 올린다", () => {
    expect(src).toContain('fetch("/api/uploads"');
  });

  it("[시나리오 만들기]가 POST /api/ads → POST /api/ads/<id>/scenario → /ads/<id> 순서로 이어진다", () => {
    const adsPostIdx = src.indexOf('fetch("/api/ads"');
    const scenarioIdx = src.indexOf("/scenario`");
    const pushIdx = src.indexOf("router.push(`/ads/");
    expect(adsPostIdx, "POST /api/ads 호출이 없다").toBeGreaterThan(-1);
    expect(scenarioIdx, "POST /api/ads/<id>/scenario 호출이 없다").toBeGreaterThan(adsPostIdx);
    expect(pushIdx, "/ads/<id> 로 이동하는 코드가 없다").toBeGreaterThan(scenarioIdx);
  });

  it("둘 중 하나라도 실패하면 이동하지 않는다 — 실패 판정이 router.push 보다 앞에 있다", () => {
    const pushIdx = src.indexOf("router.push(`/ads/");
    const firstCheck = src.indexOf("if (!res.ok)");
    const secondCheck = src.indexOf("if (!res2.ok)");
    expect(firstCheck, "첫 번째 응답의 성공 여부를 안 본다").toBeGreaterThan(-1);
    expect(secondCheck, "두 번째 응답(시나리오)의 성공 여부를 안 본다").toBeGreaterThan(-1);
    expect(firstCheck).toBeLessThan(pushIdx);
    expect(secondCheck).toBeLessThan(pushIdx);
  });

  it("400 응답의 error 문구를 그대로 화면에 띄운다 — 두 호출 모두", () => {
    expect(src).toMatch(/setErr\(data\.error/);
    expect(src).toMatch(/setErr\(data2\.error/);
    expect(src).toContain("{err &&");
  });
});
