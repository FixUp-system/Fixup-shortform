// ffmpeg 바이너리가 번들에 휩쓸려 들어가면 안 된다.
//
// ffmpeg-static 은 `path.join(__dirname, "ffmpeg.exe")` 로 실행 파일 자리를 잡는다.
// Next 가 이 모듈을 서버 번들(.next/server/vendor-chunks)로 끌어들이면 __dirname 이
// 그 폴더로 바뀌는데 바이너리는 따라가지 않는다 — 실행 시점에 ENOENT 로 죽는다:
//
//   spawn C:\...\.next\server\vendor-chunks\ffmpeg.exe ENOENT
//
// 유닛 테스트는 번들링을 거치지 않아 이 결함을 재현할 수 없다(그래서 tests/compose-live
// 가 통과하는데도 앱에서는 합성이 죽었다). 잡을 수 있는 것은 이 결함을 막는
// 설정 한 줄이 사라지는 것이므로, 그것을 지킨다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("ffmpeg-static 은 서버 번들에서 빠져 있어야 한다", () => {
  const config = readFileSync(path.join(process.cwd(), "next.config.mjs"), "utf8");

  it("next.config 이 ffmpeg-static 을 외부 패키지로 선언한다", () => {
    expect(config).toMatch(/serverExternalPackages/);
    expect(config).toMatch(/["']ffmpeg-static["']/);
  });

  it("실행 파일이 node_modules 자리에 그대로 있다 — 번들이 아니라 여기서 부른다", async () => {
    const { default: ffmpegPath } = await import("ffmpeg-static");
    expect(ffmpegPath).toContain("node_modules");
    expect(() => readFileSync(ffmpegPath)).not.toThrow();
  });
});
