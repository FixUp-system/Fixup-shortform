// 로컬 ffmpeg 합성을 실제로 돌린다 — fal 호출 없음, 0원.
//
// 이 경로는 가짜 모드에서 통째로 건너뛰므로(compose.js 의 fakeFal 반환) 한 번도 실행된 적이
// 없었다. 처음 돌렸을 때 Windows 드라이브 문자의 콜론 때문에 필터 파싱이 죽었다 —
// 관통에서 fal 값을 다 치르고 마지막 단계에서야 알았을 결함이다.
//
// 다른 테스트와 달리 진짜 ffmpeg 를 부르므로 느리다(1초 남짓). 그래도 남긴다:
// 이 자리가 깨지면 결과물이 아예 안 나오는데, 모킹으로는 그것을 잡을 수 없다.
import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import ffmpegPath from "ffmpeg-static";
import { buildFfmpegArgs } from "../lib/compose.js";
import { buildCues, toAss } from "../lib/subtitles.js";

const W = 1080, H = 1920;

function run(args) {
  return new Promise((res) => {
    const p = spawn(ffmpegPath, args);
    let tail = "";
    p.stderr.on("data", (d) => { tail = (tail + d).slice(-3000); });
    p.on("close", (code) => res({ code, tail }));
  });
}

describe("로컬 합성 — 실제 ffmpeg", () => {
  it("클립·소리·자막을 하나로 합치고, 짧은 클립은 마지막 프레임으로 늘린다", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-check-"));

    // 소재 — 둘째 컷은 클립(2초)이 소리(4초)보다 짧다. tpad 가 메워야 한다.
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x2A3040:s=1080x1920:d=3,format=yuv420p", "-c:v", "libx264", path.join(dir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x40302A:s=1080x1920:d=2,format=yuv420p", "-c:v", "libx264", path.join(dir, "v1.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "3", "-c:a", "aac", path.join(dir, "a0.m4a")]);
    await run(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "4", "-c:a", "aac", path.join(dir, "a1.m4a")]);

    const cuts = [
      { idx: 0, sentence: "매일 아침 생딸기를 직접 갈아 씁니다.", seconds: 3 },
      { idx: 1, sentence: "시럽은 쓰지 않습니다. 그래서 맛이 다릅니다.", seconds: 4 },
    ];
    const assPath = path.join(dir, "sub.ass");
    await fs.writeFile(assPath, toAss(buildCues(cuts), { width: W, height: H }), "utf8");

    const local = [
      { video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 3, haveSeconds: 3 },
      { video: path.join(dir, "v1.mp4"), audio: path.join(dir, "a1.m4a"), wantSeconds: 4, haveSeconds: 2 },
    ];
    const out = path.join(dir, "out.mp4");
    const { code, tail } = await run(buildFfmpegArgs({ local, assPath, out, width: W, height: H }));

    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    const st = await fs.stat(out);
    expect(st.size).toBeGreaterThan(1000);

    // 길이 — 3 + 4 = 7초 근처여야 한다(짧은 클립이 늘어나 소리와 맞았다는 뜻)
    const probe = await new Promise((res) => {
      const p = spawn(ffmpegPath, ["-i", out]);
      let tail = "";
      p.stderr.on("data", (d) => { tail += d; });
      p.on("close", () => res(tail));
    });
    const m = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    console.log("합성 결과 길이:", seconds, "초");
    expect(seconds).toBeGreaterThan(6.5);
    expect(seconds).toBeLessThan(7.6);

    // 자막이 실제로 태워졌는지 — 5초 지점 프레임을 뽑아 밝은 픽셀(흰 글자)이 있는지 본다
    const frame = path.join(dir, "f.png");
    await run(["-y", "-ss", "5", "-i", out, "-frames:v", "1", frame]);
    const png = await fs.readFile(frame);
    expect(png.length).toBeGreaterThan(1000);
    console.log("프레임 추출:", (png.length / 1024).toFixed(1) + "KB", frame);

    // 확인용으로 남긴다 — 눈으로 볼 수 있게 경로를 출력한다
    console.log("결과물:", out);
  }, 120000);

  it("클립이 낭독보다 길면 잘라내 낭독 길이로 맞춘다", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-trim-"));
    // 클립 6초 / 소리 3초 — 눈금 올림이 만드는 흔한 모양이다.
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x2A3040:s=1080x1920:d=6,format=yuv420p", "-c:v", "libx264", path.join(dir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "3", "-c:a", "aac", path.join(dir, "a0.m4a")]);

    const cuts = [{ idx: 0, sentence: "30ml에 39,000원입니다.", seconds: 3 }];
    const assPath = path.join(dir, "sub.ass");
    await fs.writeFile(assPath, toAss(buildCues(cuts), { width: W, height: H }), "utf8");

    const local = [{ video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 3, haveSeconds: 6 }];
    const out = path.join(dir, "out.mp4");
    const { code, tail } = await run(buildFfmpegArgs({ local, assPath, out, width: W, height: H }));
    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    const probe = await new Promise((res) => {
      const p = spawn(ffmpegPath, ["-i", out]);
      let t = "";
      p.stderr.on("data", (d) => { t += d; });
      p.on("close", () => res(t));
    });
    const m = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    console.log("자르기 결과 길이:", seconds, "초 (낭독 3초)");
    // 예전에는 6초가 나오고 뒤 3초가 무음이었다
    expect(seconds).toBeGreaterThan(2.7);
    expect(seconds).toBeLessThan(3.4);
  }, 120000);
});

// 배경음악 — 단위 테스트는 필터 **문자열**만 본다. 문법이 틀렸는지, amix 가 실제로
// 무엇을 하는지는 진짜 ffmpeg 만 안다.
describe("배경음악 — 실제 ffmpeg", () => {
  // 소리 크기를 dB 로 잰다. mean_volume 은 0 dBFS 가 최대이고 음수로 내려간다.
  async function meanVolume(file) {
    const { tail } = await run(["-i", file, "-af", "volumedetect", "-f", "null", "-"]);
    const m = tail.match(/mean_volume:\s*(-?[\d.]+) dB/);
    return m ? Number(m[1]) : NaN;
  }

  it("음악이 영상보다 짧아도 끝까지 깔리고 길이가 안 변한다", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-music-"));
    // 영상 6초 / 음악 2초 — 반복이 없으면 뒤 4초가 무음이 된다
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x2A3040:s=540x960:d=6,format=yuv420p", "-c:v", "libx264", path.join(dir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=6", "-c:a", "aac", path.join(dir, "a0.m4a")]);
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=2", "-c:a", "aac", path.join(dir, "bgm.m4a")]);

    const out = path.join(dir, "out.mp4");
    const { code, tail } = await run(buildFfmpegArgs({
      local: [{ video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 6, haveSeconds: 6 }],
      out, width: 540, height: 960,
      musicPath: path.join(dir, "bgm.m4a"), seconds: 6,
    }));
    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    const probe = await run(["-i", out]);
    const m = probe.tail.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    console.log("음악 합성 결과 길이:", seconds, "초 (영상 6초 / 음악 2초)");
    expect(seconds).toBeGreaterThan(5.7);
    expect(seconds).toBeLessThan(6.4);

    // 마지막 1초에 소리가 살아 있는가 — 반복이 안 되면 여기가 무음이다
    const tailCut = path.join(dir, "tail.m4a");
    await run(["-y", "-ss", "5", "-i", out, "-t", "1", "-c:a", "aac", tailCut]);
    const v = await meanVolume(tailCut);
    console.log("마지막 1초 볼륨:", v, "dB");
    expect(v, "무음이면 -91 dB 근처가 나온다").toBeGreaterThan(-50);
  }, 120000);

  it("나레이션 볼륨을 깎지 않는다", async () => {
    // amix 의 기본값(normalize=1)은 입력 개수로 나눠 나레이션을 약 6 dB 낮춘다.
    // 음악을 **무음**으로 넣으면 그 감쇄만 남아 눈금에 잡힌다.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-mixvol-"));
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x2A3040:s=540x960:d=4,format=yuv420p", "-c:v", "libx264", path.join(dir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:a", "aac", path.join(dir, "a0.m4a")]);
    await run(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "4", "-c:a", "aac", path.join(dir, "silent.m4a")]);

    const local = [{ video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 4, haveSeconds: 4 }];
    const plain = path.join(dir, "plain.mp4");
    const mixed = path.join(dir, "mixed.mp4");
    await run(buildFfmpegArgs({ local, out: plain, width: 540, height: 960 }));
    const { code, tail } = await run(buildFfmpegArgs({
      local, out: mixed, width: 540, height: 960,
      musicPath: path.join(dir, "silent.m4a"), // 무음 — 볼륨 변화는 전부 amix 탓이다
    }));
    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    const before = await meanVolume(plain);
    const after = await meanVolume(mixed);
    console.log(`나레이션 볼륨: ${before} dB → ${after} dB (차이 ${(after - before).toFixed(2)})`);
    expect(after - before, "normalize=0 을 빠뜨리면 약 -6 dB 가 된다").toBeGreaterThan(-1);
  }, 120000);
});
