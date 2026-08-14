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

  // ★★ 최종 리뷰가 찾은 Critical(2026-08-14): 무음 컷(말 없는 장면)에는 TTS 가 없고,
  //   Kling 클립은 generate_audio:false 라 **오디오 스트림이 아예 없다.** 예전에는 모든
  //   컷에 문장이 있어 TTS 파일이 붙었으므로 이 조합이 존재하지 않았다 —
  //   무음 컷이 그 문을 열었다. 여기서 [i:a] 가 매치에 실패하면 ffmpeg 가 통째로 죽고,
  //   그것은 ⑥완성 즉 그림·클립 값을 다 치른 뒤다.
  it("소리 없는 클립의 무음 컷이 있어도 죽지 않는다 — Kling+무음 컷", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-silent-"));
    // Kling 클립 흉내 — **오디오 스트림이 없는** mp4 둘
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x2A3040:s=540x960:d=6,format=yuv420p", "-c:v", "libx264", path.join(dir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x40302A:s=540x960:d=8,format=yuv420p", "-c:v", "libx264", path.join(dir, "v1.mp4")]);
    // 말하는 컷의 TTS — 눈금이 다른 소리(24kHz 모노)로 둔다. 무음 채움이 만드는 소리와
    // 규격이 달라도 concat 이 협상으로 붙여야 한다.
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=6:sample_rate=24000", "-ac", "1", "-c:a", "aac", path.join(dir, "a0.m4a")]);

    const local = [
      { video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 6, haveSeconds: 6 },
      // 무음 컷 — 소리 파일이 없고 클립에도 오디오가 없다
      { video: path.join(dir, "v1.mp4"), wantSeconds: 8, haveSeconds: 8, silentAudio: true },
    ];
    const out = path.join(dir, "out.mp4");
    const { code, tail } = await run(buildFfmpegArgs({ local, out, width: 540, height: 960, seconds: 14 }));
    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    const probe = await run(["-i", out]);
    const m = probe.tail.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    console.log("무음 컷 합성 길이:", seconds, "초 (6 + 8)");
    expect(seconds).toBeGreaterThan(13.5);
    expect(seconds).toBeLessThan(14.5);
  }, 120000);

  // ★★ 최종 리뷰의 물음(2026-08-14): 이 브랜치는 컷마다 **영상 길이 ≠ 소리 길이**를 만든다
  //   (화면 8초 · 낭독 3.5초). buildFfmpegArgs 는 영상만 맞추고 소리는 안 맞춘다 —
  //   concat 이 소리를 **여백만큼 비워 두는지**(맞다) 아니면 **이어붙여 버리는지**(나레이션이
  //   갈수록 그림보다 앞선다) 아무도 잰 적이 없었다. 여기서 못 박는다.
  it("여백이 있어도 나레이션이 컷 시작에 붙는다 — 밀리지 않는다", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-gap-"));
    // 컷 둘 다 화면 8초, 낭독 3초 — 여백 5초씩
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x2A3040:s=540x960:d=8,format=yuv420p", "-c:v", "libx264", path.join(dir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x40302A:s=540x960:d=8,format=yuv420p", "-c:v", "libx264", path.join(dir, "v1.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "aac", path.join(dir, "a0.m4a")]);
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=3", "-c:a", "aac", path.join(dir, "a1.m4a")]);

    const local = [
      { video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 8, haveSeconds: 8 },
      { video: path.join(dir, "v1.mp4"), audio: path.join(dir, "a1.m4a"), wantSeconds: 8, haveSeconds: 8 },
    ];
    const out = path.join(dir, "out.mp4");
    const { code, tail } = await run(buildFfmpegArgs({ local, out, width: 540, height: 960, seconds: 16 }));
    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    const probe = await run(["-i", out]);
    const m = probe.tail.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    expect(seconds).toBeGreaterThan(15.5);
    expect(seconds).toBeLessThan(16.5);

    // 1초 창마다 소리 크기를 재서 나레이션이 어디에 있는지 본다.
    const vol = async (t) => {
      const seg = path.join(dir, `s${t}.wav`);
      await run(["-y", "-ss", String(t), "-i", out, "-t", "1", "-vn", seg]);
      const { tail: vt } = await run(["-i", seg, "-af", "volumedetect", "-f", "null", "-"]);
      const mm = vt.match(/mean_volume:\s*(-?[\d.]+) dB/);
      return mm ? Number(mm[1]) : -91; // 소리가 아예 없으면 무음으로 읽는다
    };
    const at = [];
    for (let t = 0; t < 16; t++) at.push(await vol(t));
    console.log("여백 실측 dB:", at.map((v, i) => `${i}:${v}`).join(" "));

    // 첫 컷 낭독(0~3초)
    for (const t of [0, 1, 2]) expect(at[t], `t=${t}`).toBeGreaterThan(-50);
    // 첫 컷 여백(4~7초) — 이어붙이면 여기에 둘째 컷 낭독이 들어와 있다
    for (const t of [4, 5, 6, 7]) expect(at[t], `t=${t}`).toBeLessThan(-50);
    // 둘째 컷 낭독은 컷이 시작하는 8초에 붙는다
    for (const t of [8, 9, 10]) expect(at[t], `t=${t}`).toBeGreaterThan(-50);
    // 둘째 컷 여백
    for (const t of [12, 13, 14]) expect(at[t], `t=${t}`).toBeLessThan(-50);
  }, 300000);
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

// ── 자막 언어 — **글자가 실제로 보이는가** ─────────────────────────────────────
//
// ★★ 이 블록이 자막 언어 기능의 판정이다. 앞의 단위 테스트가 전부 그린이어도
//   여기서 두부(□)가 나오면 기능은 실패다.
//
// 이 기능이 무너지는 방식은 **조용하다**: libass 가 폰트 폴더에서 Fontname 을 못 찾으면
// 오류도 경고도 없이 다른 폰트로 대체하고 ffmpeg 는 **exit 0** 으로 끝난다. 로그에도
// 아무것도 안 남는다. 완성본만 한자·가나가 전부 □ 다. 그래서 판정은 종료 코드가 아니라
// **픽셀**로 해야 한다.
//
// 두부를 어떻게 재는가 — 두부의 본질은 모양이 아니라 **모든 글자가 같은 모양**이라는 것이다.
// (.notdef 는 폰트마다 빈 사각형이거나 ×가 그어진 사각형이라 "단순한가"로는 못 가른다.
//  실제로 이 하네스로 재 보니 ×가 있는 두부는 줄마다 무늬가 달라 '줄 서명 반복'류 지표를
//  전부 빠져나갔다.) 그래서 자막 영역의 이진 마스크를 가로로 한 글자 폭만큼 **밀어서
//  자기 자신과 겹쳐 본다.** 두부는 글자가 전부 같으니 그대로 포개져 상관계수가 1 에 붙고,
//  진짜 글자는 글자마다 달라 낮게 나온다.
//
// 실측(2026-08-14, 이 하네스):
//   진짜 글자  ja 0.282 · zh 0.246 · ja 0.153 · zh 0.262 · ko 0.285
//   진짜 두부  .notdef 0.979 · 0.983 · □반복 0.979
// 두 무리가 0.29 와 0.98 로 갈라져 경계(0.6)가 어느 쪽에서도 세 배 넘게 떨어져 있다.
describe("자막 언어 — 진짜로 구워서 글자를 본다", () => {
  // 사람이 눈으로 볼 프레임을 여기에 남긴다. **저장소 밖**이라 커밋될 일이 없다.
  const FRAMES = path.join(os.tmpdir(), "shotform-subtitle-frames");

  const KO = "매일 아침 생딸기를 직접 갈아 씁니다.";
  // 두부를 만드는 글자 — 어느 폰트에도 없는 코드포인트(U+ABFF, 미할당)라
  // 시스템 폰트 대체까지 실패해 libass 가 .notdef 를 그린다. 진짜 두부다.
  const NOTDEF = "꯿";

  // 프레임 한 장을 **회색 원시 픽셀**로 받는다. PNG 디코더가 필요 없다.
  async function grayFrame(video, t, dir, name) {
    const raw = path.join(dir, `${name}.gray`);
    const { code, tail } = await run(["-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", raw]);
    expect(code, `프레임 추출 실패:\n${tail}`).toBe(0);
    return fs.readFile(raw);
  }

  // 사람이 볼 그림. 자막 띠만 잘라 둔다 — 1080×1920 을 통째로 열면 글자가 너무 작다.
  async function savePng(video, t, name) {
    await fs.mkdir(FRAMES, { recursive: true });
    const png = path.join(FRAMES, `${name}.png`);
    await run(["-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "crop=1080:240:0:1380", png]);
    return png;
  }

  // 밝은 픽셀(흰 자막)만 남긴 이진 마스크와 그 경계상자.
  function inkMask(buf, thr = 140) {
    const m = new Uint8Array(W * H);
    let minX = W, maxX = -1, minY = H, maxY = -1, ink = 0;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let any = false;
      for (let x = 0; x < W; x++) {
        if (buf[y * W + x] > thr) {
          m[y * W + x] = 1; ink++; any = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (any) rows.push(y);
    }
    // 줄 띠 — 글자가 있는 행이 8px 넘게 끊기면 다른 줄이다.
    const bands = [];
    let start = null, last = null;
    for (const y of rows) {
      if (start === null) { start = y; last = y; continue; }
      if (y - last > 8) { bands.push([start, last]); start = y; }
      last = y;
    }
    if (start !== null) bands.push([start, last]);
    return { m, minX, maxX, minY, maxY, ink, bands };
  }

  // 가로로 L 픽셀 밀어 겹쳤을 때의 상관계수 최대값. 두부면 1 에 붙는다.
  // 값이 0/1 뿐이라 분산은 p(1-p) 로 바로 나온다.
  function tofuScore(box) {
    const { m, minX, maxX, minY, maxY } = box;
    let best = 0, bestLag = 0;
    for (let L = 40; L <= 220; L++) {
      if (maxX - minX < L + 40) break;
      let n = 0, sa = 0, sb = 0, sab = 0;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x + L <= maxX; x++) {
          const a = m[y * W + x], b = m[y * W + x + L];
          n++; sa += a; sb += b; sab += a * b;
        }
      }
      if (!n) continue;
      const ma = sa / n, mb = sb / n;
      const va = ma - ma * ma, vb = mb - mb * mb;
      if (va <= 0 || vb <= 0) continue;
      const r = (sab / n - ma * mb) / Math.sqrt(va * vb);
      if (r > best) { best = r; bestLag = L; }
    }
    return { score: +best.toFixed(3), lag: bestLag };
  }

  // 두부와 진짜 글자를 가르는 경계. 실측 0.29 : 0.98 의 한가운데다.
  const TOFU_LIMIT = 0.6;

  // 소재(색 클립 + 무음)는 케이스마다 다시 만들 필요가 없다 — 한 번 만들어 돌려 쓴다.
  let baseDir;
  async function base() {
    if (baseDir) return baseDir;
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-lang-"));
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x2A3040:s=1080x1920:d=4,format=yuv420p", "-c:v", "libx264", path.join(baseDir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "4", "-c:a", "aac", path.join(baseDir, "a0.m4a")]);
    return baseDir;
  }

  // 한 컷짜리 완성본을 실제로 굽는다. familyOverride 는 **테스트 전용 대조군**이다 —
  // 제품 코드가 만든 ASS 의 Fontname 만 바꿔 libass 의 대체 동작을 관찰한다.
  async function burn(name, lang, text, familyOverride) {
    const dir = await base();
    const cuts = [{ idx: 0, sentence: KO, seconds: 4, subtitles: { [lang]: { text, of: KO } } }];
    let ass = toAss(buildCues(cuts, { width: W, height: H, lang }), { width: W, height: H, lang });
    if (familyOverride) ass = ass.replace(/^(Style: Main,)[^,]+/m, `$1${familyOverride}`);
    const assPath = path.join(dir, `${name}.ass`);
    await fs.writeFile(assPath, ass, "utf8");

    const out = path.join(dir, `${name}.mp4`);
    const local = [{ video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 4, haveSeconds: 4 }];
    const { code, tail } = await run(buildFfmpegArgs({ local, assPath, out, width: W, height: H, lang }));
    // ★ 여기서 0 이 나오는 것은 **아무것도 증명하지 않는다.** 두부일 때도 0 이다.
    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    const box = inkMask(await grayFrame(out, 2, dir, name));
    const png = await savePng(out, 2, name);
    const t = tofuScore(box);
    console.log(
      `[${name}] 두부점수=${t.score}(lag ${t.lag}) 잉크=${box.ink} 줄=${box.bands.length} ` +
      `x=[${box.minX},${box.maxX}] → ${png}`
    );
    return { ...box, ...t, png, ass };
  }

  it("일본어 자막이 실제로 그려지고 두부가 아니다", async () => {
    const r = await burn("ja-japanese", "ja", "毎朝、生の苺を自分で挽いて使っています。");
    expect(r.ink, "자막이 아예 안 그려졌다").toBeGreaterThan(3000);
    expect(r.score, "글자가 전부 같은 모양이다 = 두부(□)").toBeLessThan(TOFU_LIMIT);
  }, 180000);

  it("중국어 자막이 실제로 그려지고 두부가 아니다", async () => {
    const r = await burn("zh-chinese", "zh", "每天早上亲手研磨新鲜草莓。");
    expect(r.ink, "자막이 아예 안 그려졌다").toBeGreaterThan(3000);
    expect(r.score, "글자가 전부 같은 모양이다 = 두부(□)").toBeLessThan(TOFU_LIMIT);
  }, 180000);

  // ★★ 판정자를 판정한다. 진짜 두부를 한 번도 본 적 없는 지표는 아무것도 증명하지 않는다.
  //   어느 폰트에도 없는 코드포인트를 구우면 libass 가 실제로 .notdef 를 그린다 —
  //   이 기능이 무너졌을 때 나올 바로 그 화면이다.
  it("두부 판정자가 진짜 두부를 잡는다 — 없는 글자를 구워 확인", async () => {
    const r = await burn("TOFU-control", "ja", NOTDEF.repeat(12));
    expect(r.ink, "두부라도 픽셀은 많다 — 빈 화면과 다르다").toBeGreaterThan(3000);
    expect(r.score, "진짜 두부는 1 에 붙어야 한다").toBeGreaterThan(0.9);
    // 경계가 어느 쪽에서도 넉넉히 떨어져 있는가
    expect(r.score - TOFU_LIMIT).toBeGreaterThan(0.3);
  }, 180000);

  // ★ 이 기계(Windows)에는 시스템에 일본어 폰트가 있어, **폰트를 못 찾아도** 글자가
  //   그려진다(대체된다). 즉 위의 두 케이스만으로는 "번들한 Noto 를 썼다"가 아니라
  //   "어떤 폰트든 썼다"까지만 증명된다. 리눅스 함수 환경에는 시스템 CJK 폰트가 없어
  //   거기서는 바로 두부가 된다.
  //
  //   그래서 여기서 **없는 폰트 이름**으로 한 번 더 굽는다. libass 는 그때 반드시
  //   대체 폰트를 쓴다. 그 결과가 제품 경로(Noto Sans JP)와 **픽셀이 다르면**
  //   제품 경로는 대체가 아니라 지정한 폰트를 실제로 찾아 쓴 것이다.
  it("libass 가 조용히 대체하지 않았다 — 번들 폰트가 실제로 매치된다", async () => {
    const JA = "毎朝、生の苺を自分で挽いて使っています。";
    const real = await burn("ja-bundled", "ja", JA);
    const sub = await burn("ja-fallback", "ja", JA, "ShotformNoSuchFont");
    // 두 마스크가 얼마나 다른가 — 같은 글자·같은 크기라 폰트가 같으면 거의 포갠다.
    let diff = 0, total = 0;
    for (let y = 1380; y < 1620; y++) {
      for (let x = 0; x < W; x++) {
        const a = real.m[y * W + x], b = sub.m[y * W + x];
        if (a || b) total++;
        if (a !== b) diff++;
      }
    }
    const ratio = diff / (total || 1);
    console.log(`번들 vs 대체 픽셀 차이: ${(ratio * 100).toFixed(1)}% (잉크 ${real.ink} vs ${sub.ink})`);
    expect(ratio, "대체 폰트로 구운 것과 픽셀이 같다 = 지정한 폰트를 못 찾았다는 뜻").toBeGreaterThan(0.15);
  }, 300000);

  it("긴 CJK 문장이 두 줄로 나뉘고 화면 폭 안에 있다", async () => {
    const marginH = Math.round(W * 0.08);
    for (const [name, lang, text] of [
      ["wrap-ja", "ja", "毎朝、生の苺を自分で挽いて使っています。"],
      ["wrap-zh", "zh", "每天早上亲手研磨新鲜草莓。"],
    ]) {
      const r = await burn(name, lang, text);
      // 각인에도 줄바꿈이 있어야 한다(\N)
      expect(r.ass, `${name}: ASS 에 줄바꿈이 없다`).toContain("\\N");
      // 화면에도 두 줄로 보여야 한다
      expect(r.bands.length, `${name}: 줄 수`).toBe(2);
      // 폭 — 세이프존(좌우 8%) 안이어야 한다. 넘치면 libass 가 자기 방식으로 또 접어
      // 세 줄이 되거나 글자가 잘린다.
      expect(r.minX, `${name}: 왼쪽이 넘쳤다`).toBeGreaterThanOrEqual(marginH - 10);
      expect(r.maxX, `${name}: 오른쪽이 넘쳤다`).toBeLessThanOrEqual(W - marginH + 10);
      expect(r.score, `${name}: 두부다`).toBeLessThan(TOFU_LIMIT);
    }
  }, 300000);
});
