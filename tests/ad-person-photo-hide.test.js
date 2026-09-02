// **원클릭도 프로(2.5)에서는 ＋인물 을 숨긴다** (2026-09-02 사장님 지시 "일단 숨김처리").
//
// ★★ 실측 근거 — 원클릭 프로젝트 6e8243f1(09-02)이 인물 사진을 싣고 2.5 r2v 로 나갔다가
//   초상 422 로 죽었다(image_urls · "likenesses of real people"). 단계별이 09-01 에 막은
//   바로 그 자리가 원클릭에는 열려 있었다.
//
// ★★ 이것은 **가림막이지 잠금이 아니다** — 사장님이 "제외가 아니라 일단 숨김"이라고
//   못 박았다. 서버 적재(lib/ad/pipeline.js)는 안 건드렸으므로 옛 문서나 API 직접 호출은
//   여전히 인물 사진을 실을 수 있다. 잠금까지 갈지는 사장님이 정한다.
//
// ★ 판정 표는 clip-limits 의 프로필 **하나**다(blocksFacesForEndpoint) — 광고 쪽에 얼굴
//   표를 따로 두면 단계별과 두 표가 갈린다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { blocksFacesForEndpoint } from "../lib/clip-limits.js";
import { adEndpoint } from "../lib/ad/models.js";

// 소스 판 규율(OUTSTANDING §7-10): 줄 주석을 먼저 걷고 블록 주석을 걷는다.
const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

describe("판정 — 어느 광고 모델이 얼굴 든 참조를 막나", () => {
  it("★★★ 프로(2.5)는 막는다 — 실측 9건 전부 거절한 그 모델이다", () => {
    expect(blocksFacesForEndpoint(adEndpoint("seedance-2.5", "r2v"))).toBe(true);
  });

  it("★★ 기본(H3)은 안 막는다 — 모르면 안 막는 것이 이 저장소의 규율이다", () => {
    expect(blocksFacesForEndpoint(adEndpoint("minimax-h3", "r2v"))).toBe(false);
  });

  it("★ 2.0 도 안 막는다 — 얼굴 든 판으로 영상을 낸 실측이 있다", () => {
    expect(blocksFacesForEndpoint(adEndpoint("seedance-2.0", "r2v"))).toBe(false);
  });
});

describe("원클릭 화면 — 프로면 ＋인물 이 사라진다", () => {
  const src = strip(readFileSync("app/ads/new/page.js", "utf8"));

  it("★★★ 화면이 가려진 목록을 돌린다 — 표를 직접 돌리면 프로에서도 ＋인물 이 그려진다", () => {
    expect(src).toMatch(/visiblePhotoRoles\(/);
    expect(src).not.toMatch(/PHOTO_ROLES\.map\(/);
  });

  it("★★ 판정이 clip-limits 한 벌이다 — 광고 쪽 얼굴 표를 따로 만들면 갈린다", () => {
    expect(src).toMatch(/blocksFacesForEndpoint\(adEndpoint\(/);
  });

  it("★★ 이미 올린 인물 사진이 있으면 말해 준다 — 조용히 버리면 '반영이 안 된다'로 읽힌다", () => {
    expect(src).toMatch(/strandedPeople/);
    expect(src).toMatch(/기본으로 바꿔 주세요/);
  });
});

describe("모드 하단 안내 — ! 아이콘 옆 한 줄", () => {
  const NOTE = "프로 버전에서는 인물 사진 참조가 지원되지 않아요";

  it("★★ 원클릭 하단에 있다", () => {
    const src = strip(readFileSync("app/ads/new/page.js", "utf8"));
    expect(src).toMatch(new RegExp(NOTE));
    expect(src, "안내에 ! 아이콘이 없다").toMatch(/mode-note[\s\S]{0,200}name="bang"/);
  });

  it("★★ 단계별 하단에도 있다 — 두 모드가 같은 문구를 쓴다", () => {
    const src = strip(readFileSync("app/reel/new/page.js", "utf8"));
    expect(src).toMatch(new RegExp(NOTE));
    expect(src).toMatch(/mode-note[\s\S]{0,200}name="bang"/);
  });

  it("★ 아이콘·줄 스타일이 실제로 있다 — 클래스만 적고 규칙이 없으면 맨글자다", () => {
    expect(readFileSync("components/Icon.jsx", "utf8")).toMatch(/bang:/);
    expect(readFileSync("app/globals.css", "utf8")).toMatch(/\n\.mode-note \{/);
  });
});
