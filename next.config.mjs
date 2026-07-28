/** @type {import('next').NextConfig} */
const nextConfig = {
  // ffmpeg-static 은 번들에 넣지 않는다.
  // 이 패키지는 `path.join(__dirname, "ffmpeg.exe")` 로 실행 파일 자리를 잡는데, 번들에
  // 끌려 들어가면 __dirname 이 .next/server/vendor-chunks 가 되고 바이너리는 따라가지
  // 않는다 — 합성이 시작되자마자 ENOENT 로 죽는다. 외부로 빼면 실행 시점에 node 가
  // node_modules 에서 직접 불러 __dirname 이 제자리를 가리킨다.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
