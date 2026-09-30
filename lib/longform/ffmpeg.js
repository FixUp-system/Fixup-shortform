// ffmpeg — 닻 프레임을 뽑고, 두 구간을 잇는다. 로컬이라 0원이다.
//
// ★ 인자는 순수 함수다(테스트가 잰다) — lib/compose.js 가 buildFfmpegArgs 를 따로 두는 것과
//   같은 방식. 실행기는 얇게 둔다.
// ★ 이어 붙이기는 `-c copy` — 두 구간이 **같은 모델·같은 화질**이면 재인코딩 없이 붙는다.
//   이음새는 하드컷이다(스펙 「축 2」 층③: 경계를 장면 전환에 맞췄으니 하드컷이 문법이다).
//   화질이 다르면 ffmpeg 가 실패한다 — 그래서 화질은 plan 단계에서 한 번 정하고 두 구간이 같이 쓴다.
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export function frameAtArgs({ input, at, out }) {
  return ["-y", "-ss", String(at), "-i", input, "-frames:v", "1", "-q:v", "2", out];
}

export function lastFrameArgs({ input, out }) {
  return ["-y", "-sseof", "-0.1", "-i", input, "-update", "1", "-frames:v", "1", "-q:v", "2", out];
}

export function concatList(files) {
  return files
    .map((f) => `file '${String(f).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n") + "\n";
}

export function joinArgs({ list, out }) {
  return ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out];
}

export function runFfmpeg(args, { bin = ffmpegPath, spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawnImpl(bin, args);
    let err = "";
    p.stderr?.on("data", (d) => {
      err += String(d);
      if (err.length > 8000) err = err.slice(-8000);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0
      ? resolve()
      : reject(new Error(`ffmpeg 실패(${code}): ${err.slice(-600)}`))));
  });
}
