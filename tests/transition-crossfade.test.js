// 컷 사이 전환 — 딱 잘라 붙이던 자리를 부드럽게 만든다.
//
// ★★ 이 기능의 하드 제약은 **총 길이 불변**이다.
//
// 자막(lib/subtitles.js 의 buildCues)이 컷 시작 시각을 누적으로 계산해 태우고, 낭독 소리는
// concat 이 컷 시작에 붙여 놓는다. 겹치는 전환(xfade·acrossfade)은 겹친 만큼 타임라인을
// **줄이므로**, 영상만 줄고 소리·자막은 그대로여서 뒤로 갈수록 어긋난다. 그래서 이 저장소는
// **겹치지 않는 전환**을 고른다: 컷 끝을 어둡게 하고 다음 컷 시작을 밝힌다(dip to black).
// fade 필터는 프레임을 지우지도 더하지도 않아 길이를 한 프레임도 바꾸지 않는다.
//
// 아래 테스트는 그 성질을 두 층에서 못 박는다:
//  ① 인자 층 — 경계마다 fade 가 붙고, 길이를 정하는 인자(tpad·trim·concat)는 그대로다
//  ② 실제 ffmpeg — 파일 길이가 컷 합과 같고, 경계 프레임이 실제로 어두워진다
import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import ffmpegPath from "ffmpeg-static";
import { buildFfmpegArgs, composeVideo, TRANSITION_SECONDS } from "../lib/compose.js";

const graphOf = (args) => args[args.indexOf("-filter_complex") + 1];
// 한쪽 길이 — 전환 전체가 TRANSITION_SECONDS 이고 앞 컷 끝과 뒤 컷 시작이 절반씩 나눈다.
const SIDE = TRANSITION_SECONDS / 2;
const s2 = (n) => n.toFixed(2);

const cut = (i, want, have = want) => ({
  video: `/t/${i}.mp4`, audio: `/t/${i}.m4a`, wantSeconds: want, haveSeconds: have,
});
const base = { out: "/t/o.mp4", width: 1080, height: 1920 };

describe("전환 상수", () => {
  it("한 자리에 있고 숏폼에 맞는 길이다", () => {
    // 숏폼이라 길면 늘어진다 — 통상 0.2~0.4초다. 값이 코드에 흩어지면 갈린다.
    expect(TRANSITION_SECONDS).toBeGreaterThanOrEqual(0.2);
    expect(TRANSITION_SECONDS).toBeLessThanOrEqual(0.4);
  });
});

describe("컷 경계에 전환이 붙는다", () => {
  it("가운데 컷은 들어올 때 밝아지고 나갈 때 어두워진다", () => {
    const graph = graphOf(buildFfmpegArgs({
      ...base, local: [cut(0, 4), cut(1, 5), cut(2, 6)],
    }));
    // 컷1 = 앞뒤로 경계가 하나씩
    expect(graph).toContain(`fade=t=in:st=0:d=${s2(SIDE)},fade=t=out:st=${s2(5 - SIDE)}:d=${s2(SIDE)}[v1]`);
  });

  it("첫 컷은 밝아지지 않고 마지막 컷은 어두워지지 않는다", () => {
    // 총 길이는 그래도 같지만, 영상이 검게 시작하고 검게 끝나면 첫 프레임·마지막
    // 프레임이 사라진다 — 그것은 전환이 아니라 인트로·아웃트로다.
    const graph = graphOf(buildFfmpegArgs({
      ...base, local: [cut(0, 4), cut(1, 5)],
    }));
    expect(graph).toContain(`setsar=1,fade=t=out:st=${s2(4 - SIDE)}:d=${s2(SIDE)}[v0]`);
    expect(graph).toContain(`setsar=1,fade=t=in:st=0:d=${s2(SIDE)}[v1]`);
    expect(graph).not.toContain("[v1]fade");
  });

  it("컷이 하나면 전환이 아예 없다 — 경계가 없다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, local: [cut(0, 4)] }));
    expect(graph).not.toContain("fade");
  });

  it("소리 파일 없는 말하는 컷·무음 컷에도 붙는다 — 경계는 소리와 무관하다", () => {
    const graph = graphOf(buildFfmpegArgs({
      ...base,
      local: [
        { video: "/t/0.mp4", wantSeconds: 3, haveSeconds: 4 },            // 말하는 클립
        { video: "/t/1.mp4", wantSeconds: 8, haveSeconds: 8, silentAudio: true }, // 무음 컷
      ],
    }));
    // 말하는 컷은 안 잘리므로 화면 시간이 클립 길이(4초)다
    expect(graph).toContain(`fade=t=out:st=${s2(4 - SIDE)}:d=${s2(SIDE)}[v0]`);
    expect(graph).toContain(`fade=t=in:st=0:d=${s2(SIDE)}[v1]`);
  });

  it("아주 짧은 컷에서는 전환이 함께 짧아진다", () => {
    // 0.4초 컷에 0.15초씩 걸면 컷의 3/4 가 어둡다. 컷의 1/4 를 넘지 않게 줄인다.
    const graph = graphOf(buildFfmpegArgs({
      ...base, local: [cut(0, 0.4), cut(1, 4)],
    }));
    expect(graph).toContain(`fade=t=out:st=${s2(0.4 - 0.1)}:d=${s2(0.1)}[v0]`);
  });

  it("컷 길이를 모르면 전환을 걸지 않는다", () => {
    // 시작점을 계산할 수 없다 — 잘못된 시작점은 화면을 통째로 검게 만든다.
    // (같은 결: 길이를 모르면 음악 페이드도 안 건다)
    const graph = graphOf(buildFfmpegArgs({
      ...base,
      local: [
        { video: "/t/0.mp4", audio: "/t/0.m4a", wantSeconds: 0, haveSeconds: 0 },
        cut(1, 4),
      ],
    }));
    expect(graph).not.toContain("fade=t=out");
    // 뒤 컷은 시작점이 0 이라 계산할 것이 없다 — 그쪽은 그대로 붙는다
    expect(graph).toContain(`fade=t=in:st=0:d=${s2(SIDE)}[v1]`);
  });
});

// ★★ 이 기능의 유일한 하드 제약. 여기가 깨지면 자막과 소리가 뒤로 갈수록 어긋난다.
describe("총 길이가 변하지 않는다", () => {
  const local = [cut(0, 3, 6), cut(1, 5, 4)];

  it("길이를 정하는 인자가 그대로다 — fade 는 프레임을 지우지 않는다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, local }));
    // 자르기·늘리기·이어붙이기가 전환 앞뒤로 한 글자도 안 바뀐다
    expect(graph).toContain("trim=duration=3.00");
    expect(graph).toContain("tpad=stop_mode=clone:stop_duration=1.00");
    expect(graph).toContain("concat=n=2:v=1:a=1[cv][ca]");
    // 겹치는 전환은 쓰지 않는다 — 겹친 만큼 총 길이가 줄어든다
    expect(graph).not.toContain("xfade");
    expect(graph).not.toContain("acrossfade");
  });

  it("전환은 컷 길이 **안에서** 일어난다 — 밖으로 넘지 않는다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, local }));
    // 첫 컷은 3초로 잘리므로 어두워지는 구간이 3초 안에서 끝나야 한다
    expect(graph).toContain(`fade=t=out:st=${s2(3 - SIDE)}:d=${s2(SIDE)}`);
    expect(graph).not.toContain("st=3.00");
  });

  it("composeVideo 가 보고하는 길이가 그대로다 — 자막이 같은 값을 본다", async () => {
    const cuts = [
      { idx: 0, sentence: "첫", seconds: 4, video: { url: "/v0", seconds: 6 }, audio: { url: "/a0", seconds: 4 } },
      { idx: 1, sentence: "둘", seconds: 5, video: { url: "/v1", seconds: 6 }, audio: { url: "/a1", seconds: 5 } },
    ];
    const r = await composeVideo({
      projectId: "p1", cuts, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    expect(r.seconds).toBe(9);   // 전환이 붙어도 4 + 5 다
  });

  it("자막 시작 시각이 그대로다 — 컷 시작 누적이 안 밀린다", async () => {
    let ass = "";
    await composeVideo({
      projectId: "p1", aspect_ratio: "9:16",
      cuts: [
        { idx: 0, sentence: "첫 문장.", seconds: 4, video: { url: "/v0", seconds: 4 }, audio: { url: "/a0", seconds: 4 } },
        { idx: 1, sentence: "둘째 문장.", seconds: 5, video: { url: "/v1", seconds: 5 }, audio: { url: "/a1", seconds: 5 } },
      ],
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async (_p, body) => { ass = body; },
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    // 둘째 자막은 여전히 4.00 초에 시작한다(겹치는 전환이면 3.7 쯤으로 앞당겨진다)
    expect(ass).toContain("0:00:04.00");
  });
});

// 소리 — 영상만 부드럽고 소리가 딱 끊기면 오히려 더 어색하다.
//
// 겹치지 않는 전환이라 **소리는 이어진 채 그대로 흐른다**: concat 이 아무것도 버리지
// 않고, 배경음악은 이어붙인 뒤 한 번만 섞이므로(amix) 경계를 그대로 관통한다.
// 눈은 박자를 받고 귀는 이어진다.
//
// ★ 나레이션에는 일부러 페이드를 걸지 않는다 — 소리 파일이 있는 컷의 화면 시간이 곧
//   낭독 길이라(lib/subtitles.js 의 cutSeconds) 컷 끝에서 소리를 줄이면 마지막 음절이
//   깎인다. 자막은 그 말을 그대로 보여 주고 있어 눈과 귀가 어긋난다.
describe("소리는 끊기지 않고 이어진다", () => {
  const local = [cut(0, 4), cut(1, 5)];

  it("소리 사슬에는 손대지 않는다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, local }));
    expect(graph).toContain("[1:a]anull[a0]");
    expect(graph).toContain("[3:a]anull[a1]");
    // 나레이션을 줄이지 않는다 — 마지막 음절이 깎인다
    expect(graph).not.toContain("afade");
  });

  it("배경음악은 경계를 관통한다 — 컷마다 깔지 않는다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, local, musicPath: "/t/bgm.mp3", seconds: 9 }));
    expect(graph.split("amix").length).toBe(2);   // 컷이 둘이어도 amix 는 하나
    expect(graph).toMatch(/\[cap\]\[bg\]amix/);
  });
});

// ── 실제 ffmpeg — 인자 문자열이 아니라 파일을 본다 ──────────────────────────────
//
// 전환은 눈에 보이는 것이라 문법이 맞는 것만으로는 아무것도 증명하지 않는다.
// ffmpeg 가 fade 를 조용히 무시해도(잘못된 시작점) exit 0 이다. 그래서 **픽셀**로 잰다.
describe("전환 — 실제 ffmpeg", () => {
  function run(args) {
    return new Promise((res) => {
      const p = spawn(ffmpegPath, args);
      let tail = "";
      p.stderr.on("data", (d) => { tail = (tail + d).slice(-3000); });
      p.on("close", (code) => res({ code, tail }));
    });
  }

  // 프레임 한 장의 평균 밝기. `-ss` 를 **입력 뒤에** 둔다 — 앞에 두면 키프레임으로
  // 튀어 0.02초 정밀도가 안 나온다.
  async function meanGray(video, t, dir, name) {
    const raw = path.join(dir, `${name}.gray`);
    const { code, tail } = await run(["-y", "-i", video, "-ss", String(t), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", raw]);
    expect(code, `프레임 추출 실패:\n${tail}`).toBe(0);
    const buf = await fs.readFile(raw);
    let sum = 0;
    for (const b of buf) sum += b;
    return sum / buf.length;
  }

  it("총 길이는 컷 합 그대로이고, 경계에서 화면이 어두워진다", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "transition-"));
    // 밝은 색 클립 둘 — 클립은 4초지만 낭독은 3초라 합성이 3초로 자른다(눈금 올림 모양).
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x8090C0:s=540x960:d=4,format=yuv420p", "-c:v", "libx264", path.join(dir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "color=c=0xC09080:s=540x960:d=4,format=yuv420p", "-c:v", "libx264", path.join(dir, "v1.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "aac", path.join(dir, "a0.m4a")]);
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=3", "-c:a", "aac", path.join(dir, "a1.m4a")]);

    const local = [
      { video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 3, haveSeconds: 4 },
      { video: path.join(dir, "v1.mp4"), audio: path.join(dir, "a1.m4a"), wantSeconds: 3, haveSeconds: 4 },
    ];
    const out = path.join(dir, "out.mp4");
    const { code, tail } = await run(buildFfmpegArgs({ local, out, width: 540, height: 960, seconds: 6 }));
    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    // ★ 총 길이 — 겹치는 전환이면 6 - 0.3 = 5.7 이 나온다
    const probe = await run(["-i", out]);
    const m = probe.tail.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    console.log("전환 합성 길이:", seconds, "초 (컷 3 + 3)");
    expect(seconds).toBeGreaterThan(5.9);
    expect(seconds).toBeLessThan(6.2);

    // ★ 경계가 실제로 어두워지는가 — 컷 가운데와 경계를 나란히 잰다
    const mid0 = await meanGray(out, 1.5, dir, "mid0");
    const edge0 = await meanGray(out, 3 - 0.02, dir, "edge0");   // 앞 컷의 마지막
    const edge1 = await meanGray(out, 3 + 0.02, dir, "edge1");   // 뒤 컷의 처음
    const mid1 = await meanGray(out, 4.5, dir, "mid1");
    console.log(`밝기: 컷0가운데 ${mid0.toFixed(1)} → 경계 ${edge0.toFixed(1)}/${edge1.toFixed(1)} → 컷1가운데 ${mid1.toFixed(1)}`);
    expect(mid0, "컷 가운데는 밝아야 한다").toBeGreaterThan(80);
    expect(mid1).toBeGreaterThan(80);
    expect(edge0, "앞 컷 끝이 안 어두워졌다 = fade 가 안 먹었다").toBeLessThan(mid0 * 0.3);
    expect(edge1, "뒤 컷 시작이 안 어두워졌다").toBeLessThan(mid1 * 0.3);

    // ★ 전환 밖은 손대지 않는다 — 전환의 두 배 밖은 원래 밝기여야 한다
    const inside = await meanGray(out, 3 - TRANSITION_SECONDS * 2, dir, "inside");
    expect(inside, "전환이 컷 안쪽까지 번졌다").toBeGreaterThan(mid0 * 0.9);

    console.log("결과물:", out);
  }, 300000);

  it("소리는 경계에서 끊기지 않는다", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "transition-audio-"));
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x8090C0:s=540x960:d=3,format=yuv420p", "-c:v", "libx264", path.join(dir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "color=c=0xC09080:s=540x960:d=3,format=yuv420p", "-c:v", "libx264", path.join(dir, "v1.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "aac", path.join(dir, "a0.m4a")]);
    await run(["-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=3", "-c:a", "aac", path.join(dir, "a1.m4a")]);

    const local = [
      { video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 3, haveSeconds: 3 },
      { video: path.join(dir, "v1.mp4"), audio: path.join(dir, "a1.m4a"), wantSeconds: 3, haveSeconds: 3 },
    ];
    const out = path.join(dir, "out.mp4");
    const { code, tail } = await run(buildFfmpegArgs({ local, out, width: 540, height: 960, seconds: 6 }));
    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    // 경계를 걸치는 0.4초 창의 소리 크기 — 영상만 어두워지고 소리는 그대로여야 한다
    const vol = async (ss, len, name) => {
      const seg = path.join(dir, `${name}.wav`);
      await run(["-y", "-i", out, "-ss", String(ss), "-t", String(len), "-vn", seg]);
      const { tail: vt } = await run(["-i", seg, "-af", "volumedetect", "-f", "null", "-"]);
      const mm = vt.match(/mean_volume:\s*(-?[\d.]+) dB/);
      return mm ? Number(mm[1]) : -91;
    };
    const across = await vol(3 - TRANSITION_SECONDS / 2, TRANSITION_SECONDS, "across");
    const middle = await vol(1.0, TRANSITION_SECONDS, "middle");
    console.log(`소리: 컷 가운데 ${middle} dB → 경계 ${across} dB`);
    expect(across, "경계에서 소리가 죽었다").toBeGreaterThan(-50);
    // 나레이션을 줄이지 않으므로 경계와 가운데의 크기가 사실상 같다
    expect(Math.abs(across - middle), "경계에서 소리가 줄었다").toBeLessThan(3);
  }, 300000);
});
