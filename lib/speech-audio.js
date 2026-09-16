// 영상에서 소리만 뽑는다 — 측정기(lib/speech-probe.js)가 mp4 를 안 받는다.
//
// ★ 왜 파일을 따로 두나: 합성(lib/compose.js)과 목적이 다르다. 합성은 완성본을 만들고
//   여기는 재려고 뽑는다. 한 파일에 두면 자막 굽기 인자와 측정 인자가 섞인다.
// ★ 재인코딩하지 않는다(-c:a copy) — 15초 실측 0.36MB, 1초 미만이다.
// ★ 못 뽑으면 null 이다. 던지지 않는다 — 자막 하나 때문에 값을 다 치른 한 편을 잃지 않는다.
import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { ffmpegPath, defaultDownload } from "./compose.js";

// data URI 로 보낼 수 있는 상한. 넘으면 아예 안 보낸다 — 긴 영상이 생겼을 때 요청이
// 조용히 죽는 것보다, 재지 않고 폴백으로 흐르는 편이 낫다.
export const AUDIO_DATA_URI_MAX = 6 * 1024 * 1024;

export async function extractAudioDataUri(videoUrl, {
  projectId = "speech",
  runFfmpeg = defaultRunFfmpeg,
  mkdtempImpl = (prefix) => fs.mkdtemp(prefix),
  readFileImpl = (p) => fs.readFile(p),
  rmImpl = (dir) => fs.rm(dir, { recursive: true, force: true }),
  downloadImpl = defaultDownload,
} = {}) {
  if (typeof videoUrl !== "string" || !videoUrl) return null;
  let dir = null;
  try {
    dir = await mkdtempImpl(path.join(os.tmpdir(), `shotform-speech-${projectId}-`));
    const src = await downloadImpl(videoUrl, path.join(dir, "src.mp4"));
    const out = path.join(dir, "speech.m4a");
    await runFfmpeg(["-y", "-i", src, "-vn", "-c:a", "copy", out]);
    const bytes = await readFileImpl(out);
    if (!bytes?.length || bytes.length >= AUDIO_DATA_URI_MAX) return null;
    return `data:audio/mp4;base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  } finally {
    if (dir) await rmImpl(dir).catch(() => {});
  }
}

function defaultRunFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let err = "";
    p.stderr.on("data", (d) => { err += String(d); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ ok: true }) : reject(new Error(err.slice(-400)))));
  });
}
