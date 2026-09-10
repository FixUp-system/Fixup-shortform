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
    // ★★ 2026-09-10 — `assets/**/*`(30MB 전부, 전 라우트) 에서 **자막 폰트만, 합성이
    //   도는 문에만** 으로 좁혔다. Function Storage 가 제공량을 넘겨서다(함수 하나 46.11MB).
    //   폰트 파일은 `assets/subtitle-*.ttf|otf` 다(lib/subtitle-langs.js 의 subtitleFontFor).
    expect(config, "자막 폰트를 안 싣는다 — 자막이 조용히 두부가 된다")
      .toMatch(/["']assets\/subtitle-\*["']/);
  });

  it("★★★ 폰트가 **합성이 도는 문에** 붙는다 — 손으로 적은 목록이 아니다", () => {
    // 옛 판은 "키가 전 라우트(/*)다"를 못 박았다. 그 이유(새 라우트를 빠뜨린다)는 지금도
    // 옳지만, 답이 바뀌었다 — 이제 **import 그래프에서 계산**한다(lib/build/compose-routes.mjs).
    // 손으로 적지 않으므로 빠뜨릴 수 없고, 전 라우트에 싣지도 않는다.
    // ★ 계산 자체가 옳은지는 tests/function-bundle-size.test.js 가 잰다(비었나·필수가 빠졌나).
    expect(config, "목록을 계산하지 않는다").toMatch(/composeRouteKeys\(\)/);
    const heavy = config.slice(config.indexOf("composeRouteKeys()"));
    expect(heavy, "계산된 문에 폰트를 안 붙인다").toMatch(/assets\/subtitle-\*/);
  });
});
