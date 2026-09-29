// **올리기 전에 브라우저에서 사진을 줄인다** (2026-09-29 사장님 신고: "업로드 실패").
//
// ★★★ 실측 — 업로드 374건 중 **4MB 를 넘은 것이 0건**이다(가장 큰 것 3.38MB).
//   Vercel 이 함수로 들어오는 요청 본문을 **4.5MB 에서 막기** 때문이고, 그때 돌아오는
//   응답에는 우리 오류 문구가 없어서 화면은 기본 문구("업로드 실패")만 띄웠다.
//   우리 코드가 `MAX_BYTES = 10MB` 라고 적어 둔 것은 **닿지도 못하는 값**이다.
// ★ 그래서 사장님에게 "작게 줄여 오세요"라고 떠넘기지 않고 **우리가 줄여서 보낸다.**
//   참조용 사진이라 긴 변 2,000px 이면 충분하다(굽기 화질이 720p·1080p 다).
// ★★ 판정(무엇을 얼마나 줄일까)은 **순수 함수**로 빼 둔다 — 캔버스가 없는 곳(테스트·서버)
//   에서도 잴 수 있어야 한다. 실제로 줄이는 일은 브라우저만 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  UPLOAD_MAX_SIDE, UPLOAD_MAX_BYTES, targetSizeFor, outputTypeFor, needsShrink,
} from "../lib/upload-shrink.js";

describe("값", () => {
  it("★★★ 상한이 플랫폼(4.5MB)보다 **작다** — 그 안으로 들어가야 우리 코드에 닿는다", () => {
    expect(UPLOAD_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
  it("★★ 긴 변 2,000px — 굽기 화질(720p·1080p)보다 넉넉하다", () => {
    expect(UPLOAD_MAX_SIDE).toBe(2000);
  });
});

describe("얼마나 줄일까 — targetSizeFor", () => {
  it("★★★ 긴 변을 상한에 맞추고 비율을 지킨다", () => {
    expect(targetSizeFor(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(targetSizeFor(3000, 4000)).toEqual({ width: 1500, height: 2000 });
  });
  it("★★ 작은 사진은 **안 키운다** — 키우면 글자가 뭉개진다", () => {
    expect(targetSizeFor(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("★ 반올림해서 정수로 준다 — 캔버스는 소수 치수를 못 받는다", () => {
    const { width, height } = targetSizeFor(3333, 2222);
    expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true);
  });
});

describe("어떤 형식으로 내보낼까 — outputTypeFor", () => {
  it("★★★ PNG 는 PNG 로 둔다 — 로고의 투명 배경이 검게 칠해지면 안 된다", () => {
    expect(outputTypeFor("image/png")).toBe("image/png");
  });
  it("★★ JPEG 는 JPEG 로 — 사진은 그쪽이 훨씬 작다", () => {
    expect(outputTypeFor("image/jpeg")).toBe("image/jpeg");
  });
  it("★ webp 도 그대로 둔다 — 서버가 받는 세 종류 중 하나다", () => {
    expect(outputTypeFor("image/webp")).toBe("image/webp");
  });
  it("★ 모르는 형식은 JPEG 로 — 서버가 안 받는 것을 그대로 보내면 400 이다", () => {
    expect(outputTypeFor("image/heic")).toBe("image/jpeg");
  });
});

describe("줄일 필요가 있나 — needsShrink", () => {
  it("★★★ 상한을 넘으면 줄인다", () => {
    expect(needsShrink({ size: 5 * 1024 * 1024, type: "image/jpeg" }, 3000, 2000)).toBe(true);
  });
  it("★★ 크기는 작아도 **치수가 크면** 줄인다 — 다음 사진과 합쳐 넘칠 여지를 없앤다", () => {
    expect(needsShrink({ size: 500 * 1024, type: "image/jpeg" }, 4000, 3000)).toBe(true);
  });
  it("★★ 작고 치수도 작으면 **손대지 않는다** — 다시 굽으면 화질만 잃는다", () => {
    expect(needsShrink({ size: 300 * 1024, type: "image/png" }, 1200, 800)).toBe(false);
  });
});

describe("화면 다섯이 모두 줄여서 올린다", () => {
  const screens = [
    "app/reel/new/page.js",
    "app/ads/new/page.js",
    "app/create/page.js",
    "app/film/new/page.js",
    "app/film/one/[mode]/page.js",
  ];
  for (const f of screens) {
    it(`★★★ ${f}`, () => {
      const src = readFileSync(f, "utf8");
      expect(src, "줄이지 않고 올린다").toMatch(/shrinkForUpload\(/);
      // 줄인 결과를 보내야 한다 — 원본을 그대로 append 하면 줄인 뜻이 없다
      expect(src).not.toMatch(/fd\.append\("file", file\)/);
    });
  }
});
