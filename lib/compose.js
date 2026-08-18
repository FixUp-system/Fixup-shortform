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
import { subtitleFontFor } from "./subtitle-langs.js";
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

// ★★ ffmpeg 에 넘기는 **자막 폰트 경로**다. 언어를 따라야 한다.
//
// 언어를 따라야 하는 것이 둘인데(ASS 의 Fontname · 여기), 하나만 바꾸면 libass 가
// **오류 없이** 다른 폰트로 대체해 한자·가나가 전부 두부(□)로 나간다. 그래서 두 값이
// 같은 자리(lib/subtitle-langs.js 의 subtitleFontFor)에서 나오게 못박는다 — 폰트 파일을
// 다른 폴더로 옮겨도 이름과 경로가 함께 따라간다.
//
// ⚠️ subtitles 필터가 받는 것은 파일이 아니라 **폴더**(fontsdir)다. 파일 경로를 그대로
//    넘기면 libass 가 그 폴더를 못 읽어 조용히 기본 폰트로 굽는다. 그래서 폰트 파일이
//    있는 **폴더**를 넘기되, 그 폴더를 폰트 파일에서 뽑는다.
// ⚠️ 한국어(또는 미지정)는 assets/ 그대로다 — 인자가 한 글자도 달라지지 않는다.
const fontsDir = (lang) =>
  escPath(path.dirname(path.resolve(process.cwd(), subtitleFontFor(lang).file)));

// 배경음악 기본 볼륨. 실제 트랙이 없어 귀로 맞춘 값이 아니다 — 트랙이 생기면 실측으로 정한다.
export const MUSIC_VOLUME = 0.15;
const MUSIC_FADE_SECONDS = 2;

// ★★ 컷 사이 전환 길이. **한 자리에 둔다** — 화면·자막·라우트가 이 값을 몰라야 한다.
//
// 0.3초인 이유: 숏폼은 컷이 3~8초라 전환이 길면 그대로 늘어진다(0.5초면 6초 컷의 8%가
// 전환이다). 편집 통상값이 0.2~0.4초이고 그 가운데를 잡았다. 앞 컷 끝과 뒤 컷 시작이
// **절반씩** 나눠 쓰므로 한쪽은 0.15초다.
//
// ★★★ **전환은 총 길이를 바꾸면 안 된다.** 그래서 겹치는 전환(xfade·acrossfade)을 쓰지
// 않는다. 자막은 컷 시작 시각을 누적으로 계산해 태우고(lib/subtitles.js 의 buildCues),
// 낭독 소리는 concat 이 컷 시작에 붙여 놓는다 — xfade 는 겹친 만큼 **영상 타임라인만**
// 줄이므로 소리·자막이 뒤로 갈수록 어긋난다(컷 8개면 마지막이 2초 이상 밀린다).
// 대신 앞 컷 끝을 어둡게 하고 뒤 컷 시작을 밝힌다(dip to black): fade 필터는 프레임을
// 지우지도 더하지도 않아 길이를 한 프레임도 바꾸지 않는다.
//
// (겹친 만큼을 클립 여분(눈금 올림으로 남는 꼬리)에서 미리 벌어 두면 xfade 로도 길이를
//  지킬 수 있다. 그 길은 `concat=n:v=1:a=1` 을 영상·소리 따로로 쪼개야 하는데, 지금 소리가
//  컷 시작에 붙는 것은 concat 이 **영상 길이로** 소리 여백을 비워 두기 때문이라
//  — 소리만 따로 이어붙이면 나레이션이 갈수록 앞서던 옛 결함이 그대로 돌아온다.)
export const TRANSITION_SECONDS = 0.3;

// 컷 한쪽에 걸리는 전환 길이. 컷이 아주 짧으면 함께 짧아진다 — 0.4초 컷에 0.15초씩
// 걸면 컷의 4분의 3이 어둡다. 컷의 4분의 1을 넘지 않게 막는다.
function transitionSide(dur) {
  const half = TRANSITION_SECONDS / 2;
  return Math.min(half, dur / 4);
}

export function buildFfmpegArgs({ local, assPath, out, width, height, musicPath, musicVolume, seconds, lang }) {
  const inputs = [];
  // ★ 입력 번호를 고정 계산(i*2)하지 않고 **센다.** 말하는 클립에는 소리 파일이 없어
  // 항목마다 입력이 1개이거나 2개다 — 고정 계산은 그 순간 어긋난다.
  //
  // ⚠️ 계약: `l.audio` 는 **내려받은 소리 파일의 경로이거나 없거나** 둘 중 하나다
  // (composeVideo 가 c.audio?.url 이 있을 때만 넣는다). 빈 문자열·null 은 "없음"으로
  // 읽히므로 실패한 내려받기를 빈 값으로 채워 넣으면 안 된다 — 그 컷의 소리가 조용히
  // 클립 내부 스트림으로 바뀐다.
  //
  // ⚠️ 계약 2: `l.silentAudio` 는 **이 컷의 소리는 정적이다**라는 뜻이다(무음 컷).
  // 소리 파일도 없고 클립 안에도 소리가 없으므로 아래에서 anullsrc 로 만들어 넣는다.
  // 이것이 없으면 `[i:a]` 가 매치에 실패해 ffmpeg 가 통째로 죽는다 — ⑥완성, 즉 그림과
  // 클립 값을 다 치른 뒤다(2026-08-14 실측: Stream specifier ':a' matches no streams).
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
    // ★ 컷 경계 전환(TRANSITION_SECONDS 주석 참고) — 앞 컷 끝을 어둡게 하고 뒤 컷 시작을
    //   밝힌다. 길이를 정하는 필터(tpad·trim) **뒤**에 건다: 그래야 시작점이 이 컷의
    //   실제 화면 시간을 기준으로 맞는다. fade 는 프레임을 지우지도 더하지도 않아
    //   총 길이가 한 프레임도 안 바뀐다.
    //
    // ⚠️ 첫 컷의 시작과 마지막 컷의 끝에는 안 건다 — 그것은 전환이 아니라 인트로·아웃트로다.
    //    (총 길이는 그래도 같지만 완성본의 첫 프레임·마지막 프레임이 검게 나간다.)
    // ⚠️ 화면 시간은 `cutSeconds`(lib/subtitles.js)와 **같은 자**로 잰다: 소리 파일이
    //    있으면 주문한 시간, 없으면 받은 클립 길이다. 여기서 다른 자를 쓰면 어두워지는
    //    자리가 경계에서 어긋나 컷 중간이 깜빡인다.
    const dur = fit ? (want || have) : (have || want);
    // 길이를 모르면 시작점을 계산할 수 없다 — 안 거는 쪽이 안전하다(음악 페이드와 같은 결).
    const side = dur > 0 ? transitionSide(dur) : 0;
    const fades = [];
    if (side > 0 && i > 0) fades.push(`fade=t=in:st=0:d=${side.toFixed(2)}`);
    if (side > 0 && i < local.length - 1) {
      fades.push(`fade=t=out:st=${(dur - side).toFixed(2)}:d=${side.toFixed(2)}`);
    }
    const fade = fades.length ? `,${fades.join(",")}` : "";
    filters.push(`[${videoIdx}:v]${tpad}${trim}scale=${width}:${height},setsar=1${fade}[v${i}]`);
    // ★ 소리에는 손대지 않는다. 겹치지 않는 전환이라 concat 이 아무것도 버리지 않고,
    //   배경음악은 이어붙인 뒤 한 번만 섞이므로(아래 amix) 경계를 그대로 관통한다 —
    //   눈은 박자를 받고 귀는 이어진다. 나레이션을 함께 줄이면 안 된다: 소리 파일이 있는
    //   컷의 화면 시간이 곧 낭독 길이라(cutSeconds) 컷 끝에서 소리를 줄이면 마지막 음절이
    //   깎이는데, 자막은 그 말을 그대로 보여 주고 있어 눈과 귀가 어긋난다.
    // ★ 무음 컷 — 정적을 **만들어** 넣는다. 소리 파일도 없고 클립 안에도 소리가 없어
    //   꺼낼 데가 아예 없다(Kling 은 generate_audio:false 다).
    //   입력(-i)이 아니라 필터 소스라 위의 인덱스 계산을 건드리지 않는다.
    //   길이는 이 컷이 화면에 있는 시간이다 — 짧아도 concat 이 뒤를 비워 두므로(아래 참고)
    //   틀려서 밀리는 일은 없지만, 맞춰 두면 amix 의 duration=first 가 제 길이를 본다.
    if (l.silentAudio) {
      const dur = (have || want) || 1;
      filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${dur.toFixed(2)}[a${i}]`);
      return;
    }
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

  // ★ 컷마다 **영상 길이 ≠ 소리 길이**여도 된다(2026-08-14 실측으로 확인).
  //   이 브랜치가 화면 시간과 낭독 시간을 갈라 놓아 여백이 생겼다(화면 8초 · 낭독 3초).
  //   concat 은 영상·소리 타임라인을 **따로** 세지 않는다 — 짧은 소리 뒤를 정적으로 비워
  //   두고 다음 컷 소리를 그 컷이 시작하는 자리에 놓는다. 즉 나레이션이 밀리지 않는다.
  //   (실측: 8초 컷 둘 + 3초 낭독 둘 → 소리가 0~3초와 8~11초에 있었다. 총 16.00초.
  //    tests/compose-live.test.js 의 "여백이 있어도 나레이션이 컷 시작에 붙는다"가 못 박는다.)
  //   ⚠️ 다만 **마지막 컷의 여백에는 오디오 스트림 자체가 없다**(위 실측에서 소리 스트림은
  //   11.02초에서 끝났다). 아래 amix 의 duration=first 가 그 길이를 보므로 배경음악을 넣으면
  //   음악이 영상보다 먼저 끊긴다 — 그래서 음악을 섞기 전에 [ca] 를 전체 길이로 늘린다.
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
    // 나레이션을 전체 길이로 늘린다(뒤는 정적). 여백이 생기기 전에는 소리 = 영상이라
    // 필요 없었지만, 이제 마지막 컷 여백만큼 소리가 짧아 duration=first 가 음악을
    // 그 자리에서 끊는다. 길이를 모르면(seconds 없음) 손대지 않는다 — 옛 동작 그대로다.
    const narration = total > 0 ? "[cap]" : "[ca]";
    if (total > 0) filters.push(`[ca]apad,atrim=duration=${total.toFixed(2)}[cap]`);
    // ★ normalize=0 이 없으면 amix 가 입력 개수로 나눠 **나레이션까지 절반**이 된다.
    // 화면상 아무 오류가 없어 원인을 찾기 어렵다.
    filters.push(`${narration}[bg]amix=inputs=2:duration=first:normalize=0[outa]`);
  }
  // 자막은 이어붙인 뒤에 한 번만 태운다 — 컷마다 태우면 경계에서 끊긴다.
  //
  // ★ assPath 를 안 주면 자막을 안 건다(= 원본). 자막이 있을 때의 동작은 예전 그대로다.
  if (assPath) {
    filters.push(`[cv]subtitles='${escPath(assPath)}':fontsdir='${fontsDir(lang)}'[outv]`);
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
export function burnArgs({ raw, assPath, out, lang }) {
  return [
    "-y", "-i", raw,
    "-vf", `subtitles='${escPath(assPath)}':fontsdir='${fontsDir(lang)}'`,
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

// 이 클립에 **소리가 들어 있는가** — 파일에 직접 물어본다.
//
// ★ 왜 기록이 아니라 프로브인가(2026-08-18 사장님 지적: "첫 컷에서 파도 소리가 안 들린다"):
//   컷에 "말하는 모델로 만들었다"를 새로 적어 두는 방법도 있지만, 그러면 **이미 만든
//   클립은 못 고친다**. 그리고 이 저장소가 반복해서 겪은 "같은 사실을 두 군데 적어 두면
//   언젠가 갈린다"를 또 만든다. 파일이 답을 갖고 있으면 파일에 묻는 쪽이 언제나 맞다.
//
// ★ ffprobe 를 쓰지 않는다 — `ffmpeg-static` 은 ffmpeg 하나만 준다. 대신 ffmpeg 에게
//   **소리만 뽑아 버리라고** 시키고(-vn, null 먹싱) 성공 여부로 판정한다. 오디오 스트림이
//   없으면 `Stream specifier ':a' matches no streams` 로 0 이 아닌 코드가 돌아온다.
//   실제 합성과 **같은 판정 기준**이라(그 자리도 [i:a] 로 꺼낸다) 어긋날 자리가 없다.
function defaultProbeHasAudio(file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, ["-v", "error", "-i", file, "-map", "0:a:0", "-t", "0.1", "-f", "null", "-"]);
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
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
  // 자막 **언어**(settings.subtitle_lang). 글자와 폰트가 함께 이 값을 따른다 —
  // 둘 중 하나만 따라가면 두부(□)가 나온다. 안 주면 오늘 그대로 한국어다.
  lang,
  // 이 영상이 **말한** 언어 — 자막 글자를 고를 때 원문 판정의 기준이다.
  // 안 주면 한국어다(옛 호출자는 예전 그대로).
  sourceLang,
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
      toAss(buildCues(usable, { width, height, subtitle, lang, sourceLang }), { width, height, position: subtitlePosition, subtitle, lang }),
      "utf8"
    );

    const out = path.join(dir, `${projectId}.mp4`);
    await runFfmpeg(burnArgs({ raw, assPath, out, lang }));
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
  // 자막 언어(settings.subtitle_lang) — burnSubtitles 와 같은 자다. 전체 재합성에서만
  // 빠뜨리면 자막을 고치기 전까지 완성본이 조용히 한국어로 나간다.
  lang,
  sourceLang,
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
  probeHasAudioImpl = defaultProbeHasAudio,
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
    // 내려받은 클립에 소리가 들어 있는지 — 무음 컷에서만 묻는다(그 밖에는 물을 이유가 없다).
    const hasClipAudio = async (c) => {
      try {
        return await probeHasAudioImpl(path.join(dir, `${projectId}-${c.idx}.mp4`));
      } catch {
        return false; // 못 물어봤으면 정적이다 — 죽지 않는 쪽
      }
    };
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
        // ★★ 무음 컷(말 없는 장면, 2026-08-14)은 소리를 **만들어** 넣는다.
        //
        // 소리 파일이 없다고 해서 "클립이 스스로 말한다"가 아니다 — 무음 컷은 TTS 를
        // 아예 안 만들고(lib/pipeline.js), 그 클립이 Kling 이면 generate_audio:false 라
        // 오디오 스트림이 통째로 없다. 그대로 두면 [i:a] 가 매치에 실패해 ffmpeg 가 죽는다.
        //
        // ★ 판정은 여기서도 **컷 하나**다. 프로젝트의 모델로 가르면 안 된다: 모델만
        // Seedance 로 바꾼 프로젝트에 옛 Kling 클립이 남아 있으면(clipKey 에 모델 id 가 없다)
        // "이 프로젝트는 말한다"가 참인데 그 클립에는 소리가 없어 똑같이 죽는다.
        // 무음 컷은 어느 모델에서든 정적이 맞는 답이라(연출로 말하지 않기로 한 컷이다),
        // 컷만 보고 정하는 쪽이 모든 조합에서 안전하다. Seedance 가 만든 주변음이 있으면
        // 그것을 버리게 되지만, 그것이 곧 "말 없는 장면"의 뜻이다.
        // ★★ **"말이 없다"와 "소리가 없다"는 다른 말이다**(2026-08-18 사장님 지적).
        //   이 줄은 2026-08-14 에 `c.silent === true` 만 보고 정적을 넣었다. 그때는 Kling 이
        //   기본이라(generate_audio:false) 무음 컷 클립에 오디오 스트림이 **아예 없었고**,
        //   정적을 안 넣으면 ffmpeg 가 통째로 죽었다 — 즉 버릴 소리가 없었다.
        //   Seedance 는 무음 컷에도 환경음(파도·발소리·바람)을 넣는다. 그 전제가 낡았고,
        //   대사 없는 첫 컷의 파도 소리가 그 자리에서 사라지고 있었다.
        //   ★ 그래서 **파일에 물어본다**. 소리가 있으면 쓰고, 없을 때만 정적을 만든다.
        //     프로브가 실패하면 정적이다 — 판단이 안 설 때는 죽지 않는 쪽으로 간다.
        ...(c.silent === true && !c.audio?.url && !(await hasClipAudio(c)) ? { silentAudio: true } : {}),
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
      toAss(buildCues(usable, { width, height, subtitle, lang, sourceLang }), { width, height, position: subtitlePosition, subtitle, lang }),
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
    await runFfmpeg(burnArgs({ raw, assPath, out, lang }));

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
