// ③그림을 **스토리보드 한 장**으로 그린다 — 컷마다 한 장이 아니라, 격자 한 장을 사서
// 칸을 잘라 컷에 꽂는다.
//
// ★★ 왜: 값이 한 자리 다르다. 2026-08-24 실측 — 9컷이면 스토리보드 한 장 **$0.401**(high)
//   대 컷별 아홉 장 **$3.61**. 그리고 덤이 하나 더 있다: 한 장에 함께 그려지므로 인물·옷·
//   색이 저절로 같다(08-21 에 하루를 쓴 "인물 고정 사슬 셋"이 지시가 아니라 구조로 사라졌다).
//
// ★ 실측 근거는 .superpowers/sdd/2026-08-21-reel-cut-r2v/progress.md 의 게이트 D·B 다.
//   읽기 순서(좌→우 위→아래)·칸 경계·칸 품질·인물 일관성이 여섯 칸에서 다 통과했고,
//   잘라낸 칸을 i2v 의 첫 프레임으로 그대로 굽는 것까지 확인됐다.
//
// ★★ 격자 표를 여기서 다시 만들지 않는다 — lib/reel/scenario-rules.js 의 REEL_GRIDS 하나다
//   (시나리오 지시문이 컷 수를 고를 때 보는 그 표다. 두 벌이면 LLM 이 고른 칸 수를 그림이
//   못 그리는 날이 온다).
//
// ⚠️ 이 모듈은 **서버 전용**이다(sharp·Storage 를 문다). 화면에서 import 하지 마라.
import { randomUUID } from "crypto";
import { panelLine, buildStoryboardPrompt as buildStoryboardPromptImpl } from "./panels.js";
import { storyboardGridFor } from "./oneshot.js";
import { bakeCellLong } from "./scenario-rules.js";
import { AD_MOODS, AD_STYLE_LINES } from "../ad/options.js";
import { sizeFor } from "../aspects.js";
import { getStore } from "../store/index.js";

// 칸 하나가 몇 픽셀이어야 하는가 — **굽기 해상도에서 역산한다**(9:16 이면 720×1280).
// 그래야 잘라낸 칸이 클립의 첫 프레임으로 줄어들 뿐, 늘어나지 않는다.
// ★★ 2026-08-25 — 상수를 **화질이 정하게** 바꿨다(lib/reel/scenario-rules.js 의
//   bakeCellLong). 늘 1280 을 목표로 잡으면 480p 프로젝트도 720p 용 캔버스를 요구하다
//   상한(3840)에 걸려 축소되고, 그 결과 칸이 480p 에 필요한 854 에도 못 미쳤다.
// ★ 이 상수는 **모르는 화질의 기본값**으로 남는다(720p).
export const STORYBOARD_CELL_LONG_SIDE = 1280;

// GPT Image 2 의 긴 변 상한. 넘으면 비율을 지킨 채 줄인다(그 위는 모델이 안 받는다 —
// lib/imagegen.js 의 GPT_MAX_SIDE 와 같은 값이지만, 그 값은 그쪽의 1K/2K 축에 딸린 것이라
// 여기서 import 하지 않는다. 두 축이 같은 상한을 각자 지킨다).
const MAX_SIDE = 3840;

// ★★ 2026-08-25 — 이 함수는 lib/reel/oneshot.js 로 **옮겼다**(판정은 여전히 하나다).
//   옮긴 이유: 통짜 갈래(15초 이하)를 화면도 판정해야 하는데 이 파일은 서버 전용이라
//   ("use client") 화면이 못 읽는다. 여기서 다시 내보내는 것은 옛 import 경로를 안
//   깨려는 것뿐이다 — 두 벌이 아니다.
export { storyboardGridFor };

// 스토리보드 한 장의 픽셀 치수 — 칸 하나가 굽기 해상도가 되도록 곱하고, 상한에서 줄인다.
// 3×3 → 2160×3840(칸 정확히 720×1280, 2026-08-24 실측 성공).
export function storyboardImageSize(grid, aspect = "9:16", resolution) {
  const [aw, ah] = sizeFor(aspect);
  const k = bakeCellLong(resolution) / Math.max(aw, ah);
  const cell = { w: aw * k, h: ah * k };
  let width = grid.cols * cell.w, height = grid.rows * cell.h;
  const long = Math.max(width, height);
  if (long > MAX_SIDE) {
    const s = MAX_SIDE / long;
    width *= s; height *= s;
  }
  // 8의 배수로 맞춘다 — 코덱·모델이 다루기 좋은 치수다(측정 스크립트와 같은 규칙).
  return { width: Math.round(width / 8) * 8, height: Math.round(height / 8) * 8 };
}

// ── 갈래 판정 ────────────────────────────────────────────────────────────
//
// **컷 전부를 그릴 때만** 스토리보드다. 판정은 "only 를 줬는가"가 아니라 **"대상이 컷
// 전부인가"** 하나다 — 이유:
//   · 컷 하나만 다시 그리기(only=[4])에 스토리보드를 다시 사면 한 칸 때문에 $0.401 이다
//   · 일부만 비어 있을 때도 마찬가지다 — 이미 그린 칸을 다시 사는 셈이 된다
//   · 반대로 화면의 [전부 다시 만들기]는 `only=[모든 idx]` 를 **명시로** 보낸다
//     (app/reel/[id]/images/page.js). 그것을 "only 니까 컷별"로 읽으면 아홉 장 $3.61 이
//     다시 나간다 — 이 작업이 없애려던 바로 그 지출이다.
// 그리고 칸 수가 격자 표 밖(5·7·8·11…)이면 **던지지 않고 컷별로 떨어진다.**
// 시나리오 지시문이 목록을 주긴 하지만 LLM 이 목록 밖을 낼 수 있고, 그때 그림 단계가
// 통째로 막히면 사장님은 정가를 내고도 아무것도 못 만든다.
export function planReelImages(cuts, only, opts) {
  const list = Array.isArray(cuts) ? cuts : [];
  const wanted = Array.isArray(only) && only.length ? new Set(only) : null;
  const targets = list
    .filter((c) => (wanted ? wanted.has(c.idx) : !c?.image?.url))
    .map((c) => c.idx);

  // ★ 격자는 **그 프로젝트의 화질·비율**로 잰다(2026-08-25) — 안 주면 720p 다.
  const grid = storyboardGridFor(list.length, opts);
  const all = list.length > 0 && targets.length === list.length;
  if (grid && all) return { mode: "storyboard", grid, targets };
  return { mode: "percut", grid: null, targets };
}

// ── 프롬프트 ─────────────────────────────────────────────────────────────
//
// ★★ 2026-08-27 — **조립은 lib/reel/panels.js 로 옮겼다.** 사장님이 ③이미지 화면에서
//   "기본적으로 들어가는 내용도" 보고 싶다고 했는데, 이 파일은 서버 전용이라(sharp·crypto)
//   화면이 못 읽는다. 지문을 화면에서 다시 조립하면 **실제로 나간 글과 갈린다** —
//   그래서 조립을 순수 모듈로 내리고 여기서는 그대로 다시 내보낸다(두 벌이 아니다).
export { buildStoryboardPrompt } from "./panels.js";

// ── 자르기 ───────────────────────────────────────────────────────────────
//
// ★ 격자 좌표는 **받아 온 그림의 실제 치수**에서 뽑는다(요청한 치수가 아니다) — 모델이
//   8픽셀쯤 다르게 줄 수 있고, 그때 요청값으로 자르면 칸이 한 줄씩 밀린다.
// ★ 칸이 9:16 에서 어긋나는 격자(3칸·6칸·10칸은 5%)는 **가운데 자르기로 흡수한다**
//   (2026-08-24 실측 확인). 가장자리가 아니라 가운데를 남기는 이유는 구도의 중심이
//   거기 있어서다.
// ★ sharp 는 늦게 import 한다 — 이 파일을 읽는 것만으로 네이티브 모듈을 끌지 않는다.
export async function cropStoryboardCells(bytes, grid, { aspect = "9:16", quality = 92 } = {}) {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(bytes).metadata();
  const cellW = Math.floor(meta.width / grid.cols);
  const cellH = Math.floor(meta.height / grid.rows);
  const [aw, ah] = sizeFor(aspect);
  const want = aw / ah;

  const out = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      let w = cellW, h = cellH;
      if (cellW / cellH > want) w = Math.round(cellH * want);
      else h = Math.round(cellW / want);
      const left = c * cellW + Math.floor((cellW - w) / 2);
      const top = r * cellH + Math.floor((cellH - h) / 2);
      // ★ 칸마다 새 sharp 인스턴스다 — 하나를 재사용하면 extract 가 누적된다.
      out.push(await sharp(bytes).extract({ left, top, width: w, height: h }).jpeg({ quality }).toBuffer());
    }
  }
  return out;
}

// ── 저장 — **우리 바이트**를 어디에 두는가 ────────────────────────────────
//
// ★★ 이 저장소는 지금까지 이미지를 **한 번도 안 내려받았다**(CLAUDE.md "fal 산출물은 우리
//   것이 아니다"). `cut.image.url` 이 fal CDN 주소 그대로였다. 그런데 칸을 자르면 fal 에는
//   없는 **우리 바이트**가 생긴다 — 둘 자리가 필요하다. 고른 자리와 이유:
//
//   · **버킷은 `uploads`** — 이미 있는 비공개 버킷이다. 새 버킷은 대시보드에서 손으로
//     만들어야 하고(배포 절차 밖), 없는 채 배포하면 그림 단계가 통째로 500 이다.
//     `renders` 는 완성본(mp4) 전용이고 그 서빙 라우트가 `<프로젝트id>.mp4` 이름 규칙에
//     묶여 있다 — 이름이 곧 소유자 검사라 png/jpg 를 끼워 넣으면 그 규칙이 헐거워진다.
//   · **주소는 `/api/uploads/<uuid>.jpg`** — 이 저장소에 이미 있는 "우리 바이트를 로그인
//     뒤에서 흘려주는" 문 하나다(app/api/uploads/[name]/route.js). 새 라우트를 만들면
//     소유자 검사·캐시 규칙이 두 벌이 된다.
//   · **주인 기록을 남긴다**(insertUploadOwner) — 그 라우트는 주인 기록이 없는 파일을
//     열지 않는다. 안 남기면 그림이 저장은 되는데 화면에서 404 다.
//   · **jpeg 로 굽는다** — 칸 하나가 PNG 면 1~2MB 다(9컷 × 24회면 프로젝트 하나가
//     수백 MB). 무료 플랜은 저장(1GB)보다 전송이 먼저 차는 자리다(renders 라우트 주석).
//     첫 프레임으로 쓰는 그림이라 q92 로 잃는 것이 없다.
//
// ⚠️ 그래서 **`cut.image.url` 이 이제 두 갈래다**: 컷별로 그리면 fal 주소, 스토리보드에서
//   자르면 우리 주소. fal 은 우리 주소를 못 읽으므로 굽기가 그것을 data URI 로 바꾼다
//   (lib/refs-io.js 의 toFalImageUrl — 업로드 사진에 이미 쓰던 규약 그대로다).
export async function saveStoryboardCells(cells, ownerId) {
  const store = getStore();
  const urls = [];
  for (const bytes of cells) {
    const key = `${randomUUID()}.jpg`;
    await store.putObject("uploads", key, bytes, "image/jpeg");
    // 저장 **뒤에** 주인을 적는다 — 업로드 라우트와 같은 순서다(없는 파일의 주인을 안 남긴다).
    await store.insertUploadOwner(key, ownerId);
    urls.push(`/api/uploads/${key}`);
  }
  return urls;
}

// 그림 바이트를 손에 넣는다 — fal 주소면 내려받고, 가짜 모드의 data URI 면 그 자리에서 푼다.
//
// ★ 가짜 모드도 **같은 길**을 지난다(자르기·저장까지). 값이 0 인 채로 배선 전체가 실제로
//   도는 것이 이 저장소에서 유일하게 공짜인 검증이다 — 여기서 갈래를 치면 그 검증이 사라진다.
export async function fetchImageBytes(url, fetchImpl = fetch) {
  if (typeof url !== "string" || !url) throw new Error("그림 주소가 비어 있어요");
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const head = url.slice(0, comma);
    const body = url.slice(comma + 1);
    return Buffer.from(head.includes(";base64") ? body : decodeURIComponent(body), head.includes(";base64") ? "base64" : "utf8");
  }
  // ★★ 가짜 모드의 표본은 `/samples/…` 상대 경로다(lib/imagegen.js) — 서버 fetch 는
  //   절대 URL 을 요구하므로 그대로 둘 수 없다. 파일에서 직접 읽는다.
  //   ★ `/samples/` 만 받는다 — 임의의 상대 경로를 열면 서버 파일을 읽는 문이 된다.
  if (url.startsWith("/samples/") && !url.includes("..")) {
    const { readFile } = await import("fs/promises");
    const path = await import("path");
    return readFile(path.join(process.cwd(), "public", url.replace(/^\//, "")));
  }
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`그림을 내려받지 못했어요 (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// 만든 그림만 컷에 얹는다 — **컷 목록을 대체하지 않는다.**
//
// ★★ 2026-08-31 — `app/api/reel/[id]/images/route.js` 에서 여기로 옮겼다. 초상 거절
//   자동 재시도(lib/reel/pipeline.js 의 retryOneShotWithoutFaces)가 판을 다시 그린 뒤
//   같은 병합을 해야 하는데, 라우트에 있으면 라우트가 라우트를 import 하게 된다.
//   라우트는 이 이름을 그대로 다시 내보낸다 — tests/reel-routes.test.js 가 거기서 부른다.
export function mergeImages(cuts, made) {
  return (cuts || []).map((c) => (made.has(c.idx) ? { ...c, image: made.get(c.idx) } : c));
}

// 스토리보드 **한 장**을 사서 칸으로 자르고 우리 버킷에 둔다. 돌려주는 것은 `idx → image`
// 맵이고, 저장은 부르는 쪽이 한다(라우트는 실패해도 만든 것만 병합해야 하기 때문이다).
//
// ★★ 2026-08-31 — 라우트에서 그대로 옮겨 왔다. 두 곳이 이 길을 쓴다:
//     ① `POST /api/reel/[id]/images` — 사장님이 그림을 만들 때
//     ② `retryOneShotWithoutFaces` — 굽는 쪽이 초상으로 거절했을 때 얼굴을 낮춰 다시 그릴 때
//   ②가 ①을 HTTP 로 부르지 않는 이유는 값 때문이다 — 라우트에는 `requireVideoCharge` 와
//   회차 카운터(`imageTries`)가 붙어 있는데, **우리 쪽 거절로 다시 그리는 것**에 사장님의
//   회차나 크레딧을 먹이면 안 된다. 원가 그물(`assertBudget`)은 generateImage 안에 있어
//   이 길로도 그대로 돈다.
// ★ 생성 호출이 **한 번**이라 원장에도 한 줄만 적힌다. 칸으로 나누는 것은 그 뒤의 우리 일이다.
export async function drawStoryboardSheet({
  project, cuts, grid, note, projectId, ownerId, aspect, resolution,
  generateImage: genImpl, loadStoryboardRefs: refsImpl,
}) {
  const imagegen = await import("../imagegen.js");
  const gen = genImpl || imagegen.generateImage;
  const loadRefs = refsImpl || (await import("../cut-refs.js")).loadStoryboardRefs;
  const { resolutionForProject } = await import("../clip-limits.js");
  const aspect_ratio = aspect || project?.settings?.aspect_ratio || "9:16";
  // ★ 화질을 안 넘기면 **프로젝트가 정한 값**으로 돈다 — 재시도 쪽이 imagegen 을 안 물게
  //   하려는 것이다(부르는 자리마다 같은 자를 손으로 옮겨 적으면 갈린다).
  const res = resolution === undefined ? imagegen.imageResolutionFor(project) : resolution;

  const { refs } = await loadRefs(project);
  const prompt = buildStoryboardPromptImpl(project, cuts, grid, note, refs);
  const out = await gen({
    prompt,
    aspect_ratio: grid.canvas,
    projectId,
    resolution: res,
    refs,
    imageSize: storyboardImageSize(grid, aspect_ratio, resolutionForProject(project)),
  });
  // 여기서부터는 **우리 바이트**다 — 내려받아 자르고 우리 버킷에 둔다.
  const cells = await cropStoryboardCells(await fetchImageBytes(out.url), grid, { aspect: aspect_ratio });
  const urls = await saveStoryboardCells(cells, ownerId);
  const made = new Map();
  cuts.forEach((cut, i) => {
    if (!urls[i]) return;
    made.set(cut.idx, { url: urls[i], of: prompt, sheet: out.url, cell: i });
  });
  return made;
}
