// 구운 컷 아홉을 **프로덕션 합성기로** 잇는다 — 컷 경계 페이드까지 그대로.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/compose-with-fades.mjs
//
// ★ buildFfmpegArgs(lib/compose.js)를 **그대로 부른다.** 앞서 내가 쓴 단순 concat 은
//   전환이 뚝뚝 끊긴다 — 페이드를 여기서 베끼면 두 벌이 된다.
// ★ 우리 클립은 소리가 클립 안에 있다(Seedance speaks:true) → local 항목에 audio 가 없다
//   → fit=false → **트림을 안 한다**(프로덕션 규약: "자르는 순간 문장 끝이 사라진다").
//   그래서 완성본이 시나리오 초(30)가 아니라 굽기 초 합(36)이 된다. 그것까지 재는 것이 목적.
// 값 0 — 로컬 ffmpeg 만 쓴다.
import { readFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { buildFfmpegArgs } from "../../lib/compose.js";
import ffmpegPath from "ffmpeg-static";

const prompts = JSON.parse(readFileSync("reel-clip-prompts.json", "utf8"));
const have = prompts.filter((p) => existsSync(`clip-cut${p.n}.mp4`));

// 클립 실제 길이를 ffprobe 대신 ffmpeg 로 읽는다(ffprobe 가 이 패키지에 없다).
function durationOf(file) {
  try {
    execFileSync(ffmpegPath, ["-i", file, "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const m = String(e.stderr || "").match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  const out = execFileSync(ffmpegPath, ["-i", file, "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  const m = String(out).match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

const local = have.map((p) => {
  const video = `clip-cut${p.n}.mp4`;
  const haveSeconds = durationOf(video);
  // audio 를 안 넣는다 — 이 클립들은 소리를 스스로 들고 있다(위 ★ 참고).
  return { video, wantSeconds: p.seconds, haveSeconds };
});

const seconds = local.reduce((s, l) => s + (l.haveSeconds || l.wantSeconds), 0);
console.log("컷별 (주문 → 실제):");
local.forEach((l, i) => console.log(`  ${i + 1}. ${l.wantSeconds}초 → ${l.haveSeconds.toFixed(2)}초`));
console.log(`총 ${seconds.toFixed(2)}초\n`);

const args = buildFfmpegArgs({
  local, assPath: null, out: "reel-final-faded.mp4",
  width: 496, height: 864, seconds,
});
console.log("ffmpeg 실행 …");
execFileSync(ffmpegPath, ["-v", "error", "-y", ...args]);
console.log("완성: reel-final-faded.mp4");
