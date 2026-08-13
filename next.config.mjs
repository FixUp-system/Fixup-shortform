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
  // ★ 키는 **라우트 글롭**이다(Next 문서). 라우트를 하나씩 적지 않고 `/*`(전 라우트)로
  //   덮는다 — 합성을 부르는 라우트가 여럿이고(render·subtitle·clips…) 새 라우트가 생길
  //   때 빠뜨리기 때문이다. 네이티브 바이너리를 싣는 문서의 권장 패턴도 이 모양이다
  //   (`'/*': ['node_modules/sharp/**/*']`).
  outputFileTracingIncludes: {
    "/*": ["node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;
