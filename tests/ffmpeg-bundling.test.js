// ★ 배포된 함수 안에 **ffmpeg 실행 파일이 실려 있어야 한다**(2026-08-13 프로덕션 실측).
//
// 무슨 일이 있었나:
//   spawn /var/task/node_modules/ffmpeg-static/ffmpeg ENOENT
//
// `/var/task` 는 배포 함수의 실행 경로다. 즉 코드는 제자리를 찾아갔는데 **그 자리에 파일이
// 없었다.** next.config.mjs 가 serverExternalPackages 로 "번들에 넣지 마라"까지만 말하고,
// "그 파일을 함수에 같이 실어라"는 말은 안 했기 때문이다.
//
// ffmpeg-static 의 바이너리는 **설치 후에 내려받아 생기는 파일**이라(postinstall) 코드가
// import 하지 않는다 — Next 의 파일 추적은 import 를 따라가므로 이 파일을 못 본다.
// 로컬에서는 node_modules 가 그냥 거기 있어서 안 보이던 자리다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const config = readFileSync("next.config.mjs", "utf8");

describe("배포 — ffmpeg 실행 파일이 함수에 실린다", () => {
  it("번들에는 안 넣는다 — 기존 규칙(주석에 이유가 있다)", () => {
    expect(config).toMatch(/serverExternalPackages/);
    expect(config).toMatch(/ffmpeg-static/);
  });

  it("★ 함수에 파일을 함께 싣는다 — 이게 없으면 /var/task 에서 ENOENT 다", () => {
    expect(config, "outputFileTracingIncludes 가 없다").toMatch(/outputFileTracingIncludes/);
    // ffmpeg-static 폴더를 통째로 실어야 한다 — 바이너리 이름이 플랫폼마다 다르다
    // (리눅스 ffmpeg · 윈도 ffmpeg.exe). 한 이름만 적으면 배포에서만 빈다.
    expect(config, "ffmpeg-static 을 통째로 안 싣는다").toMatch(/node_modules\/ffmpeg-static/);
  });

  it("★★★ 합성을 부르는 문이 **빠짐없이** 덮인다 — 목록을 계산해서 쓴다", () => {
    // 옛 판은 "키가 전 라우트(/*)다"였다. 그 걱정(라우트마다 적으면 새 라우트를 빠뜨린다)은
    // 지금도 옳지만, 2026-09-10 에 그 대가가 드러났다 — `/*` 는 **모든 함수**에 110MB 를
    // 붙였고(배포 실물 함수 하나 46.11MB · 404 화면까지) Function Storage 가 제공량을 넘겼다.
    // 답은 "손으로 적는다"가 아니라 **import 그래프에서 계산한다**이다
    // (lib/build/compose-routes.mjs — `lib/compose.js` 에 닿는 진입점만 무거운 것을 진다).
    expect(config, "목록을 계산하지 않는다 — 손으로 적으면 새 라우트에서 빠진다")
      .toMatch(/composeRouteKeys\(\)/);
    const heavy = config.slice(config.indexOf("composeRouteKeys()"));
    expect(heavy, "계산된 문에 ffmpeg 를 안 붙인다").toMatch(/node_modules\/ffmpeg-static/);
  });
});
