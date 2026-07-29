// 합성 — 클립·소리·자막을 하나의 mp4로 만든다.
//
// 기본은 로컬 ffmpeg 다. 자막을 파일에 태우려면 그 방법뿐이기 때문이다
// (숏폼은 소리 없이 보는 사람이 많아 자막이 사실상 필수인데, 재생 화면에만 얹으면
//  사장님이 내려받아 올렸을 때 사라진다).
//
// SHOTFORM_COMPOSER=fal 이면 fal 의 ffmpeg API 로 간다 — 의존성이 없어 배포에 유리하지만
// 자막은 넣지 못한다. 비용은 두 경로 모두 사실상 0 이라 선택 기준이 아니다.
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { fakeFal } from "./fake";
import { buildCues, toAss, cutSeconds } from "./subtitles";
import { addRecord, costActor, estimateCost } from "./costs";
import { randomUUID } from "crypto";

const SIZES = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };

function rendersDir() {
  const base = process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data");
  return path.join(base, "renders");
}

// 클립을 낭독 길이에 맞춘다. 소리보다 짧으면 마지막 프레임을 정지로 늘리고
// (그 처리를 안 하면 concat 뒤로 갈수록 그림과 소리가 밀린다), 길면 잘라낸다
// (i2v 눈금 올림 때문에 이쪽이 더 흔하고, 예전에는 이 차이가 그대로 무음이었다).
export function buildFfmpegArgs({ local, assPath, out, width, height }) {
  const inputs = [];
  local.forEach((l) => { inputs.push("-i", l.video, "-i", l.audio); });

  const filters = [];
  local.forEach((l, i) => {
    const want = Number(l.wantSeconds) || 0;
    const have = Number(l.haveSeconds) || 0;
    // 클립을 낭독 길이에 맞춘다. 둘은 서로 배타적이다.
    //  - 클립이 짧으면 마지막 프레임을 늘린다(상한을 넘어 잘린 컷).
    //  - 클립이 길면 잘라낸다. 눈금 올림 때문에 이쪽이 훨씬 흔하고, 예전에는
    //    이 차이가 그대로 무음이었다(30초 요청에 정적 4.8초).
    // setpts 로 타임스탬프를 0부터 다시 매긴다 — 안 하면 concat 이 어긋난다.
    const pad = Math.max(0, want - have);
    const tpad = pad > 0 ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},` : "";
    const trim = want > 0 && have > want
      ? `trim=duration=${want.toFixed(2)},setpts=PTS-STARTPTS,`
      : "";
    filters.push(`[${i * 2}:v]${tpad}${trim}scale=${width}:${height},setsar=1[v${i}]`);
    filters.push(`[${i * 2 + 1}:a]anull[a${i}]`);
  });

  const concatIn = local.map((_, i) => `[v${i}][a${i}]`).join("");
  filters.push(`${concatIn}concat=n=${local.length}:v=1:a=1[cv][ca]`);
  // 자막은 이어붙인 뒤에 한 번만 태운다 — 컷마다 태우면 경계에서 끊긴다.
  //
  // 경로를 두 번 손봐야 한다(둘 다 Windows 때문이다):
  //  1. 역슬래시 → 슬래시. subtitles 필터가 역슬래시를 이스케이프로 읽는다.
  //  2. 콜론 → 이스케이프. 드라이브 문자의 콜론을 필터 옵션 구분자로 읽어,
  //     "C"를 첫 옵션값으로 삼고 나머지를 original_size 로 해석하다 죽는다.
  //     따옴표 안에 있어도 마찬가지다. 리눅스 경로에는 콜론이 없어 무해하다.
  const escPath = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
  const ass = escPath(assPath);
  const fontsdir = escPath(path.join(process.cwd(), "assets"));
  filters.push(`[cv]subtitles='${ass}':fontsdir='${fontsdir}'[outv]`);

  return [
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[outv]", "-map", "[ca]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-y", out,
  ];
}

function defaultRunFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let tail = "";
    p.stderr.on("data", (d) => { tail = (tail + d.toString()).slice(-2000); });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`합성 실패 (ffmpeg ${code})\n${tail.slice(-400)}`))
    );
  });
}

async function defaultDownload(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`내려받기 실패 (${res.status}) ${url.slice(0, 80)}`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

// fal 경로 — 클립을 잇고 소리를 얹는다. 자막은 넣지 못한다.
async function composeWithFal({ projectId, cuts, seconds, fetchImpl }) {
  const call = async (endpoint, body, amount) => {
    const res = await fetchImpl(`https://fal.run/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`합성 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const data = await res.json();
    // 엔드포인트마다 결과 키가 다르다 — merge-audios 는 audio, 나머지는 video
    const url = data?.video?.url || data?.audio?.url;
    if (!url) throw new Error("합성 결과가 비어 있어요");
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint,
      stage: "합성", user: costActor(), project_id: projectId,
      prompt: "-", duration: String(amount), aspect_ratio: "-",
      est_cost_usd: estimateCost(endpoint, amount), status: "done", video_url: url,
    }).catch(() => {});
    return url;
  };

  const merged = await call(
    "fal-ai/ffmpeg-api/merge-videos",
    { video_urls: cuts.map((c) => c.video.url) },
    seconds
  );

  // 소리도 이어붙인다 — 첫 컷 것만 얹으면 두 번째 컷부터 무음이 된다
  const audioUrls = cuts.map((c) => c.audio?.url).filter(Boolean);
  if (!audioUrls.length) return { url: merged, seconds, noSubtitles: true, noAudio: true };
  const mergedAudio =
    audioUrls.length === 1
      ? audioUrls[0]
      : await call("fal-ai/ffmpeg-api/merge-audios", { audio_urls: audioUrls }, seconds);

  const withAudio = await call(
    "fal-ai/ffmpeg-api/merge-audio-video",
    { video_url: merged, audio_url: mergedAudio },
    seconds
  );
  return { url: withAudio, seconds, noSubtitles: true };
}

export async function composeVideo({
  projectId,
  cuts,
  aspect_ratio = "9:16",
  fetchImpl = fetch,
  runFfmpeg = defaultRunFfmpeg,
  downloadImpl = defaultDownload,
  writeFileImpl = fs.writeFile,
  mkdirImpl = fs.mkdir,
}) {
  const usable = (cuts || []).filter((c) => c.video?.url);
  // 완성본 길이는 컷마다 낭독 길이(cutSeconds)를 더한 값이다 — 합성이 남는 클립을
  // 잘라내므로(buildFfmpegArgs) 파일 길이가 이 값과 실제로 맞는다.
  const seconds = (cuts || []).reduce((s, c) => s + cutSeconds(c), 0);

  // 가짜 모드 — 파일을 만들지 않는다. 재생 안 되는 더미를 주면 "합성이 깨졌다"로 오해한다.
  if (fakeFal()) return { url: null, seconds, fake: true };

  if (!usable.length) throw new Error("이어붙일 영상이 없어요");

  if (process.env.SHOTFORM_COMPOSER === "fal") {
    return composeWithFal({ projectId, cuts: usable, seconds, fetchImpl });
  }

  const [width, height] = SIZES[aspect_ratio] || SIZES["9:16"];
  const dir = rendersDir();
  await mkdirImpl(dir, { recursive: true });

  // 1) 클립·소리를 내려받는다
  const local = [];
  for (const c of usable) {
    local.push({
      video: await downloadImpl(c.video.url, path.join(dir, `${projectId}-${c.idx}.mp4`)),
      audio: await downloadImpl(c.audio.url, path.join(dir, `${projectId}-${c.idx}.m4a`)),
      wantSeconds: Number(c.seconds) || 0,
      haveSeconds: Number(c.video?.seconds) || 0,
    });
  }

  // 2) 자막 파일
  const assPath = path.join(dir, `${projectId}.ass`);
  await writeFileImpl(assPath, toAss(buildCues(usable), { width, height }), "utf8");

  // 3) 한 번에 조립
  const out = path.join(dir, `${projectId}.mp4`);
  await runFfmpeg(buildFfmpegArgs({ local, assPath, out, width, height }));

  return { url: `/api/renders/${projectId}.mp4`, seconds };
}
