// 말이 없는 컷에도 **소리는 있을 수 있다** — 파일에 물어본다.
//
// 사장님 지적(2026-08-18): "첫 컷에서 파도 치는 소리가 하나도 안 들린다."
//
// 원인은 합성이 그 컷의 소리를 **통째로 버리는** 것이었다:
//   ...(c.silent === true && !c.audio?.url ? { silentAudio: true } : {})
// `silentAudio` 가 켜지면 ffmpeg 가 클립에서 오디오를 안 꺼내고 정적을 만들어 넣는다
// (anullsrc). 그래서 대사 없는 컷의 환경음이 그 자리에서 사라졌다.
//
// 그렇게 짠 이유가 있었다(2026-08-14): Kling 은 `generate_audio: false` 라 무음 컷 클립에
// **오디오 스트림이 아예 없어서**, 정적을 안 만들어 넣으면 ffmpeg 가 통째로 죽는다
// (`Stream specifier ':a' matches no streams`). 그때는 **버릴 소리가 없었다.**
// 그 자리 주석이 결과를 미리 적어 두기까지 했다 — "Seedance 가 만든 주변음이 있으면
// 그것을 버리게 되지만, 그것이 곧 '말 없는 장면'의 뜻이다."
//
// ★★ 지금은 전제가 낡았다. Seedance 는 무음 컷에도 환경음(파도·발소리·바람)을 넣는다.
//    "말이 없다"와 "소리가 없다"는 이제 다른 말이다.
//
// ★ 처방은 **파일에 물어보는 것**이다. "이 클립에 오디오 스트림이 있는가"는 추측할 값이
//   아니라 확인할 값이고, 그러면 **옛 프로젝트도 자동으로 고쳐진다**(컷에 기록을 새로
//   남기는 방식은 이미 만든 클립을 못 고친다 — 그리고 이 저장소가 반복해서 겪은
//   "기록이 두 벌이라 갈린다" 를 또 만든다).
import { describe, it, expect } from "vitest";
import { composeVideo, buildFfmpegArgs } from "../lib/compose.js";

const base = (over = {}) => ({
  projectId: "11111111-2222-4333-8444-555555555555",
  downloadImpl: async (url, dest) => dest,
  writeFileImpl: async () => {},
  mkdirImpl: async () => {},
  mkdtempImpl: async (p) => `${p}x`,
  rmImpl: async () => {},
  readFileImpl: async () => Buffer.from("mp4"),
  putObjectImpl: async () => {},
  ...over,
});

describe("무음 컷의 소리 — 파일에 물어본다", () => {
  it("★★ 클립에 소리가 있으면 무음 컷이라도 그 소리를 쓴다", async () => {
    const seen = [];
    await composeVideo(base({
      cuts: [{ idx: 0, sentence: "", silent: true, seconds: 5, video: { url: "https://x/0.mp4", seconds: 5 } }],
      runFfmpeg: async (args) => { seen.push(args.join(" ")); },
      probeHasAudioImpl: async () => true, // 파도 소리가 들어 있는 Seedance 클립
    }));
    const filters = seen.join("\n");
    expect(filters, "소리가 있는데도 정적을 만들어 넣는다 — 환경음이 버려진다")
      .not.toContain("anullsrc");
  });

  it("★★ 클립에 소리가 없으면 정적을 만들어 넣는다 — 없으면 ffmpeg 가 죽는다", async () => {
    const seen = [];
    await composeVideo(base({
      cuts: [{ idx: 0, sentence: "", silent: true, seconds: 5, video: { url: "https://x/0.mp4", seconds: 5 } }],
      runFfmpeg: async (args) => { seen.push(args.join(" ")); },
      probeHasAudioImpl: async () => false, // Kling 클립(generate_audio:false)
    }));
    expect(seen.join("\n"), "소리가 없는 컷에 정적을 안 넣는다 — Stream specifier ':a' 로 죽는다")
      .toContain("anullsrc");
  });

  it("★ 소리 파일이 따로 있는 컷은 프로브와 무관하다 — 그 파일이 답이다", async () => {
    const seen = [];
    await composeVideo(base({
      cuts: [{ idx: 0, sentence: "가", seconds: 5, video: { url: "https://x/0.mp4", seconds: 5 }, audio: { url: "https://x/0.m4a" } }],
      runFfmpeg: async (args) => { seen.push(args.join(" ")); },
      probeHasAudioImpl: async () => { throw new Error("소리 파일이 있는 컷은 프로브하지 않는다"); },
    }));
    expect(seen.join("\n")).not.toContain("anullsrc");
  });

  it("★ 프로브가 실패하면 정적으로 간다 — 판단이 안 서면 죽지 않는 쪽이다", async () => {
    const seen = [];
    await composeVideo(base({
      cuts: [{ idx: 0, sentence: "", silent: true, seconds: 5, video: { url: "https://x/0.mp4", seconds: 5 } }],
      runFfmpeg: async (args) => { seen.push(args.join(" ")); },
      probeHasAudioImpl: async () => { throw new Error("ffprobe 없음"); },
    }));
    expect(seen.join("\n"), "프로브 실패가 합성 실패가 됐다").toContain("anullsrc");
  });

  it("★ 말하는 컷은 예전 그대로다 — silent 가 아니면 프로브를 안 부른다", async () => {
    let probed = false;
    await composeVideo(base({
      cuts: [{ idx: 0, sentence: "가", seconds: 5, video: { url: "https://x/0.mp4", seconds: 5 } }],
      runFfmpeg: async () => {},
      probeHasAudioImpl: async () => { probed = true; return true; },
    }));
    expect(probed, "말하는 컷까지 프로브한다 — 값 없는 일을 컷마다 더한다").toBe(false);
  });
});
