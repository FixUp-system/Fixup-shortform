import { describe, it, expect, afterEach } from "vitest";
import { composeVideo, buildFfmpegArgs } from "../lib/compose";

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// 비용 기록이 저장소의 data/ 를 오염시키지 않게 임시 디렉터리로 돌린다 —
// 이 테스트들은 addRecord 가 실제로 도는 경로를 지난다.
process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-t-"));

afterEach(() => {
  delete process.env.SHOTFORM_FAKE;
  delete process.env.SHOTFORM_COMPOSER;
});

const CUTS = [
  {
    idx: 0, sentence: "첫", seconds: 4,
    video: { url: "https://f/v0.mp4", seconds: 4, truncated: false },
    audio: { url: "https://f/a0.mp3", seconds: 4 },
  },
  {
    idx: 1, sentence: "둘", seconds: 13,
    video: { url: "https://f/v1.mp4", seconds: 10, truncated: true },
    audio: { url: "https://f/a1.mp3", seconds: 13 },
  },
];

describe("composeVideo", () => {
  it("가짜 모드에서는 파일을 만들지 않고 그렇다고 말한다", async () => {
    // 재생 안 되는 더미를 돌려주면 "합성이 깨졌다"로 오해한다 — 없다고 말하는 편이 낫다
    process.env.SHOTFORM_FAKE = "1";
    const r = await composeVideo({ projectId: "p1", cuts: CUTS, aspect_ratio: "9:16" });
    expect(r.fake).toBe(true);
    expect(r.url).toBe(null);
    expect(r.seconds).toBe(17); // 4 + 13, 소리 기준
  });

  it("로컬 ffmpeg 로 만들고 우리 서버 경로를 돌려준다", async () => {
    const r = await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
    });
    expect(r.url).toBe("/api/renders/p1.mp4");
    expect(r.seconds).toBe(17);
  });

  it("SHOTFORM_COMPOSER=fal 이면 ffmpeg를 돌리지 않는다", async () => {
    process.env.SHOTFORM_COMPOSER = "fal";
    let ran = false;
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ video: { url: "https://fal.media/final.mp4" } }),
    });
    const r = await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16", fetchImpl,
      runFfmpeg: async () => { ran = true; },
    });
    expect(ran).toBe(false);
    expect(r.url).toBe("https://fal.media/final.mp4");
    // 이 경로는 자막을 태우지 못한다 — 화면이 그 사실을 표시해야 한다
    expect(r.noSubtitles).toBe(true);
  });

  it("fal 경로도 소리를 전부 이어붙인다", async () => {
    // 첫 컷 것만 얹으면 두 번째 컷부터 무음이 된다
    process.env.SHOTFORM_COMPOSER = "fal";
    const calls = [];
    // 엔드포인트마다 결과 키가 다르다 — merge-audios 는 audio, 나머지는 video
    const fetchImpl = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      const isAudio = url.includes("merge-audios");
      return {
        ok: true,
        json: async () =>
          isAudio
            ? { audio: { url: "https://fal.media/x.m4a" } }
            : { video: { url: "https://fal.media/x.mp4" } },
      };
    };
    await composeVideo({ projectId: "p1", cuts: CUTS, aspect_ratio: "9:16", fetchImpl });

    const audioMerge = calls.find((c) => c.url.includes("merge-audios"));
    expect(audioMerge.body.audio_urls).toEqual(["https://f/a0.mp3", "https://f/a1.mp3"]);
    // 이어붙인 소리를 영상에 얹는다
    const final = calls.find((c) => c.url.includes("merge-audio-video"));
    expect(final.body.audio_url).toBe("https://fal.media/x.m4a");
  });

  it("클립이 하나도 없으면 던진다", async () => {
    await expect(
      composeVideo({ projectId: "p1", cuts: [{ idx: 0, sentence: "x", seconds: 3 }], aspect_ratio: "9:16" })
    ).rejects.toThrow(/영상/);
  });
});

describe("buildFfmpegArgs", () => {
  const local = [
    { video: "/t/0.mp4", audio: "/t/0.mp3", wantSeconds: 4, haveSeconds: 4 },
    { video: "/t/1.mp4", audio: "/t/1.mp3", wantSeconds: 13, haveSeconds: 10 },
  ];

  it("짧은 클립을 소리 길이까지 정지로 늘린다", () => {
    // 이 처리를 안 하면 concat 뒤로 갈수록 그림과 소리가 밀린다
    const args = buildFfmpegArgs({ local, assPath: "/t/s.ass", out: "/t/o.mp4", width: 1080, height: 1920 });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("tpad=stop_mode=clone:stop_duration=3.00");
    // 길이가 맞는 클립에는 tpad 를 걸지 않는다
    expect(graph.split("tpad").length).toBe(2);
  });

  it("자막은 이어붙인 뒤에 한 번만 태운다", () => {
    const args = buildFfmpegArgs({ local, assPath: "/t/s.ass", out: "/t/o.mp4", width: 1080, height: 1920 });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("concat=n=2:v=1:a=1");
    expect(graph.split("subtitles").length).toBe(2);
    // 이어붙인 결과([cv])에 걸려야 한다 — 컷마다 태우면 경계에서 끊긴다
    expect(graph).toMatch(/\[cv\]subtitles/);
  });

  it("Windows 경로의 역슬래시를 슬래시로 바꾼다", () => {
    // subtitles 필터가 역슬래시를 이스케이프로 읽는다
    const args = buildFfmpegArgs({
      local, assPath: "C:\\tmp\\s.ass", out: "C:\\tmp\\o.mp4", width: 1080, height: 1920,
    });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("C:/tmp/s.ass");
    expect(graph).not.toContain("C:\\tmp\\s.ass");
  });

  it("클립과 소리를 짝지어 입력한다", () => {
    const args = buildFfmpegArgs({ local, assPath: "/t/s.ass", out: "/t/o.mp4", width: 1080, height: 1920 });
    const inputs = args.filter((a, i) => args[i - 1] === "-i");
    expect(inputs).toEqual(["/t/0.mp4", "/t/0.mp3", "/t/1.mp4", "/t/1.mp3"]);
  });

  it("고른 비율로 크기를 맞춘다", () => {
    const args = buildFfmpegArgs({ local, assPath: "/t/s.ass", out: "/t/o.mp4", width: 1920, height: 1080 });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("scale=1920:1080");
  });
});
