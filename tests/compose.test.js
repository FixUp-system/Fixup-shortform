import { describe, it, expect, afterEach } from "vitest";
import { composeVideo, buildFfmpegArgs } from "../lib/compose";
import { runWithActor } from "../lib/actor.js";

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
    // 올린 것은 하나뿐이고 최종본이다 — 클립(p1-0.mp4)·소리(p1-0.m4a)·자막(p1.ass)은 아니다
    expect(put).toEqual([{ bucket: "renders", key: "p1.mp4", ct: "video/mp4" }]);
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

// ★ 순수 함수(buildFfmpegArgs) 밖의 자리 — composeVideo 가 실제로 소리를 안 받는가.
//   원래 결함이 "c.audio.url 에서 그대로 죽는다"였으므로 그 경로를 직접 통과시킨다.
describe("composeVideo — 말하는 프로젝트는 소리 파일을 안 받는다", () => {
  // 소리가 클립 안에 있는 컷 = c.audio 가 아예 없다
  const SPEAKING_CUTS = [
    { idx: 0, sentence: "첫", seconds: 3, video: { url: "https://f/v0.mp4", seconds: 4 } },
    { idx: 1, sentence: "둘", seconds: 3, video: { url: "https://f/v1.mp4", seconds: 4 } },
  ];
  const PROJECT = {
    settings: { i2v_model: "seedance-2.0" },
    cast: [{ id: "c1", who: "20대 남성", cuts: [0, 1] }],
    cuts: SPEAKING_CUTS,
  };
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
      projectId: "p1", cuts: SPEAKING_CUTS, project: PROJECT, aspect_ratio: "9:16",
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
    await composeVideo({
      projectId: "p1", cuts: mixed, project: { ...PROJECT, cuts: mixed }, aspect_ratio: "9:16",
      ...wiring({
        downloadImpl: async (url, dest) => { got.push(url); return dest; },
        runFfmpeg: async (a) => { args = a; },
      }),
    });
    expect(got).toEqual(["https://f/v0.mp4", "https://f/a0.mp3", "https://f/v1.mp4"]);
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[1:a]anull[a0]");   // 옛 컷은 소리 파일에서
    expect(graph).toContain("[2:a]anull[a1]");   // 말하는 컷은 클립 자신에게서
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
