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
import os from "os";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { fakeFal } from "./fake.js";
import { sizeFor } from "./aspects.js";
import { buildCues, toAss, cutSeconds } from "./subtitles.js";
import { projectSpeaks } from "./clip-limits.js";
import { addRecord, costActor, estimateCost } from "./costs.js";
import { randomUUID } from "crypto";
import { getStore } from "./store/index.js";

// 치수는 lib/aspects.js 의 표에서 온다 — 화면이 고르는 목록과 같은 값이어야 한다.
// 두 벌로 두면 화면에는 있는데 합성이 모르는 비율이 생긴다.

// scripts/migrate-renders-to-storage.mjs 가 이 함수를 임포트해 쓴다 — 경로 규칙이
// 두 곳에 따로 있으면 한쪽만 고치고 잊는 사고가 난다.
export function rendersDir() {
  const base = process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data");
  return path.join(base, "renders");
}

// 클립을 낭독 길이에 맞춘다. 소리보다 짧으면 마지막 프레임을 정지로 늘리고
// (그 처리를 안 하면 concat 뒤로 갈수록 그림과 소리가 밀린다), 길면 잘라낸다
// (i2v 눈금 올림 때문에 이쪽이 더 흔하고, 예전에는 이 차이가 그대로 무음이었다).
export function buildFfmpegArgs({ local, assPath, out, width, height }) {
  const inputs = [];
  // ★ 입력 번호를 고정 계산(i*2)하지 않고 **센다.** 말하는 클립에는 소리 파일이 없어
  // 항목마다 입력이 1개이거나 2개다 — 고정 계산은 그 순간 어긋난다.
  const slots = [];
  for (const l of local) {
    const videoIdx = inputs.length / 2;   // inputs 는 ["-i", 경로] 쌍이라 파일 수는 길이/2
    inputs.push("-i", l.video);
    let audioIdx = null;
    if (l.audio) {
      audioIdx = inputs.length / 2;
      inputs.push("-i", l.audio);
    }
    slots.push({ videoIdx, audioIdx });
  }

  const filters = [];
  local.forEach((l, i) => {
    const { videoIdx, audioIdx } = slots[i];
    const want = Number(l.wantSeconds) || 0;
    const have = Number(l.haveSeconds) || 0;
    // 클립을 낭독 길이에 맞춘다. 둘은 서로 배타적이다.
    //  - 클립이 짧으면 마지막 프레임을 늘린다(상한을 넘어 잘린 컷).
    //  - 클립이 길면 잘라낸다. 눈금 올림 때문에 이쪽이 훨씬 흔하고, 예전에는
    //    이 차이가 그대로 무음이었다(30초 요청에 정적 4.8초).
    // setpts 로 타임스탬프를 0부터 다시 매긴다 — 안 하면 concat 이 어긋난다.
    //
    // ★ 소리 파일이 있을 때만 길이를 맞춘다.
    //
    // 소리가 클립 안에 있으면(말하는 모델) 자르는 순간 문장 끝이 사라지고, 늘리면
    // 소리 없는 정지 화면이 붙는다. 그 경로에서는 클립 길이가 곧 이 컷의 길이다
    // (lib/subtitles.js 의 cutSeconds 가 같은 값을 본다).
    const fit = audioIdx !== null;
    const pad = fit ? Math.max(0, want - have) : 0;
    const tpad = pad > 0 ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},` : "";
    const trim = fit && want > 0 && have > want
      ? `trim=duration=${want.toFixed(2)},setpts=PTS-STARTPTS,`
      : "";
    filters.push(`[${videoIdx}:v]${tpad}${trim}scale=${width}:${height},setsar=1[v${i}]`);
    // 소리 파일이 없으면 영상과 같은 입력에서 오디오 스트림을 꺼낸다
    filters.push(`[${audioIdx ?? videoIdx}:a]anull[a${i}]`);
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
  // ★ 프로젝트를 통째로 받는다 — 클립이 소리를 갖고 있는지(projectSpeaks)와 컷 길이
  // (cutSeconds)가 같은 값을 봐야 한다. 안 넘기면 예전 동작(TTS 경로) 그대로다.
  project,
  aspect_ratio = "9:16",
  subtitlePosition,
  fetchImpl = fetch,
  runFfmpeg = defaultRunFfmpeg,
  downloadImpl = defaultDownload,
  writeFileImpl = fs.writeFile,
  mkdirImpl = fs.mkdir,
  mkdtempImpl = (prefix) => fs.mkdtemp(prefix),
  rmImpl = (dir) => fs.rm(dir, { recursive: true, force: true }),
  readFileImpl = fs.readFile,
  putObjectImpl = (bucket, key, bytes, ct) => getStore().putObject(bucket, key, bytes, ct),
}) {
  const usable = (cuts || []).filter((c) => c.video?.url);
  // 말하는 모델이면 소리가 클립 안에 있어 소리 파일이 없다 — 내려받기·길이 맞추기가 둘 다 바뀐다.
  const speaks = projectSpeaks(project);
  // 완성본 길이는 컷마다 낭독 길이(cutSeconds)를 더한 값이다 — 합성이 남는 클립을
  // 잘라내므로(buildFfmpegArgs) 파일 길이가 이 값과 실제로 맞는다.
  // 말하는 경로에서는 자르지 않으므로 cutSeconds 가 받은 클립 길이를 돌려준다.
  const seconds = (cuts || []).reduce((s, c) => s + cutSeconds(c, project), 0);

  // 가짜 모드 — 파일을 만들지 않는다. 재생 안 되는 더미를 주면 "합성이 깨졌다"로 오해한다.
  if (fakeFal()) return { url: null, seconds, fake: true };

  if (!usable.length) throw new Error("이어붙일 영상이 없어요");

  if (process.env.SHOTFORM_COMPOSER === "fal") {
    return composeWithFal({ projectId, cuts: usable, seconds, fetchImpl });
  }

  const [width, height] = sizeFor(aspect_ratio);

  // ★ 임시 폴더에 만들고 최종본만 올린 뒤 통째로 지운다.
  //
  // 예전에는 data/renders/ 에 중간물(클립·소리·자막)까지 그대로 쌓였다 — 실측 71개
  // 215MB 중 65개가 중간물이었고, 합성이 실패하면 그것도 남았다. 중간물은 fal CDN 에서
  // 다시 받을 수 있어 지킬 이유가 없다.
  //
  // ffmpeg 는 여전히 로컬 파일에 쓴다(자식 프로세스라 스트림을 못 받는다).
  // "만들고 나서 올린다"가 유일한 순서다.
  const dir = await mkdtempImpl(path.join(os.tmpdir(), `shotform-${projectId}-`));
  try {
    // 1) 클립·소리를 내려받는다
    const local = [];
    for (const c of usable) {
      local.push({
        video: await downloadImpl(c.video.url, path.join(dir, `${projectId}-${c.idx}.mp4`)),
        // ★ 말하는 클립에는 소리 파일이 없다 — 소리가 영상 안에 있다.
        //   여기서 c.audio.url 을 그대로 읽으면 undefined 로 죽는다.
        ...(speaks ? {} : { audio: await downloadImpl(c.audio.url, path.join(dir, `${projectId}-${c.idx}.m4a`)) }),
        wantSeconds: Number(c.seconds) || 0,
        haveSeconds: Number(c.video?.seconds) || 0,
      });
    }

    // 2) 자막 파일
    const assPath = path.join(dir, `${projectId}.ass`);
    // buildCues 에는 위치를 안 넘긴다 — 줄바꿈·폭 계산은 가로 여백과 글자 크기만 쓰고
    // 둘 다 위치에 따라 안 바뀐다.
    await writeFileImpl(
      assPath,
      toAss(buildCues(usable, { width, height }), { width, height, position: subtitlePosition }),
      "utf8"
    );

    // 3) 한 번에 조립
    const out = path.join(dir, `${projectId}.mp4`);
    await runFfmpeg(buildFfmpegArgs({ local, assPath, out, width, height }));

    // 4) 최종본만 올린다 — 중간물은 여기서 버려진다
    await putObjectImpl("renders", `${projectId}.mp4`, await readFileImpl(out), "video/mp4");

    // URL 형태를 바꾸지 않는다 — render.of 각인이 이 문자열로 낡음을 판정한다
    return { url: `/api/renders/${projectId}.mp4`, seconds };
  } finally {
    // 실패해도 치운다. 값(ffmpeg 시간)은 이미 치른 뒤라 디스크까지 남기지 않는다.
    // 정리 실패가 원인 에러를 덮지 않게 한다 — ffmpeg 가 왜 죽었는지가 더 중요하다.
    await rmImpl(dir).catch(() => {});
  }
}
