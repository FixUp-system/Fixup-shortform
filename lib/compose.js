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
// 경로를 두 번 손본다(둘 다 Windows 때문이다):
//  1. 역슬래시 → 슬래시. subtitles 필터가 역슬래시를 이스케이프로 읽는다.
//  2. 콜론 → 이스케이프. 드라이브 문자의 콜론을 필터 옵션 구분자로 읽어,
//     "C"를 첫 옵션값으로 삼고 나머지를 original_size 로 해석하다 죽는다.
//     따옴표 안에 있어도 마찬가지다. 리눅스 경로에는 콜론이 없어 무해하다.
// ★ 자막을 거는 자리가 둘(buildFfmpegArgs·burnArgs)이라 이 계산도 한 곳에만 둔다.
const escPath = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
const fontsDir = () => escPath(path.join(process.cwd(), "assets"));

// 배경음악 기본 볼륨. 실제 트랙이 없어 귀로 맞춘 값이 아니다 — 트랙이 생기면 실측으로 정한다.
export const MUSIC_VOLUME = 0.15;
const MUSIC_FADE_SECONDS = 2;

export function buildFfmpegArgs({ local, assPath, out, width, height, musicPath, musicVolume, seconds }) {
  const inputs = [];
  // ★ 입력 번호를 고정 계산(i*2)하지 않고 **센다.** 말하는 클립에는 소리 파일이 없어
  // 항목마다 입력이 1개이거나 2개다 — 고정 계산은 그 순간 어긋난다.
  //
  // ⚠️ 계약: `l.audio` 는 **내려받은 소리 파일의 경로이거나 없거나** 둘 중 하나다
  // (composeVideo 가 c.audio?.url 이 있을 때만 넣는다). 빈 문자열·null 은 "없음"으로
  // 읽히므로 실패한 내려받기를 빈 값으로 채워 넣으면 안 된다 — 그 컷의 소리가 조용히
  // 클립 내부 스트림으로 바뀐다.
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

  // ★ 음악 입력은 **컷 순회가 끝난 뒤** 맨 마지막에 넣는다. 위의 인덱스 계산이
  // 이미 끝난 자리라 클립·소리 짝이 어긋나지 않는다.
  //
  // ⚠️ 여기서부터 inputs 는 더 이상 ["-i", 경로] 쌍이 아니다 — `-stream_loop` 는 입력
  // 옵션이라 `-i` 앞에 와야 한다. 그래서 musicIdx 를 **push 전에** 잡는다. 뒤에 입력을
  // 더 붙이려면 길이/2 로 세지 말고 파일 수를 따로 들고 다녀야 한다.
  const musicIdx = musicPath ? inputs.length / 2 : null;
  // 음악이 영상보다 짧으면 뒤가 그대로 무음이 된다. 무한 반복시켜 두고 아래 amix 의
  // duration=first 가 나레이션 길이에서 자른다.
  if (musicPath) inputs.push("-stream_loop", "-1", "-i", musicPath);

  const concatIn = local.map((_, i) => `[v${i}][a${i}]`).join("");
  filters.push(`${concatIn}concat=n=${local.length}:v=1:a=1[cv][ca]`);
  // 배경음악은 자막과 같은 원리다 — 이어붙인 뒤에 한 번만 섞는다.
  // 컷마다 깔면 경계에서 음악이 끊긴다.
  if (musicPath) {
    const vol = Number.isFinite(musicVolume) ? musicVolume : MUSIC_VOLUME;
    // 길이를 알 때만 페이드를 건다. 모르면 안 거는 쪽이 안전하다 — 잘못된 시작점은
    // 음악을 통째로 죽인다. 짧은 영상에서 시작점이 음수가 되면 ffmpeg 가 거절하므로 0 에서 막는다.
    const total = Number(seconds) || 0;
    const fade = total > 0
      ? `,afade=t=out:st=${Math.max(0, total - MUSIC_FADE_SECONDS).toFixed(2)}:d=${MUSIC_FADE_SECONDS}`
      : "";
    filters.push(`[${musicIdx}:a]volume=${vol}${fade}[bg]`);
    // ★ normalize=0 이 없으면 amix 가 입력 개수로 나눠 **나레이션까지 절반**이 된다.
    // 화면상 아무 오류가 없어 원인을 찾기 어렵다.
    filters.push(`[ca][bg]amix=inputs=2:duration=first:normalize=0[outa]`);
  }
  // 자막은 이어붙인 뒤에 한 번만 태운다 — 컷마다 태우면 경계에서 끊긴다.
  //
  // ★ assPath 를 안 주면 자막을 안 건다(= 원본). 자막이 있을 때의 동작은 예전 그대로다.
  if (assPath) {
    filters.push(`[cv]subtitles='${escPath(assPath)}':fontsdir='${fontsDir()}'[outv]`);
  }

  return [
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", assPath ? "[outv]" : "[cv]", "-map", musicPath ? "[outa]" : "[ca]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-y", out,
  ];
}

// 원본에 자막만 굽는다 — 클립을 다시 받지 않으므로 전체 합성보다 훨씬 싸다.
//
// 크기 맞추기·길이 맞추기·이어붙이기는 원본이 이미 다 마친 일이라 여기서 다시 하지 않는다.
// 소리는 그대로 복사한다(-c:a copy) — 다시 인코딩하면 자막을 고칠 때마다 소리가 열화된다.
export function burnArgs({ raw, assPath, out }) {
  return [
    "-y", "-i", raw,
    "-vf", `subtitles='${escPath(assPath)}':fontsdir='${fontsDir()}'`,
    "-c:a", "copy", out,
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

// 원본은 우리 버킷에 있다 — 우리 서버에 HTTP 로 되돌아갈 이유가 없어 버킷에서 바로 읽는다
// (라우트를 타면 인증 헤더를 스스로 만들어야 하고, 요청 하나가 자기 자신을 기다린다).
async function defaultDownloadRender(url, dest) {
  const key = url.split("/").pop();
  // ★ getObject 는 없으면 **던진다**(null 을 주지 않는다) — `if (!bytes)` 로는 그 갈래에
  // 영영 못 닿아 스토어 원문 오류가 그대로 사장님 화면에 갔다. 여기서 받아 우리 말로 바꾼다.
  let bytes;
  try {
    bytes = await getStore().getObject("renders", key);
  } catch {
    throw new Error("원본 영상이 없어요 — 완성본을 다시 만들어 주세요");
  }
  if (!bytes) throw new Error("원본 영상이 없어요 — 완성본을 다시 만들어 주세요");
  await fs.writeFile(dest, bytes);
  return dest;
}

// 자막만 다시 굽는다 — 원본(클립+소리)을 그대로 두고 자막 필터만 건다.
//
// ⚠️ 원본이 있어야 부를 수 있다. 원본은 로컬 ffmpeg 경로에서만 만들어지므로
// SHOTFORM_COMPOSER=fal 로 만든 완성본에는 없다(그 경로는 애초에 자막을 못 태운다).
export async function burnSubtitles({
  projectId,
  cuts,
  subtitle,
  // 옛 필드(settings.subtitle_position) — composeVideo 와 같은 자다. 안 받으면
  // settings.subtitle 이 없는 옛 'top' 프로젝트가 자막만 다시 구울 때 조용히 아래로 간다.
  subtitlePosition,
  aspect_ratio = "9:16",
  runFfmpeg = defaultRunFfmpeg,
  downloadImpl = defaultDownloadRender,
  writeFileImpl = fs.writeFile,
  mkdtempImpl = (prefix) => fs.mkdtemp(prefix),
  rmImpl = (dir) => fs.rm(dir, { recursive: true, force: true }),
  readFileImpl = fs.readFile,
  putObjectImpl = (bucket, key, bytes, ct) => getStore().putObject(bucket, key, bytes, ct),
}) {
  const usable = (cuts || []).filter((c) => c.video?.url);
  // 길이는 composeVideo 와 같은 자로 센다 — 자막이 흐르는 시간이 그 값이다
  const seconds = (cuts || []).reduce((s, c) => s + cutSeconds(c), 0);
  const [width, height] = sizeFor(aspect_ratio);

  const dir = await mkdtempImpl(path.join(os.tmpdir(), `shotform-sub-${projectId}-`));
  try {
    const raw = await downloadImpl(
      `/api/renders/${projectId}-raw.mp4`,
      path.join(dir, `${projectId}-raw.mp4`)
    );

    // ★ buildCues 에도 설정을 넘긴다 — 크기 배율이 글자 크기를 바꾸므로 줄바꿈 폭도 바뀐다.
    // 안 넘기면 크기 1.6 에서 한 줄에 11칸이 들어간다고 믿고 끊는데 실제로는 7칸이라,
    // libass 가 마진에서 다시 접어 세 줄이 된다(이 저장소가 실측으로 세운 두 줄 한계가 무너진다).
    const assPath = path.join(dir, `${projectId}.ass`);
    await writeFileImpl(
      assPath,
      toAss(buildCues(usable, { width, height, subtitle }), { width, height, position: subtitlePosition, subtitle }),
      "utf8"
    );

    const out = path.join(dir, `${projectId}.mp4`);
    await runFfmpeg(burnArgs({ raw, assPath, out }));
    // 완성본만 덮어쓴다 — 원본은 그대로 둔다(다음 수정도 이것을 다시 쓴다)
    await putObjectImpl("renders", `${projectId}.mp4`, await readFileImpl(out), "video/mp4");

    // URL 형태를 바꾸지 않는다 — 사장님이 받아 간 링크도 이 모양이다
    return { url: `/api/renders/${projectId}.mp4`, rawUrl: `/api/renders/${projectId}-raw.mp4`, seconds };
  } finally {
    await rmImpl(dir).catch(() => {});
  }
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
  // ★ 프로젝트를 안 받는다. "이 컷의 소리가 어디에 있는가"는 **컷 안에** 다 적혀 있다
  // (c.audio?.url). 프로젝트로 판정하면 모델만 Seedance 로 바뀌고 옛 Kling 클립이 남은
  // 혼합 프로젝트에서 컷마다 어긋난다 — 내려받기·길이 맞추기·자막이 셋 다 같은 자를 쓴다.
  // (lib/pipeline.js 가 project 를 실어 보내지만 여기서는 쓰지 않는다.)
  aspect_ratio = "9:16",
  subtitlePosition,
  // 사장님이 고른 자막 설정(폰트·색·크기·자유 위치). 안 주면 옛 경로 그대로다 —
  // 즉 기본값이면 오늘과 픽셀 동일이고, 옛 프로젝트의 완성본도 그대로 나온다.
  subtitle,
  // 배경음악(로컬 파일 경로). 안 주면 옛 경로 그대로다 — 인자 한 글자도 달라지지 않는다.
  // 트랙을 어디서 받을지는 아직 정하지 않았다: 지금은 배관만 열어 둔다.
  musicPath,
  musicVolume,
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
  // 완성본 길이는 컷마다 cutSeconds 를 더한 값이다 — 소리 파일이 있는 컷은 합성이 남는
  // 클립을 잘라내고(buildFfmpegArgs), 없는 컷은 안 자른다. cutSeconds 가 그 둘을 같은
  // 기준으로 판정하므로 파일 길이가 이 값과 실제로 맞는다.
  const seconds = (cuts || []).reduce((s, c) => s + cutSeconds(c), 0);

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
        //
        // ★★ 판정은 **프로젝트가 아니라 컷**이다. 모델을 바꿔도 옛 클립은 남는다
        // (clipKey 에 모델 id 가 없다) — 프로젝트 한 번으로 정하면, Kling 클립이
        // 섞인 채 Seedance 로 바뀐 프로젝트에서 그 컷의 소리를 안 받는다. Kling 클립은
        // generate_audio:false 라 오디오 스트림이 아예 없어 [i:a] 가 매치에 실패하고
        // ffmpeg 가 통째로 죽는다(Stream specifier ':a' matches no streams).
        // buildFfmpegArgs 도 l.audio 유무로 판정하므로 두 계층의 기준이 이걸로 같아진다.
        ...(c.audio?.url ? { audio: await downloadImpl(c.audio.url, path.join(dir, `${projectId}-${c.idx}.m4a`)) } : {}),
        wantSeconds: Number(c.seconds) || 0,
        haveSeconds: Number(c.video?.seconds) || 0,
      });
    }

    // 2) 자막 파일
    const assPath = path.join(dir, `${projectId}.ass`);
    // buildCues 에는 위치를 안 넘긴다 — 줄바꿈·폭 계산은 가로 여백과 글자 크기만 쓰고
    // 둘 다 위치에 따라 안 바뀐다. 반면 **설정(subtitle)은 넘긴다** — 크기 배율이 글자
    // 크기를 바꾸므로 한 줄에 들어가는 칸 수도 바뀐다(burnSubtitles 와 같은 자다).
    await writeFileImpl(
      assPath,
      toAss(buildCues(usable, { width, height, subtitle }), { width, height, position: subtitlePosition, subtitle }),
      "utf8"
    );

    // 3) 자막 없는 원본을 먼저 만든다.
    //
    // ★ 원본이 있어야 사장님이 자막을 고칠 수 있다 — 완성본에는 자막이 구워져 있어
    // 그 위에 미리보기를 얹으면 옛 자막과 새 자막이 둘 다 보인다.
    // 원본은 자막을 몇 번을 고쳐도 그대로라, 클립을 다시 살 일이 없다(burnSubtitles).
    const raw = path.join(dir, `${projectId}-raw.mp4`);
    // 음악은 자막 없는 원본에 넣는다 — 자막은 이 결과에 따로 굽히므로(burnSubtitles)
    // 두 산출물이 같은 소리를 갖는다.
    await runFfmpeg(buildFfmpegArgs({ local, out: raw, width, height, musicPath, musicVolume, seconds })); // assPath 없음

    // 4) 원본에 자막을 굽는다 — 중간물은 여기서 버려진다
    const out = path.join(dir, `${projectId}.mp4`);
    await runFfmpeg(burnArgs({ raw, assPath, out }));

    // 5) **완성본을 먼저 올린다.** 원본은 자막 조절 UI 를 여는 편의물이지 완성본의 전제가
    // 아니다 — 원본 업로드를 앞에 두면 스토리지가 한 번 딸꾹할 때 예전이라면 나왔을 완성본이
    // 통째로 실패하고, /render 가 이미 render: null 을 찍어 놔서 **옛 완성본까지 사라진다.**
    await putObjectImpl("renders", `${projectId}.mp4`, await readFileImpl(out), "video/mp4");

    // 6) 원본은 best-effort — 실패하면 rawUrl 을 안 돌려준다. 화면은 rawUrl 유무로 이미
    // 갈라져 있어(조절 UI 대신 "다시 합치기로 만들어 주세요") 그대로 동작한다.
    const rawSaved = await (async () => {
      await putObjectImpl("renders", `${projectId}-raw.mp4`, await readFileImpl(raw), "video/mp4");
      return true;
    })().catch(() => false);

    // URL 형태를 바꾸지 않는다 — render.of 각인이 이 문자열로 낡음을 판정한다
    return {
      url: `/api/renders/${projectId}.mp4`,
      ...(rawSaved ? { rawUrl: `/api/renders/${projectId}-raw.mp4` } : {}),
      seconds,
    };
  } finally {
    // 실패해도 치운다. 값(ffmpeg 시간)은 이미 치른 뒤라 디스크까지 남기지 않는다.
    // 정리 실패가 원인 에러를 덮지 않게 한다 — ffmpeg 가 왜 죽었는지가 더 중요하다.
    await rmImpl(dir).catch(() => {});
  }
}
