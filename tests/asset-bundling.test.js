// ★ 배포된 함수 안에 **assets/ 자막 폰트가 실려 있어야 한다**(ffmpeg-static 사고와 같은 모양).
//
// lib/compose.js 의 fontsDir() 은 `path.join(process.cwd(), "assets", …)` 로 경로를
// 동적으로 만든다 — import 문이 아니라 문자열 조합이라 Next 의 파일 추적(@vercel/nft,
// import 를 따라간다)이 이 참조를 못 본다.
//
// ★ 이 실패는 ffmpeg-static 사고보다 조용하다. ffmpeg 바이너리가 없으면 spawn 이
// ENOENT 로 죽어 바로 드러나지만, 폰트가 없으면 libass 가 에러 없이 기본 폰트로
// 조용히 대체한다 — 합성은 "성공"하고 자막 글자만 두부(□□□)나 엉뚱한 글꼴로 나온다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const config = readFileSync("next.config.mjs", "utf8");

describe("배포 — assets(자막 폰트)가 함수에 실린다", () => {
  it("★ outputFileTracingIncludes 에 assets/ 가 들어 있다 — 없으면 자막이 조용히 두부가 된다", () => {
    expect(config, "outputFileTracingIncludes 가 없다").toMatch(/outputFileTracingIncludes/);
    expect(config, "assets/ 를 안 싣는다").toMatch(/["']assets\/\*\*\/\*["']/);
  });

  it("합성을 부르는 라우트가 전부 덮인다 — 키가 전 라우트다", () => {
    // ffmpeg-bundling.test.js 와 같은 이유: 라우트마다 적으면 새 라우트가 생길 때 빠뜨린다.
    expect(config, "전 라우트 키(/*)가 없다").toMatch(/["']\/\*["']\s*:/);
  });
});
