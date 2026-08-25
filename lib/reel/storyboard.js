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
import { storyboardGridFor } from "./oneshot.js";
import { AD_MOODS, AD_STYLE_LINES } from "../ad/options.js";
import { sizeFor } from "../aspects.js";
import { getStore } from "../store/index.js";

// 칸 하나가 몇 픽셀이어야 하는가 — **굽기 해상도에서 역산한다**(9:16 이면 720×1280).
// 그래야 잘라낸 칸이 클립의 첫 프레임으로 줄어들 뿐, 늘어나지 않는다.
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
export function storyboardImageSize(grid, aspect = "9:16") {
  const [aw, ah] = sizeFor(aspect);
  const k = STORYBOARD_CELL_LONG_SIDE / Math.max(aw, ah);
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
export function planReelImages(cuts, only) {
  const list = Array.isArray(cuts) ? cuts : [];
  const wanted = Array.isArray(only) && only.length ? new Set(only) : null;
  const targets = list
    .filter((c) => (wanted ? wanted.has(c.idx) : !c?.image?.url))
    .map((c) => c.idx);

  const grid = storyboardGridFor(list.length);
  const all = list.length > 0 && targets.length === list.length;
  if (grid && all) return { mode: "storyboard", grid, targets };
  return { mode: "percut", grid: null, targets };
}

// ── 프롬프트 ─────────────────────────────────────────────────────────────
//
// ★ 게이트 D 를 통과한 문장 그대로다(scripts/measure/storyboard-grid.mjs). 특히 **읽는
//   순서를 말로 못 박는 것** — 행이 하나면 순서가 자명하지만 둘부터는 아니다.
// ★ 컷별 프롬프트(lib/cuts.js 의 buildImagePrompt)와 다른 함수인 이유: 저 함수는 컷 하나를
//   화면 하나로 그리는 지문이고, 여기는 **판형이 먼저**인 한 장이다. 같은 함수에 두 뜻을
//   담으면 어느 쪽도 못 고친다.
const one = (v) => (typeof v === "string" ? v.trim() : "");

export function buildStoryboardPrompt(project, cuts, grid, note, refs = []) {
  const n = cuts.length;
  const sc = project?.scenario || {};
  const settings = project?.settings || {};

  const head =
    `A ${n}-panel storyboard arranged as an even grid of ${grid.rows} rows by ${grid.cols} columns. ` +
    `Every panel is a vertical 9:16 frame and all panels are exactly the same size. ` +
    `The panels are read in order like a comic page: ` +
    `left to right across the top row first, then continuing left to right on the next row down. ` +
    `Panel 1 is the top-left corner and panel ${n} is the bottom-right corner. ` +
    `Thin clean even gaps separate the panels, and the grid fills the whole image edge to edge.`;

  // 전 컷이 같아야 하는 것 — 한 장에 함께 그려지므로 **한 번만** 말하면 된다.
  const keep = [];
  if (one(sc.look)) keep.push(`The subject looks the same in every panel: ${one(sc.look)}.`);
  if (one(sc.wardrobe)) keep.push(`The person wears the same throughout: ${one(sc.wardrobe)}.`);
  if (one(sc.environment)) keep.push(`The whole sequence takes place in ${one(sc.environment)}.`);

  const panels = cuts.map((c, i) => {
    const bits = [one(c.shows)];
    if (one(c.camera)) bits.push(one(c.camera));
    return `Panel ${i + 1}: ${bits.filter(Boolean).join(", ")}.`;
  });

  const mood = AD_MOODS.find((m) => m.id === settings.mood)?.line || "";
  const style = AD_STYLE_LINES[settings.style] || "";
  const tone = one(sc.tone);
  const look = [mood, style, tone && `Color treatment: ${tone}`, `Consistent color grade across all ${n} panels.`]
    .filter(Boolean).join(". ");

  // ★ 글자 금지는 격자에서 특히 중요하다 — 모델이 칸마다 번호를 적으려 든다.
  const ban = "No text, no letters, no numbers, no panel numbers, no labels or logos anywhere in the image.";
  // ★★ 사장님이 **말로** 고쳐 달라고 적은 것(2026-08-25). 시나리오 수정 요청과 같은 모양이다.
  //   ★ **전체 한 장 단위**다 — 스토리보드가 한 장이라 그 단위가 맞다. 칸 하나만 다시
  //     만들면 그것만 컷별로 돌아 인물이 다른 칸과 달라진다(08-21 에 하루를 쓴 그 문제).
  //   ★ 안 넘기면 이 줄이 통째로 없어 지문이 예전과 글자 그대로다.
  const ask = typeof note === "string" ? note.trim() : "";
  const fix = ask ? `The client asked for this change — apply it across the whole sheet: ${ask.slice(0, 500)}` : "";

  // ★★ 첨부 사진이 함께 나갈 때 — **그것이 무엇인지 말해 준다**(2026-08-25 사장님 실측).
  //   사진만 실어 보내면 모델이 "분위기 참고"로 읽고 제품을 자기 식으로 다시 그린다.
  //   시나리오는 사진이 있으면 생김새를 **글로 안 적으므로**(lib/ad/scenario.js) 이 문장이
  //   사진과 칸을 잇는 **유일한 자리**다 — 없으면 제품을 정의하는 것이 아무것도 없다.
  //   ★ "모든 칸에서 같게"가 핵심이다. 격자에서는 그 성질이 부작용이 아니라 목적이다.
  const refLine = refs.length
    ? `The attached reference image${refs.length > 1 ? "s show" : " shows"} the real subject. `
      + `Draw it exactly as it appears in the reference — same shape, same colour, same markings — `
      + `and keep it identical in every panel it appears in. Do not redesign it or invent a different one.`
    : "";

  return [head, refLine, keep.join(" "), panels.join("\n"), look, ban, fix].filter(Boolean).join("\n\n");
}

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
