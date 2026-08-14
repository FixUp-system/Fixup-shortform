import { describe, it, expect, afterEach, vi } from "vitest";
import { composeVideo, buildFfmpegArgs, burnArgs, burnSubtitles } from "../lib/compose";
import { runWithActor } from "../lib/actor.js";
import { subtitleFontFor } from "../lib/subtitle-langs.js";

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

  it("배경음악을 합성 인자까지 관통시킨다", async () => {
    // buildFfmpegArgs 가 받아도 composeVideo 가 안 넘기면 부를 방법이 없다
    // ffmpeg 는 두 번 돈다 — 합성, 그다음 자막 굽기. 음악은 첫 번째(합성)에 들어간다.
    const calls = [];
    await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      musicPath: "/t/bgm.mp3",
      runFfmpeg: async (args) => { calls.push(args); },
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    const compose = calls[0];
    expect(compose).toContain("/t/bgm.mp3");
    expect(compose.join(" ")).toContain("amix");
    // 낭독 합(17초)이 페이드 시작점을 정한다 — composeVideo 가 길이를 알고 있다
    expect(compose.join(" ")).toContain("afade=t=out:st=15.00");
    // 자막 굽기는 원본을 다시 인코딩할 뿐이라 음악을 또 얹지 않는다
    expect(calls[1]?.join(" ") ?? "").not.toContain("amix");
  });

  // ★★ 최종 리뷰가 찾은 Critical(2026-08-14): 무음 컷은 TTS 도 없고 Kling 클립에는
  //   오디오 스트림도 없어 [i:a] 가 매치에 실패한다 — ffmpeg 가 ⑥완성에서 통째로 죽는다.
  //   판정은 **컷 하나**로 한다(프로젝트 모델로 가르면 옛 Kling 클립이 남은 혼합
  //   프로젝트에서 똑같이 죽는다).
  it("무음 컷은 정적을 만들어 넣는다 — 클립에서 소리를 꺼내려 들지 않는다", async () => {
    const calls = [];
    await composeVideo({
      projectId: "p1", aspect_ratio: "9:16",
      cuts: [
        { idx: 0, sentence: "말하는 컷.", seconds: 6, video: { url: "/v0", seconds: 6 }, audio: { url: "/a0", seconds: 6 } },
        { idx: 1, sentence: "", silent: true, seconds: 8, video: { url: "/v1", seconds: 8 } },
      ],
      runFfmpeg: async (args) => { calls.push(args); },
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    const graph = calls[0][calls[0].indexOf("-filter_complex") + 1];
    // 무음 컷의 소리는 입력이 아니라 필터 소스에서 온다
    expect(graph).toContain("anullsrc=r=44100:cl=stereo,atrim=duration=8.00[a1]");
    // 클립(2번 입력)에서 오디오를 꺼내려 들지 않는다 — 거기에는 스트림이 없다
    expect(graph).not.toContain("[2:a]");
    // 말하는 컷은 그대로 소리 파일을 쓴다
    expect(graph).toContain("[1:a]anull[a0]");
  });

  it("로컬 ffmpeg 로 만들고 우리 서버 경로를 돌려준다", async () => {
    const r = await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    expect(r.url).toBe("/api/renders/p1.mp4");
    expect(r.seconds).toBe(17);
  });

  it("클립이 낭독보다 길어도 낭독 합을 돌려준다 — 합성이 남는 클립을 잘라낸다", async () => {
    // 눈금 올림(6·8·10…초) 때문에 클립은 거의 항상 낭독보다 길다. 예전에는 합성이
    // 자르지 않고 무음으로 채워 파일이 클립 합만큼 나왔다(28초라 적고 파일은 32.8초).
    // 이제 합성이 남는 클립을 잘라내므로 낭독 합이 실제 파일 길이와 맞는다.
    const cuts = [
      { idx: 0, sentence: "첫", seconds: 9,
        video: { url: "https://f/v0.mp4", seconds: 10 }, audio: { url: "https://f/a0.mp3", seconds: 9 } },
      { idx: 1, sentence: "둘", seconds: 5,
        video: { url: "https://f/v1.mp4", seconds: 6 }, audio: { url: "https://f/a1.mp3", seconds: 5 } },
    ];
    const r = await composeVideo({
      projectId: "p1", cuts, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    expect(r.seconds).toBe(14); // 9 + 5, 낭독 합. 클립 합(16)이 아니다
  });

  it("SHOTFORM_COMPOSER=fal 이면 ffmpeg를 돌리지 않는다", async () => {
    process.env.SHOTFORM_COMPOSER = "fal";
    let ran = false;
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ video: { url: "https://fal.media/final.mp4" } }),
    });
    const r = await runWithActor("t-user", () => composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16", fetchImpl,
      runFfmpeg: async () => { ran = true; },
    }));
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
    await runWithActor("t-user", () => composeVideo({ projectId: "p1", cuts: CUTS, aspect_ratio: "9:16", fetchImpl }));

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

  it("최종본만 Storage 에 올린다 — 중간물은 안 올린다", async () => {
    const put = [];
    await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async (bucket, key, bytes, ct) => put.push({ bucket, key, ct }),
    });
    // 올린 것은 완성본과 원본 둘뿐이다 — 클립(p1-0.mp4)·소리(p1-0.m4a)·자막(p1.ass)은 아니다.
    // ★ 순서가 뜻을 갖는다: **완성본이 먼저**다. 원본을 앞에 두면 스토리지가 한 번 딸꾹할 때
    // 나왔을 완성본이 통째로 실패하고, /render 가 이미 render 를 비워 놔서 옛 완성본까지 잃는다.
    expect(put).toEqual([
      { bucket: "renders", key: "p1.mp4", ct: "video/mp4" },
      { bucket: "renders", key: "p1-raw.mp4", ct: "video/mp4" },
    ]);
  });

  // ★ 원본은 조절 UI 를 여는 편의물이지 완성본의 전제가 아니다 — 원본 업로드가 실패해도
  // 완성본은 나와야 하고, 그때는 rawUrl 을 안 준다(화면이 rawUrl 유무로 갈라져 있다).
  it("원본 업로드가 실패해도 완성본은 나온다 — rawUrl 만 빠진다", async () => {
    const r = await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async (_bucket, key) => {
        if (key.endsWith("-raw.mp4")) throw new Error("스토리지가 딸꾹했다");
      },
    });
    expect(r.url).toBe("/api/renders/p1.mp4");
    expect(r.rawUrl).toBeUndefined();
  });

  // ★ 기본 배선을 그대로 관통시킨다 — putObjectImpl 을 주입하지 않는다.
  //    다른 테스트가 전부 그것을 목으로 갈아끼워서, 버킷 이름 오타나 인자 순서가
  //    바뀌어도 전부 그린인 구멍이 있었다. 여기가 그 구멍을 막는다.
  it("주입 없이 부르면 실제로 renders 버킷에 들어간다", async () => {
    const { memoryStore, resetMemoryStore } = await import("../lib/store/memory.js");
    resetMemoryStore();
    await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("진짜-mp4-바이트"),
      // putObjectImpl 은 일부러 안 넘긴다 — 기본값이 store 로 가는지가 이 테스트의 전부다
    });
    expect((await memoryStore.getObject("renders", "p1.mp4")).toString()).toBe("진짜-mp4-바이트");
  });

  it("합성이 실패해도 임시 폴더를 치운다", async () => {
    const removed = [];
    await expect(composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => { throw new Error("ffmpeg 죽음"); },
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async (dir) => removed.push(dir),
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    })).rejects.toThrow("ffmpeg 죽음");
    // 값을 치른 뒤 실패해도 디스크는 안 남긴다 — 지금은 그대로 쌓인다
    expect(removed).toEqual(["/tmp/x"]);
  });

  it("URL 형태는 그대로다 — 각인이 이 문자열로 낡음을 판정한다", async () => {
    const r = await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    expect(r.url).toBe("/api/renders/p1.mp4");
  });

  it("고른 자막 위치가 ASS 에 실린다", async () => {
    let ass = "";
    await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      subtitlePosition: "top",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async (_path, content) => { ass = content; },
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    const style = ass.split("\n").find((l) => l.startsWith("Style: Main"));
    expect(style.split(",")[10]).toBe("8"); // Alignment = 상단 중앙
  });

  it("위치를 안 주면 지금과 같다 — 아래", async () => {
    let ass = "";
    await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async (_path, content) => { ass = content; },
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    expect(ass.split("\n").find((l) => l.startsWith("Style: Main")).split(",")[10]).toBe("2");
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

  it("Windows 경로의 역슬래시를 슬래시로 바꾸고 콜론을 이스케이프한다", () => {
    // 역슬래시: subtitles 필터가 이스케이프로 읽는다.
    // 콜론: 드라이브 문자의 콜론을 필터 옵션 구분자로 읽어 "C"를 첫 옵션값으로 삼고
    //       나머지를 original_size 로 해석하다 죽는다. 실제로 그렇게 죽었다
    //       (tests/compose-live.test.js 가 그 자리를 진짜 ffmpeg 로 지킨다).
    const args = buildFfmpegArgs({
      local, assPath: "C:\\tmp\\s.ass", out: "C:\\tmp\\o.mp4", width: 1080, height: 1920,
    });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("C\\:/tmp/s.ass");
    expect(graph).not.toContain("C:\\tmp\\s.ass");
    // 따옴표 안이라도 날콜론이 남으면 안 된다
    expect(graph).not.toMatch(/subtitles='[A-Z]:/);
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

  it("클립이 낭독보다 길면 잘라낸다 — 남는 시간이 무음이 되던 자리다", () => {
    const args = buildFfmpegArgs({
      local: [{ video: "v0.mp4", audio: "a0.m4a", wantSeconds: 3, haveSeconds: 6 }],
      assPath: "s.ass", out: "out.mp4", width: 1080, height: 1920,
    });
    const filter = args.join(" ");
    expect(filter).toContain("trim=duration=3.00");
    expect(filter, "자른 뒤에는 타임스탬프를 0부터 다시 매겨야 concat 이 어긋나지 않는다")
      .toContain("setpts=PTS-STARTPTS");
    expect(filter, "자를 때는 늘리지 않는다").not.toContain("tpad");
  });

  it("클립이 낭독보다 짧으면 지금처럼 마지막 프레임을 늘린다", () => {
    const args = buildFfmpegArgs({
      local: [{ video: "v0.mp4", audio: "a0.m4a", wantSeconds: 25, haveSeconds: 20 }],
      assPath: "s.ass", out: "out.mp4", width: 1080, height: 1920,
    });
    const filter = args.join(" ");
    expect(filter).toContain("tpad=stop_mode=clone:stop_duration=5.00");
    expect(filter).not.toContain("trim=");
  });

  it("낭독을 모르면 클립을 그대로 쓴다 — 목소리가 실패해도 합성은 돌아야 한다", () => {
    const args = buildFfmpegArgs({
      local: [{ video: "v0.mp4", audio: "a0.m4a", wantSeconds: 0, haveSeconds: 6 }],
      assPath: "s.ass", out: "out.mp4", width: 1080, height: 1920,
    });
    const filter = args.join(" ");
    expect(filter).not.toContain("trim=");
    expect(filter).not.toContain("tpad");
  });
});

// 배경음악 — 자막과 같은 자리에 붙는다. 컷마다 깔면 경계에서 음악이 끊기므로
// 이어붙인 결과([ca])에 한 번만 섞는다.
describe("buildFfmpegArgs — 배경음악", () => {
  const local = [
    { video: "/t/0.mp4", audio: "/t/0.mp3", wantSeconds: 4, haveSeconds: 4 },
    { video: "/t/1.mp4", audio: "/t/1.mp3", wantSeconds: 6, haveSeconds: 6 },
  ];
  const base = { local, assPath: "/t/s.ass", out: "/t/o.mp4", width: 1080, height: 1920 };
  const graphOf = (args) => args[args.indexOf("-filter_complex") + 1];

  it("이어붙인 뒤에 한 번만 섞는다", () => {
    const args = buildFfmpegArgs({ ...base, musicPath: "/t/bgm.mp3", seconds: 10 });
    const graph = graphOf(args);
    // 컷이 둘이라도 amix 는 하나다
    expect(graph.split("amix").length).toBe(2);
    // concat 결과([ca])를 전체 길이로 늘린 뒤([cap]) 그것에 섞는다 — 여백이 생기면서
    // 소리가 영상보다 짧아졌고(마지막 컷의 여백만큼) duration=first 가 그 길이를 본다.
    expect(graph, "concat 결과를 늘린 것에 걸려야 한다").toMatch(/\[ca\]apad,atrim=duration=10\.00\[cap\];\[cap\]\[bg\]amix/);
    expect(args[args.indexOf("-map") + 1], "자막은 여전히 영상 쪽").toBe("[outv]");
  });

  // 길이를 모르면 늘리지 않는다 — 옛 동작 그대로다(잘못된 길이는 소리를 통째로 자른다)
  it("전체 길이를 모르면 나레이션을 늘리지 않는다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, musicPath: "/t/bgm.mp3" }));
    expect(graph).not.toContain("apad");
    expect(graph).toMatch(/\[ca\]\[bg\]amix/);
  });

  it("나레이션 볼륨을 깎지 않는다", () => {
    // amix 기본값 normalize=1 은 입력 개수로 나눈다 — 빠뜨리면 목소리가 절반이 되고,
    // 화면상 아무 오류가 없어 원인을 찾기 어렵다.
    const graph = graphOf(buildFfmpegArgs({ ...base, musicPath: "/t/bgm.mp3", seconds: 10 }));
    expect(graph).toContain("normalize=0");
  });

  it("음악이 영상보다 길면 잘라낸다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, musicPath: "/t/bgm.mp3", seconds: 10 }));
    expect(graph).toContain("duration=first");
  });

  it("음악이 영상보다 짧으면 반복해 채운다 — 뒤가 무음이 되던 자리다", () => {
    const args = buildFfmpegArgs({ ...base, musicPath: "/t/bgm.mp3", seconds: 10 });
    const i = args.indexOf("-stream_loop");
    expect(i, "-stream_loop 은 입력 옵션이라 -i 앞에 와야 한다").toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("-1");
    expect(args[i + 2]).toBe("-i");
    expect(args[i + 3], "반복은 음악에만 건다").toBe("/t/bgm.mp3");
  });

  it("음악을 나레이션 아래로 깔고 끝에서 페이드아웃한다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, musicPath: "/t/bgm.mp3", seconds: 10 }));
    expect(graph, "기본 15%").toContain("volume=0.15");
    expect(graph, "10초짜리면 8초부터 2초간").toContain("afade=t=out:st=8.00:d=2");
  });

  it("볼륨을 인자로 조절한다 — 실제 트랙이 없는 지금은 귀로 못 맞춘다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, musicPath: "/t/bgm.mp3", seconds: 10, musicVolume: 0.4 }));
    expect(graph).toContain("volume=0.4");
  });

  it("영상이 페이드보다 짧으면 처음부터 페이드아웃한다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, musicPath: "/t/bgm.mp3", seconds: 1 }));
    expect(graph, "음수 시작점은 ffmpeg 가 거절한다").toContain("afade=t=out:st=0.00:d=2");
  });

  it("길이를 모르면 페이드를 걸지 않는다 — 음악은 그대로 깔린다", () => {
    const graph = graphOf(buildFfmpegArgs({ ...base, musicPath: "/t/bgm.mp3" }));
    expect(graph).toContain("amix");
    expect(graph).not.toContain("afade");
  });

  it("음악이 없으면 지금과 똑같이 만든다", () => {
    // 이 기능의 유일한 하드 제약 — 기존 프로젝트의 합성이 한 글자도 달라지면 안 된다
    const args = buildFfmpegArgs({ ...base, musicPath: null, seconds: 10 });
    const graph = graphOf(args);
    expect(graph).not.toContain("amix");
    expect(graph).not.toContain("volume=");
    expect(args).not.toContain("-stream_loop");
    expect(args[args.indexOf("-map") + 3], "소리는 concat 결과를 그대로 쓴다").toBe("[ca]");
    expect(args.filter((a, i) => args[i - 1] === "-i")).toEqual(["/t/0.mp4", "/t/0.mp3", "/t/1.mp4", "/t/1.mp3"]);
  });

  it("말하는 클립(소리 파일 없음)에도 음악을 깐다", () => {
    // 소리 출처가 클립 안이든 TTS 든 [ca] 는 같은 자리다 — 분기가 늘면 안 된다.
    // 입력이 항목마다 1개인 경로라 음악 인덱스가 어긋나기 쉽다.
    const args = buildFfmpegArgs({
      local: [
        { video: "/t/0.mp4", wantSeconds: 4, haveSeconds: 4 },
        { video: "/t/1.mp4", wantSeconds: 6, haveSeconds: 6 },
      ],
      assPath: "/t/s.ass", out: "/t/o.mp4", width: 1080, height: 1920,
      musicPath: "/t/bgm.mp3", seconds: 10,
    });
    const graph = graphOf(args);
    expect(args.filter((a, i) => args[i - 1] === "-i")).toEqual(["/t/0.mp4", "/t/1.mp4", "/t/bgm.mp3"]);
    expect(graph, "음악은 세 번째 입력(0-based 2)").toContain("[2:a]");
    // 클립 자신의 오디오 스트림을 그대로 쓰는 경로가 유지돼야 한다
    expect(graph).toContain("[0:a]anull[a0]");
    expect(graph).toContain("[1:a]anull[a1]");
  });
});

// ★ 순수 함수(buildFfmpegArgs) 밖의 자리 — composeVideo 가 실제로 소리를 안 받는가.
//   원래 결함이 "c.audio.url 에서 그대로 죽는다"였으므로 그 경로를 직접 통과시킨다.
describe("composeVideo — 말하는 프로젝트는 소리 파일을 안 받는다", () => {
  // 소리가 클립 안에 있는 컷 = c.audio 가 아예 없다
  const SPEAKING_CUTS = [
    { idx: 0, sentence: "첫", seconds: 3, video: { url: "https://f/v0.mp4", seconds: 4 } },
    { idx: 1, sentence: "둘", seconds: 3, video: { url: "https://f/v1.mp4", seconds: 4 } },
  ];
  const wiring = (extra) => ({
    runFfmpeg: async () => {},
    writeFileImpl: async () => {},
    mkdirImpl: async () => {},
    mkdtempImpl: async () => "/tmp/x",
    rmImpl: async () => {},
    readFileImpl: async () => Buffer.from("mp4"),
    putObjectImpl: async () => {},
    ...extra,
  });

  it("클립만 내려받는다 — c.audio.url 을 읽으면 그대로 죽던 자리다", async () => {
    const got = [];
    const r = await composeVideo({
      projectId: "p1", cuts: SPEAKING_CUTS, aspect_ratio: "9:16",
      ...wiring({ downloadImpl: async (url, dest) => { got.push(url); return dest; } }),
    });
    expect(got).toEqual(["https://f/v0.mp4", "https://f/v1.mp4"]);
    // 컷 길이가 받은 클립 길이라 4+4 다 — 주문한 3초로 세면 6이 나온다
    expect(r.seconds).toBe(8);
  });

  // ★ 모델을 Seedance 로 바꿔도 옛 Kling 클립은 남는다(clipKey 에 모델 id 가 없다).
  //   Kling 클립에는 오디오 스트림이 아예 없어, 프로젝트 한 번으로 정하면 그 컷의 소리를
  //   안 받고 [i:a] 가 매치에 실패해 ffmpeg 가 통째로 죽는다.
  it("소리를 가진 옛 컷이 섞여 있으면 그 컷의 소리는 받는다", async () => {
    const mixed = [
      { ...SPEAKING_CUTS[0], audio: { url: "https://f/a0.mp3", seconds: 3 } },
      SPEAKING_CUTS[1],
    ];
    const got = [];
    let args = null;
    let ass = "";
    const r = await composeVideo({
      projectId: "p1", cuts: mixed, aspect_ratio: "9:16",
      ...wiring({
        downloadImpl: async (url, dest) => { got.push(url); return dest; },
        // 첫 호출이 원본 조립이다(두 번째는 자막 굽기) — 여기서 재는 것은 조립 쪽이다
        runFfmpeg: async (a) => { args ??= a; },
        writeFileImpl: async (_p, body) => { ass = body; },
      }),
    });
    expect(got).toEqual(["https://f/v0.mp4", "https://f/a0.mp3", "https://f/v1.mp4"]);
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[1:a]anull[a0]");   // 옛 컷은 소리 파일에서
    expect(graph).toContain("[2:a]anull[a1]");   // 말하는 컷은 클립 자신에게서
    // ★ 옛 컷은 낭독(3초)으로 **잘린다** — 그러면 길이 보고와 자막도 3초를 봐야 한다.
    //   판정이 두 층에서 갈리면 여기서 4+4=8 이 나오고 자막이 컷마다 뒤로 밀린다.
    expect(graph).toContain("trim=duration=3.00");
    expect(r.seconds).toBe(7);   // 3(잘린 옛 컷) + 4(안 잘리는 말하는 컷)
    // 둘째 자막은 첫 컷의 실제 점유(3초)에서 시작한다
    expect(ass).toContain("0:00:03.00");
  });
});

describe("말하는 클립 — 소리가 영상 안에 있다", () => {
  const base = { assPath: "/t/x.ass", out: "/t/o.mp4", width: 1080, height: 1920 };

  it("소리 파일이 있으면 지금 그대로다 — 짝으로 넣고 낭독 길이에 맞춘다", () => {
    const args = buildFfmpegArgs({
      ...base,
      local: [{ video: "/t/0.mp4", audio: "/t/0.m4a", wantSeconds: 3, haveSeconds: 5 }],
    });
    const s = args.join(" ");
    expect(s).toContain("-i /t/0.mp4");
    expect(s).toContain("-i /t/0.m4a");
    expect(s).toContain("trim=duration=3.00");
    expect(s).toContain("[1:a]anull[a0]");   // 짝수=영상, 홀수=소리
  });

  // ★ 말하는 프로젝트에는 c.audio 가 아예 없다. 소리는 클립 안에 있다.
  it("소리 파일이 없으면 클립의 오디오 스트림을 쓴다", () => {
    const args = buildFfmpegArgs({
      ...base,
      local: [{ video: "/t/0.mp4", wantSeconds: 3, haveSeconds: 4 }],
    });
    const s = args.join(" ");
    expect(s).toContain("-i /t/0.mp4");
    expect(s).not.toContain(".m4a");
    expect(s).toContain("[0:a]anull[a0]");   // 영상과 같은 입력에서 소리를 꺼낸다
  });

  // ★ 자르면 문장 끝이 사라지고, 늘리면 소리 없는 정지 화면이 붙는다
  it("소리 파일이 없으면 자르지도 늘리지도 않는다", () => {
    const s = buildFfmpegArgs({
      ...base,
      local: [{ video: "/t/0.mp4", wantSeconds: 3, haveSeconds: 4 }],
    }).join(" ");
    expect(s).not.toContain("trim=duration");
    expect(s).not.toContain("tpad");
  });

  it("컷이 여럿이어도 입력 번호가 어긋나지 않는다", () => {
    const s = buildFfmpegArgs({
      ...base,
      local: [
        { video: "/t/0.mp4", wantSeconds: 3, haveSeconds: 4 },
        { video: "/t/1.mp4", wantSeconds: 3, haveSeconds: 4 },
      ],
    }).join(" ");
    expect(s).toContain("[0:a]anull[a0]");
    expect(s).toContain("[1:v]");
    expect(s).toContain("[1:a]anull[a1]");
  });
});

// ★ 원본(자막 없음)과 완성본(자막 구움)을 나눈다.
//
// 완성본에는 자막이 이미 구워져 있어, 사장님이 ⑥완성에서 자막을 고칠 때 그 위에
// 미리보기를 얹으면 옛 자막과 새 자막이 둘 다 보인다. 원본이 있으면 자막을 몇 번을
// 고쳐도 클립을 다시 안 받는다.
describe("원본과 완성본을 나눈다", () => {
  const deps = {
    aspect_ratio: "9:16",
    runFfmpeg: async () => {},
    downloadImpl: async (_url, dest) => dest,
    writeFileImpl: async () => {},
    mkdirImpl: async () => {},
    mkdtempImpl: async () => "/tmp/x",
    rmImpl: async () => {},
    readFileImpl: async () => Buffer.from("mp4"),
  };

  it("자막 없는 원본도 함께 올린다", async () => {
    const put = vi.fn(async () => {});
    const r = await composeVideo({ ...deps, projectId: "p1", cuts: CUTS, putObjectImpl: put });
    const keys = put.mock.calls.map((c) => c[1]);
    expect(keys).toContain("p1.mp4");
    expect(keys).toContain("p1-raw.mp4");
    expect(r.rawUrl).toBe("/api/renders/p1-raw.mp4");
    expect(r.url).toBe("/api/renders/p1.mp4");   // ★ 완성본 URL 은 안 바뀐다
  });

  it("원본에는 자막 필터가 안 걸린다", async () => {
    const graphs = [];
    await composeVideo({
      ...deps, projectId: "p1", cuts: CUTS, putObjectImpl: async () => {},
      runFfmpeg: async (a) => { graphs.push(a.join(" ")); },
    });
    // 첫 번째가 원본(자막 없음), 두 번째가 자막 굽기
    expect(graphs).toHaveLength(2);
    expect(graphs[0]).not.toContain("subtitles");
    expect(graphs[0]).toContain("concat=n=2");
    expect(graphs[1]).toContain("subtitles");
    expect(graphs[1]).not.toContain("concat");
  });

  it("자막만 다시 굽는다 — 클립을 안 받는다", async () => {
    const download = vi.fn(async (url, p) => p);
    const put = vi.fn(async () => {});
    await burnSubtitles({
      ...deps, projectId: "p1", cuts: CUTS, subtitle: { color: "#FF0000" },
      downloadImpl: download, putObjectImpl: put,
    });
    // 원본 하나만 받는다(클립·소리를 다시 안 받는다)
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][0]).toContain("p1-raw.mp4");
    expect(put.mock.calls.map((c) => c[1])).toEqual(["p1.mp4"]);
  });

  it("고른 자막 설정이 ASS 에 실린다", async () => {
    let ass = "";
    const r = await burnSubtitles({
      ...deps, projectId: "p1", cuts: CUTS,
      subtitle: { color: "#FF0000", font: "impact" },
      writeFileImpl: async (_p, body) => { ass = body; },
      putObjectImpl: async () => {},
    });
    const style = ass.split("\n").find((l) => l.startsWith("Style: Main"));
    expect(style).toContain("Black Han Sans");
    expect(style).toContain("&H000000FF");   // 빨강
    expect(r.url).toBe("/api/renders/p1.mp4");
    expect(r.seconds).toBe(17);
  });

  // ★★ 전체 재합성도 설정을 실어야 한다. 안 실으면 자막을 꾸민 뒤 컷을 고쳐 [다시 합치기]를
  // 누르는 순간 기본 흰 자막·옛 자리로 돌아가는데, 각인에는 설정이 들어 있어 낡음으로도
  // 안 잡힌다(리뷰 C2).
  it("전체 재합성도 고른 자막 설정을 ASS 에 싣는다", async () => {
    let ass = "";
    await composeVideo({
      ...deps, projectId: "p1", cuts: CUTS,
      subtitle: { color: "#FF0000", font: "impact", pos: [0.5, 0.4] },
      writeFileImpl: async (_p, body) => { ass = body; },
      putObjectImpl: async () => {},
    });
    const style = ass.split("\n").find((l) => l.startsWith("Style: Main"));
    expect(style).toContain("Black Han Sans");
    expect(style).toContain("&H000000FF");   // 빨강
    expect(ass, "자유 위치가 안 실렸다").toContain("\\pos(540,768)");
  });

  // 설정을 안 준 옛 경로는 한 글자도 달라지면 안 된다 — 기본값이면 오늘과 픽셀 동일이다.
  it("설정을 안 주면 옛 ASS 그대로다 — \\pos 가 안 붙는다", async () => {
    let ass = "";
    await composeVideo({
      ...deps, projectId: "p1", cuts: CUTS,
      writeFileImpl: async (_p, body) => { ass = body; },
      putObjectImpl: async () => {},
    });
    expect(ass).not.toContain("\\pos(");
    expect(ass.split("\n").find((l) => l.startsWith("Style: Main"))).toContain("Pretendard");
  });

  // getObject 는 없으면 **던진다** — `if (!bytes)` 로만 막던 때는 그 갈래에 영영 못 닿아
  // 스토어 원문 오류("객체를 찾을 수 없어요: renders/…")가 그대로 사장님에게 갔다(리뷰 M9).
  it("원본이 버킷에 없으면 준비한 문구가 나온다", async () => {
    const { downloadImpl, ...noDownload } = deps;
    await expect(
      burnSubtitles({ ...noDownload, projectId: "aaaa", cuts: CUTS, putObjectImpl: async () => {} })
    ).rejects.toThrow("원본 영상이 없어요");
  });

  it("자막만 굽는 args 는 원본 하나만 입력으로 받는다", () => {
    const args = burnArgs({ raw: "/t/raw.mp4", assPath: "/t/s.ass", out: "/t/o.mp4" });
    expect(args.filter((a, i) => args[i - 1] === "-i")).toEqual(["/t/raw.mp4"]);
    expect(args.join(" ")).toContain("subtitles='/t/s.ass'");
    expect(args).toContain("copy");   // 소리는 다시 인코딩하지 않는다
  });

  it("자막만 굽는 args 도 Windows 경로를 손본다", () => {
    const s = burnArgs({ raw: "C:\\t\\raw.mp4", assPath: "C:\\t\\s.ass", out: "C:\\t\\o.mp4" }).join(" ");
    expect(s).toContain("C\\:/t/s.ass");
    expect(s).not.toMatch(/subtitles='[A-Z]:/);
  });
});

// ★★ 두부(□)가 나오는 자리다. 언어를 따라야 하는 것이 **둘**이다:
//    ① ASS 의 Fontname ② ffmpeg 에 넘기는 폰트 경로(fontsdir).
//    하나만 바꾸면 libass 가 오류 없이 다른 폰트로 대체해 한자·가나가 전부 네모가 된다.
//    합성이 lang 을 안 넘기면 ①부터 조용히 한국어로 남는다 — 그것을 여기서 잡는다.
describe("합성이 자막 언어를 끝까지 나른다", () => {
  const deps = {
    aspect_ratio: "9:16",
    runFfmpeg: async () => {},
    downloadImpl: async (_url, dest) => dest,
    writeFileImpl: async () => {},
    mkdirImpl: async () => {},
    mkdtempImpl: async () => "/tmp/x",
    rmImpl: async () => {},
    readFileImpl: async () => Buffer.from("mp4"),
    putObjectImpl: async () => {},
  };
  const JA_CUTS = [
    {
      idx: 0, sentence: "첫", seconds: 4,
      subtitles: { ja: { text: "最初", of: "첫" } },
      video: { url: "https://f/v0.mp4", seconds: 4 },
      audio: { url: "https://f/a0.mp3", seconds: 4 },
    },
  ];
  const fontsdirOf = (args) => (args.join(" ").match(/fontsdir='([^']+)'/) || [])[1];
  const expectedDir = (lang) =>
    path.dirname(path.resolve(process.cwd(), subtitleFontFor(lang).file)).replace(/\\/g, "/").replace(/:/g, "\\:");

  it("자막만 다시 구울 때 글자와 폰트가 함께 일본어로 간다", async () => {
    let ass = "";
    const args = [];
    await burnSubtitles({
      ...deps, projectId: "p1", cuts: JA_CUTS, lang: "ja",
      writeFileImpl: async (_p, body) => { ass = body; },
      runFfmpeg: async (a) => { args.push(a); },
    });
    expect(ass, "번역이 안 실렸다").toContain("最初");
    expect(ass.split("\n").find((l) => l.startsWith("Style: Main"))).toContain("Noto Sans JP");
    // ★ 폰트 경로가 안 따라가면 ASS 이름만 일본어고 파일은 한국어라 두부가 된다
    expect(fontsdirOf(args[0])).toBe(expectedDir("ja"));
  });

  it("전체 재합성도 언어를 싣는다", async () => {
    let ass = "";
    const args = [];
    await composeVideo({
      ...deps, projectId: "p1", cuts: JA_CUTS, lang: "ja",
      writeFileImpl: async (_p, body) => { ass = body; },
      runFfmpeg: async (a) => { args.push(a); },
    });
    expect(ass).toContain("最初");
    expect(ass.split("\n").find((l) => l.startsWith("Style: Main"))).toContain("Noto Sans JP");
    // 두 번째가 자막 굽기다(첫 번째는 자막 없는 원본)
    expect(fontsdirOf(args[1])).toBe(expectedDir("ja"));
  });

  // 회귀 0 — 언어를 안 주거나 ko 면 인자가 한 글자도 달라지면 안 된다
  it("한국어·미지정은 ffmpeg 인자가 오늘 그대로다", () => {
    const a = { raw: "/t/raw.mp4", assPath: "/t/s.ass", out: "/t/o.mp4" };
    expect(burnArgs({ ...a, lang: "ko" })).toEqual(burnArgs(a));
    expect(fontsdirOf(burnArgs(a))).toBe(expectedDir("ko"));
  });
});
