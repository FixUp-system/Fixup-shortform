import { composeRouteKeys } from "./lib/build/compose-routes.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ffmpeg-static 은 번들에 넣지 않는다.
  // 이 패키지는 `path.join(__dirname, "ffmpeg.exe")` 로 실행 파일 자리를 잡는데, 번들에
  // 끌려 들어가면 __dirname 이 .next/server/vendor-chunks 가 되고 바이너리는 따라가지
  // 않는다 — 합성이 시작되자마자 ENOENT 로 죽는다. 외부로 빼면 실행 시점에 node 가
  // node_modules 에서 직접 불러 __dirname 이 제자리를 가리킨다.
  serverExternalPackages: ["ffmpeg-static"],

  // ★ 그리고 그 파일을 **함수에 같이 실어야 한다**(2026-08-13 프로덕션 실측).
  //
  //   spawn /var/task/node_modules/ffmpeg-static/ffmpeg ENOENT
  //
  // 위 serverExternalPackages 는 "번들에 넣지 마라"까지만 말한다. 배포 함수는 필요한
  // 파일만 추려 담는데(파일 추적), 그 추적은 **import 를 따라간다** — ffmpeg 바이너리는
  // 설치 후 내려받아 생기는 파일이라(postinstall) 아무도 import 하지 않아 안 담긴다.
  // 로컬에서는 node_modules 가 통째로 거기 있어서 이 구멍이 안 보였다.
  //
  // ★ 폴더를 통째로 싣는다 — 바이너리 이름이 플랫폼마다 다르다(리눅스 `ffmpeg` ·
  //   윈도 `ffmpeg.exe`). 한 이름만 적으면 배포에서만 빈다.
  // ★ 키는 **라우트 글롭**이다(Next 문서).
  //
  // ★★★ 2026-09-10 — **`/*`(전 라우트)를 걷었다. Function Storage 가 제공량을 넘겼다.**
  //   옛 주석은 "라우트를 하나씩 적으면 빠뜨린다"는 이유로 `/*` 를 골랐는데, 그 대가가
  //   드러났다 — 배포 실물에서 **함수 하나가 46.11MB** 였고 `_not-found`(404 화면)까지
  //   같은 크기였다(출력 197개 × 보관 배포 20개 이상).
  //   ⚠️ 그렇다고 손으로 목록을 적으면 옛 주석의 걱정이 그대로 현실이 된다 — 새 라우트가
  //     compose 를 쓰기 시작한 날 아무도 모르게 빠지고, **그 실패는 조용하다**(libass 가
  //     기본 폰트로 대체해 자막만 두부가 된다).
  //   → 그래서 **손으로 안 적고 import 그래프에서 계산한다**(lib/build/compose-routes.mjs).
  //     `lib/compose.js` 에 닿는 진입점만 무거운 것을 진다 — 실측 98개 중 **27개**.
  //     tests/function-bundle-size.test.js 가 양쪽(덜 실었나·더 실었나)을 잰다.
  // ★ assets/ (자막 폰트)도 같은 이유로 같이 실어야 한다.
  //
  // lib/compose.js 의 fontsDir()이 `path.join(process.cwd(), "assets", …)` 로
  // 동적으로 경로를 만들어 연다 — import 문이 아니라 문자열 조합이라 @vercel/nft
  // 의 파일 추적(import 를 따라간다)이 이 참조를 못 본다. ffmpeg-static 바이너리와
  // 정확히 같은 실패 모양(2026-08-13 프로덕션)이지만, 이쪽은 **에러조차 안 난다** —
  // libass 는 지정한 폰트가 없으면 조용히 기본 폰트로 대체할 뿐이라, 배포에서 폰트
  // 파일이 빠져도 합성은 "성공"하고 자막 글자만 두부(□□□)나 엉뚱한 글꼴로 나온다.
  outputFileTracingIncludes: {
    // 아바타 참조는 **104K** 뿐이고 쓰는 문이 40개다(lib/cast.js 의 avatarsDir).
    // 그 정도면 전역으로 두는 쪽이 싸고, 빠뜨릴 위험도 없앤다.
    "/*": ["assets/refs/**/*"],
    // 무거운 둘(ffmpeg 80MB · 자막 폰트 30MB)은 **합성이 도는 문에만**.
    ...Object.fromEntries(
      composeRouteKeys().map((route) => [
        route,
        ["node_modules/ffmpeg-static/**/*", "assets/subtitle-*"],
      ])
    ),
  },
};

export default nextConfig;
