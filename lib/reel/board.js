// 스토리보드 **보드** — 사람이 보고 내려받는 한 장 (2026-09-02 사장님 요청).
//
// ★★★ 출력이 둘이고 원천은 하나다.
//   · **모델용** = r2v 시트(lib/reel/storyboard.js). 격자 그림 한 장이고 **글자가 없다**.
//     이 파일은 그 경로를 **한 줄도 안 건드린다** — 각인(video.of)이 그 위에 서 있어서
//     한 글자만 달라져도 이미 산 클립이 낡는다.
//   · **사람용** = 이 보드. 참조 시안(2026-09-02 사장님 제공)의 문법을 따른다 —
//     세리프 제목 + 테두리 친 메타 상자들 + 흰 카드(둥근 모서리·테두리·그림 안쪽 여백) +
//     번호 배지·타임코드 알약 + 아이콘 붙은 3단 캡션.
//
// ★★ 값이 0원이다 — fal 도 LLM 도 안 부른다. 이미 있는 컷 데이터를 sharp 로 다시 그린다.
//
// ★★★ 글자는 **폰트 윤곽선(path)으로 굽는다** — <text> 를 쓰지 않는다.
//   sharp 의 SVG 렌더러는 @font-face(base64 포함)를 **무시하고 시스템 폰트로 그린다**.
//   실측(2026-09-02): 서로 다른 폰트 6종을 심어 렌더했더니 전부 같은 모양이 나왔다 —
//   Windows 는 시스템 한글 폰트가 가려 줬지만 배포(리눅스)에는 그 폰트가 없어 두부가 된다.
//   opentype.js 로 글자를 path 로 바꿔 넣으면 폰트 시스템을 아예 안 거치므로 어느 환경에서든
//   픽셀까지 같다. ★ 검사 가능하게 각 글자 묶음에 data-text 를 남긴다(판이 그것을 읽는다).
//
// ★★★ **그리는 순서가 계약이다** — 바탕(카드) → **컷 그림** → 글자·배지.
//   글자를 바탕에 그리고 그림을 위에 얹었더니 번호·타임코드 배지가 통째로 가려졌다
//   (2026-09-02, 실제로 그려 보고 알았다). 그래서 layer 를 base/overlay 로 가른다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { aspectFor } from "../aspects.js";
import { AD_MOODS } from "../ad/options.js";
import { styleFor } from "../styles.js";
// ★★ ESM 빌드를 **경로로 직접** 가리킨다. 이 패키지는 이중 빌드다(main=CJS·module=ESM,
//   exports 필드 없음) — 맨이름 "opentype.js" 로 부르면 웹팩은 ESM(named parse OK)을,
//   순수 Node 는 CJS(UMD, named 불가)를 봐서 **한쪽에서만 깨진다**(측정 스크립트가 깨졌다).
//   .mjs 를 직접 가리키면 웹팩·vitest·순수 Node 세 곳 모두 같은 파일을 본다.
import { parse as parseFontFile } from "opentype.js/dist/opentype.mjs";

// 카드가 이 아래로 내려가면 무엇이 그려졌는지 알 수 없다 — ③그림이 2026-08-25 에 배운 값.
export const MIN_CARD_W = 260;

const BASE_W = 1600;
// ★ 2026-09-02 사장님 지시 — "이미지컷들로 보드 안을 가득, 불필요한 여백 최소화".
//   머리글은 제목 한 줄뿐이고(킥커·메타 상자·내레이션 제거), 여백·간격을 최소로 죈다.
const PADC_RATIO = 0.03;   // 카드 안 여백 / 카드 폭
const CAP_RATIO = 0.27;    // 캡션 높이 / 카드 폭
const GAP_RATIO = 0.028;   // 카드 사이 / 카드 폭
const PAD_RATIO = 0.018;   // 캔버스 가장자리 / 캔버스 폭
// ★ 머리글은 **폭 기준**이다 — 캔버스 세로가 내용에 맞춰 줄어들 수 있어(아래 fit)
//   세로 기준으로 잡으면 순환이 생긴다.
const HEADER_W_RATIO = 0.055;

// 기준 판 — 크림 바탕, 진초록 포인트, 흰 카드(참조 시안 그대로).
// ★ 포인트 색은 이제 **영상에서 나온다**(paletteFor) — 이 값은 추출이 안 될 때의 기준이다.
const C = {
  bg: "#F5F1E6",
  ink: "#22301F",
  green: "#2F5D3F",
  body: "#4C554B",
  muted: "#7C8577",
  card: "#FFFFFF",
  line: "#E5DECC",
  divider: "#ECE6D6",
  shadow: "rgba(44,61,47,0.10)",
  imgSlot: "#E9E4D6",
};

// ── 포인트 색 — **영상에서 나온다** (2026-09-02 사장님 선택).
//
// ★★ 규칙: **색상(hue)은 영상이, 명도·채도는 판이** 정한다. 뽑힌 색을 그대로 쓰면
//   흰 글자가 안 서는 밝은 색·촌스러운 원색이 그대로 배지에 앉는다 — 색상만 받고
//   명도·채도는 기준 초록(#2F5D3F ≈ s.34 · l.29)과 같은 자리에 앉힌다.
// ★ 바탕·카드·테두리는 **중립을 지킨다** — 어떤 색이 뽑혀도 판이 안 깨지는 이유다.
// ★ 무채색(채도 < 0.1)은 기준 판으로 떨어진다 — 잿빛의 색상값은 소음이다.

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: sat, l };
}

function hslHex(h, sat, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const pq = 2 * l - q;
  const one = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return pq + (q - pq) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return pq + (q - pq) * (2 / 3 - t) * 6;
    return pq;
  };
  const hex = (v) => Math.round(v * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(one(h + 1 / 3))}${hex(one(h))}${hex(one(h - 1 / 3))}`;
}

// 컷들의 지배색 중 **가장 진한(채도 높은) 것**을 고른다 — 평균은 진흙이 된다
// (노을→밤으로 흐르는 영상을 평균 내면 갈색도 남색도 아닌 탁한 색이 나온다).
export function accentFrom(dominants) {
  let best = null, bestS = 0.1; // 이 밑이면 무채색 — 안 고른다
  for (const d of dominants || []) {
    if (!d) continue;
    const { s: sat } = rgbToHsl(d.r, d.g, d.b);
    if (sat >= bestS) { best = d; bestS = sat; }
  }
  return best;
}

export function paletteFor(rgb) {
  if (!rgb) return { ...C };
  const { h, s: sat } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (sat < 0.1) return { ...C }; // 무채색 — 기준 판
  // ★ 명도는 상수가 아니라 **계약으로** 정한다 — "흰 글자가 선다"(상대 명도 < 0.33).
  //   노랑 계열은 같은 l 에서도 훨씬 밝아서, l=0.29 고정으로는 문턱을 넘는다(판이 잡았다).
  const accent = (() => {
    for (let l = 0.29; l >= 0.16; l -= 0.02) {
      const hex = hslHex(h, 0.34, l);
      const [r2, g2, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      if ((0.2126 * r2 + 0.7152 * g2 + 0.0722 * b2) / 255 < 0.33) return hex;
    }
    return hslHex(h, 0.34, 0.16);
  })();
  return {
    ...C,
    green: accent, // 배지·제목·아이콘 — 색상은 영상, 명도는 계약이 정한다
    ink: hslHex(h, 0.19, 0.15),
    body: hslHex(h, 0.09, 0.31),
    muted: hslHex(h, 0.10, 0.50),
  };
}

// ── 배치: **비율이 열 수를 정하고, 격자는 캔버스를 채운다**
// 카드 그림의 비율 — **영상 비율 그대로**다(2026-09-02 사장님 최종 지시: "이미지도 같은
// 비율로 다시"). 한때 격자를 채우는 자유 변수로 풀었다가(같은 날 앞선 지시) 도로 고정했다 —
// 사장님이 결과를 보고 고른 것이니 다시 풀 때도 지시가 있어야 한다.
export function boardLayout(cutCount, aspectId) {
  const a = aspectFor(aspectId);           // 모르는 값은 기본(9:16)으로 떨어진다
  const target = a.width / a.height;
  const n = Math.max(1, cutCount || 0);

  // 격자가 앉을 자리(머리글·여백 제외)의 비율 — 폭과 무관하게 비율만으로 나온다.
  const areaW1 = 1 - 2 * PAD_RATIO;
  const areaH1 = 1 / target - HEADER_W_RATIO - 2 * PAD_RATIO;
  const areaAR = areaW1 / Math.max(0.05, areaH1);

  // 그림 비율은 영상 비율 — 열 수는 "격자가 앉을 자리를 가장 덜 남기는" 쪽을 고른다.
  const imgAR = target;
  const cardH1 = 2 * PADC_RATIO + (1 - 2 * PADC_RATIO) / imgAR + CAP_RATIO;
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const gw = cols + GAP_RATIO * (cols - 1);
    const gh = rows * cardH1 + GAP_RATIO * (rows - 1);
    const score = Math.abs(Math.log((gw / gh) / areaAR)); // 자투리 — 로그 거리
    if (!best || score < best.score) best = { cols, rows, gw, gh, score };
  }

  let width = BASE_W;
  let geo;
  for (let i = 0; i < 60; i++) {
    geo = fit(width, target, best, cardH1);
    if (geo.cardW >= MIN_CARD_W) break;
    width = Math.round(width * 1.12);
  }

  const cardW = geo.cardW;
  const padc = cardW * PADC_RATIO;
  const imgW = cardW - 2 * padc;
  return {
    cols: best.cols,
    rows: best.rows,
    width,
    height: geo.height,
    gap: cardW * GAP_RATIO,
    pad: width * PAD_RATIO,
    header: { h: geo.headerH },
    origin: { x: geo.originX, y: geo.originY },
    card: {
      w: cardW,
      h: cardW * cardH1,
      pad: padc,
      imgW,
      imgH: imgW / imgAR,
      capH: cardW * CAP_RATIO,
      r: Math.max(8, cardW * 0.028),      // 카드 모서리
      imgR: Math.max(6, cardW * 0.02),    // 그림 모서리
    },
  };
}

// ★★★ 캔버스 세로는 **내용에 맞춘다**(2026-09-02 사장님 지시: "위아래 여백 최소화").
//   고정 비율 그림을 비율 강제 캔버스에 앉히면 자투리가 수학적으로 남는다 — 머리판으로
//   몰아 봤지만(4176d4f) 그래도 커서, 세로를 내용 높이로 줄이는 쪽으로 바꿨다.
//   · 내용이 비율 높이보다 **짧으면** → 세로를 줄인다(위아래 여백 0). 보드가 정확한
//     영상 비율에서 벗어나는 것이 대가다 — 폭 기준 비율보다 납작해지지는 않는다.
//   · 내용이 비율 높이보다 **길면**(가로 영상) → 비율 높이를 지키고 카드를 줄인다.
function fit(width, target, best, cardH1) {
  const pad = width * PAD_RATIO;
  const headerH = width * HEADER_W_RATIO;
  const areaW = width - 2 * pad;
  const ratioH = Math.round(width / target);
  const cardWFull = areaW / best.gw;                       // 폭을 꽉 채우는 카드
  const contentH = Math.round(2 * pad + headerH + cardWFull * best.gh);
  if (contentH <= ratioH) {
    return { height: contentH, headerH, cardW: cardWFull, originX: pad, originY: pad + headerH };
  }
  const areaH = ratioH - 2 * pad - headerH;
  const cardW = areaH / best.gh;
  return {
    height: ratioH, headerH, cardW,
    originX: (width - cardW * best.gw) / 2,
    originY: pad + headerH,
  };
}

// 카드 한 장이 앉을 자리 — 마지막 줄이 덜 찼으면 그 줄만 가운데로 민다.
export function cardAt(L, i, total) {
  const row = Math.floor(i / L.cols);
  const col = i % L.cols;
  const inRow = Math.min(L.cols, total - row * L.cols);
  const rowW = inRow * L.card.w + (inRow - 1) * L.gap;
  const fullW = L.cols * L.card.w + (L.cols - 1) * L.gap;
  return {
    x: L.origin.x + (fullW - rowW) / 2 + col * (L.card.w + L.gap),
    y: L.origin.y + row * (L.card.h + L.gap),
  };
}

export function timecode(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── 글꼴: 세 벌을 판다 — 제목(명조) · 라벨(굵은 고딕) · 본문(고딕).
//   ★ 폴더는 public/fonts 다(assets/ 아님 — 폴더가 둘이라 매번 틀린 쪽을 짚었다).
let FONTS = null;
function loadFonts() {
  if (FONTS !== null) return FONTS;
  const one = (f) => {
    const b = readFileSync(path.resolve(process.cwd(), `public/fonts/${f}`));
    return parseFontFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  try {
    FONTS = {
      serif: one("subtitle-serif.ttf"),   // 제목 — 참조 시안의 세리프
      bold: one("subtitle-basic.otf"),    // 라벨·배지 — 굵은 고딕
      body: one("subtitle-soft.ttf"),     // 본문 — 고딕
    };
  } catch {
    // 폰트를 못 읽어도 보드는 나온다 — <text> 폴백(로컬에서만 안전, 배포에선 두부).
    // 던지지 않는 이유: 곁들이는 산출물이 화면 전체를 죽이면 안 된다.
    FONTS = false;
  }
  return FONTS;
}

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// 글자 폭 — 실측이다(getAdvanceWidth). 상수 비율로 맞히던 시절 캡션이 겹치고 제목이
// 내레이션을 침범했다(2026-09-02). 재는 도구가 생겼으니 다시는 추정하지 않는다.
function adv(font, str, size) {
  return font ? font.getAdvanceWidth(String(str), size) : String(str).length * size * 0.6;
}

// 한 글자 묶음 → path. data-text 가 검사 가능한 흔적이다.
function glyph(fontKey, str, x, y, size, fill, anchor = "start") {
  const F = loadFonts();
  const s = String(str ?? "");
  if (!s) return "";
  if (F === false) {
    const an = anchor === "start" ? "" : ` text-anchor="${anchor}"`;
    return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${an} data-text="${esc(s)}">${esc(s)}</text>`;
  }
  const font = F[fontKey] || F.body;
  const w = adv(font, s, size);
  const xx = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  const d = font.getPath(s, xx, y, size).toPathData(2);
  return `<g data-text="${esc(s)}"><path d="${d}" fill="${fill}"/></g>`;
}

// 픽셀 폭으로 접는다 — 낱말 단위, 안 들어가는 낱말은 글자 단위로 자른다.
function wrapPx(fontKey, str, size, maxW, maxLines) {
  const F = loadFonts();
  const font = F === false ? null : (F[fontKey] || F.body);
  const fits = (t) => adv(font, t, size) <= maxW;
  const words = String(str || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  const pushCur = () => { if (cur) { lines.push(cur); cur = ""; } };
  for (const w of words) {
    if (lines.length >= maxLines) break;
    const cand = cur ? `${cur} ${w}` : w;
    if (fits(cand)) { cur = cand; continue; }
    pushCur();
    if (lines.length >= maxLines) break;
    if (fits(w)) { cur = w; continue; }
    let piece = "";
    for (const ch of w) {
      if (fits(piece + ch)) piece += ch;
      else { lines.push(piece); piece = ch; if (lines.length >= maxLines) break; }
    }
    cur = piece;
  }
  pushCur();
  const out = lines.slice(0, maxLines);
  if (out.length === maxLines && !fits(words.join(" ")) && out.join(" ").length < String(str || "").trim().length) {
    out[maxLines - 1] = out[maxLines - 1].replace(/.$/, "…");
  }
  return out;
}

// ── 아이콘 — 획으로 그린다(폰트 무관). s = 한 변, (x,y) = 좌상단.
function icon(kind, x, y, s, color) {
  const sw = Math.max(1.4, s * 0.11);
  const k = (d) => `<g stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
  const cx = x + s / 2, cy = y + s / 2;
  switch (kind) {
    case "clock":
      return k(`<circle cx="${cx}" cy="${cy}" r="${s * 0.42}"/><path d="M ${cx} ${cy - s * 0.24} L ${cx} ${cy} L ${cx + s * 0.18} ${cy + s * 0.1}"/>`);
    case "frame":
      return k(`<rect x="${x + s * 0.08}" y="${y + s * 0.16}" width="${s * 0.84}" height="${s * 0.68}" rx="${s * 0.1}"/>`);
    case "grid":
      return k(`<rect x="${x + s * 0.1}" y="${y + s * 0.1}" width="${s * 0.34}" height="${s * 0.34}" rx="${s * 0.06}"/><rect x="${x + s * 0.56}" y="${y + s * 0.1}" width="${s * 0.34}" height="${s * 0.34}" rx="${s * 0.06}"/><rect x="${x + s * 0.1}" y="${y + s * 0.56}" width="${s * 0.34}" height="${s * 0.34}" rx="${s * 0.06}"/><rect x="${x + s * 0.56}" y="${y + s * 0.56}" width="${s * 0.34}" height="${s * 0.34}" rx="${s * 0.06}"/>`);
    case "wave":
      return `<g fill="${color}">` +
        [0.14, 0.38, 0.62, 0.86].map((fx, i) => {
          const h = [0.4, 0.8, 0.6, 0.32][i] * s;
          return `<rect x="${x + fx * s - sw / 2}" y="${cy - h / 2}" width="${sw}" height="${h}" rx="${sw / 2}"/>`;
        }).join("") + "</g>";
    case "camera":
      return k(`<rect x="${x + s * 0.06}" y="${y + s * 0.24}" width="${s * 0.88}" height="${s * 0.6}" rx="${s * 0.1}"/><circle cx="${cx}" cy="${y + s * 0.54}" r="${s * 0.17}"/><path d="M ${x + s * 0.32} ${y + s * 0.24} L ${x + s * 0.4} ${y + s * 0.12} L ${x + s * 0.6} ${y + s * 0.12} L ${x + s * 0.68} ${y + s * 0.24}"/>`);
    case "play":
      return k(`<circle cx="${cx}" cy="${cy}" r="${s * 0.42}"/>`) +
        `<path d="M ${cx - s * 0.1} ${cy - s * 0.16} L ${cx + s * 0.18} ${cy} L ${cx - s * 0.1} ${cy + s * 0.16} Z" fill="${color}"/>`;
    case "sun":
      return k(`<circle cx="${cx}" cy="${cy}" r="${s * 0.2}"/>` +
        [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const r1 = s * 0.3, r2 = s * 0.44, rad = (deg * Math.PI) / 180;
          return `<path d="M ${cx + r1 * Math.cos(rad)} ${cy + r1 * Math.sin(rad)} L ${cx + r2 * Math.cos(rad)} ${cy + r2 * Math.sin(rad)}"/>`;
        }).join(""));
    case "quote":
      return glyph("bold", '"', x, y + s * 0.9, s * 1.15, color);
    default:
      return "";
  }
}

// 셋째 칸 — 대사 우선, 없으면 조명. 지금 흐름은 내레이션이 영상 전체 한 벌이라(08-27)
// 컷별 sentence 가 비어 있다 — 대사만 두면 모든 카드가 빈 칸이다(실데이터로 확인).
function thirdOf(cut) {
  const said = String(cut?.sentence || "").trim();
  return said
    ? { label: "대사", text: said, icon: "quote" }
    : { label: "LIGHTING", text: cut?.lighting || "", icon: "sun" };
}

// ── SVG. layer: "full"(기본, 검사용) · "base"(바탕+카드) · "overlay"(글자·배지 — 배경 없음)
export function boardSvg({ project, cuts = [], layout, layer = "full", palette }) {
  // 포인트 색 판 — 안 주면 기준(레퍼런스 초록). base/overlay 두 층이 **같은 판**을 받아야 한다.
  const P = palette || paletteFor(null);
  const L = layout || boardLayout(cuts.length, project?.settings?.aspect_ratio);
  const s = project?.settings || {};
  const W = Math.round(L.width);
  const H = Math.round(L.height);
  const base = [];
  const over = [];

  if (layer !== "overlay") base.push(`<rect width="100%" height="100%" fill="${P.bg}"/>`);

  // ── 머리글 — **제목 한 줄뿐이다**(2026-09-02 사장님 지시: "고급스러운·실사, 초·사이즈·
  //   컷수·내레이션 전부 제거, 이미지컷들로 가득"). 킥커·메타 상자·내레이션 상자를 걷어냈다 —
  //   되살릴 일이 생기면 git 이력(5624c1b)에 그 코드가 있다.
  // 제목은 작아진 머리판 띠의 세로 가운데에 선다.
  const TITLE = "STORYBOARD";
  const headSpace = Math.max(L.header.h, L.origin.y - L.pad);
  let fsTitle = Math.min(headSpace * 0.62, W * 0.05);
  {
    const F = loadFonts();
    const maxW = W - 2 * L.pad;
    const w0 = adv(F === false ? null : F.serif, TITLE, fsTitle);
    if (w0 > maxW) fsTitle = (fsTitle * maxW) / w0;
  }
  over.push(glyph("serif", TITLE, L.pad, L.pad + headSpace / 2 + fsTitle * 0.33, fsTitle, P.green));

  // ── 카드
  let acc = 0;
  cuts.forEach((cut, i) => {
    const { x, y } = cardAt(L, i, cuts.length);
    const start = acc;
    acc += Number(cut?.seconds) || 0;
    const cw = L.card.w;
    const padc = L.card.pad;
    const imgX = x + padc, imgY = y + padc;

    // 바탕층: 그림자 → 흰 카드 → 그림 자리(빈 칸 색)
    base.push(
      `<rect x="${x}" y="${y + cw * 0.008}" width="${cw}" height="${L.card.h}" rx="${L.card.r}" fill="${P.shadow}"/>`,
      `<rect x="${x}" y="${y}" width="${cw}" height="${L.card.h}" rx="${L.card.r}" fill="${P.card}" stroke="${P.line}" stroke-width="1.5"/>`,
      `<rect x="${imgX}" y="${imgY}" width="${L.card.imgW}" height="${L.card.imgH}" rx="${L.card.imgR}" fill="${P.imgSlot}"/>`
    );

    // 글자층: 번호 배지 · 타임코드 알약 — 그림 **위**
    const bw = cw * 0.105;
    const fsNo = bw * 0.58;
    over.push(
      `<rect x="${imgX + bw * 0.35}" y="${imgY + bw * 0.35}" width="${bw}" height="${bw}" rx="${bw * 0.22}" fill="${P.green}"/>`,
      glyph("bold", String(i + 1), imgX + bw * 0.35 + bw / 2, imgY + bw * 0.35 + bw * 0.68, fsNo, "#FFFFFF", "middle")
    );
    const tcText = `${timecode(start)} - ${timecode(acc)}`;
    const fsTc = bw * 0.34;
    const F = loadFonts();
    const tcW = adv(F === false ? null : F.bold, tcText, fsTc) + fsTc * 1.6;
    const tcH = fsTc * 1.9;
    over.push(
      `<rect x="${imgX + L.card.imgW - tcW - bw * 0.35}" y="${imgY + bw * 0.35}" width="${tcW}" height="${tcH}" rx="${tcH / 2}" fill="${P.green}" opacity="0.95"/>`,
      glyph("bold", tcText, imgX + L.card.imgW - tcW / 2 - bw * 0.35, imgY + bw * 0.35 + tcH * 0.68, fsTc, "#FFFFFF", "middle")
    );

    // 캡션 — 구분선 + 3단(아이콘·라벨·본문), 칸 사이 세로선
    const capTop = imgY + L.card.imgH + padc * 0.9;
    const innerW = L.card.imgW;
    over.push(`<path d="M ${imgX} ${capTop} H ${imgX + innerW}" stroke="${P.divider}" stroke-width="1.5"/>`);
    const third = thirdOf(cut);
    const cells = [
      { icon: "camera", label: "CAMERA", text: cut?.camera || "" },
      { icon: "play", label: "ACTION", text: cut?.action || "" },
      third,
    ];
    const colW = innerW / 3;
    const fsLb = cw * 0.028;
    const fsBd = cw * 0.031;
    cells.forEach((c, k) => {
      const cx0 = imgX + k * colW;
      if (k > 0) over.push(`<path d="M ${cx0} ${capTop + 6} V ${y + L.card.h - padc}" stroke="${P.divider}" stroke-width="1.2"/>`);
      const cx = cx0 + colW * 0.08;
      const iy = capTop + fsLb * 0.9;
      const is = fsLb * 1.25;
      over.push(icon(c.icon, cx, iy, is, P.green));
      over.push(glyph("bold", c.label, cx + is + fsLb * 0.5, iy + is * 0.82, fsLb, P.green));
      wrapPx("body", c.text, fsBd, colW * 0.84, 3).forEach((ln, li) =>
        over.push(glyph("body", ln, cx, iy + is + fsBd * (1.15 + li * 1.3), fsBd, P.body))
      );
    });
  });

  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  const parts = layer === "base" ? base : layer === "overlay" ? over : [...base, ...over];
  return [head, ...parts, "</svg>"].join("\n");
}

// ── 그리기: 바탕(카드) → 컷 그림(둥근 모서리) → 글자·배지
export async function drawBoard({ project, cuts = [], readImage, sharpImpl }) {
  const sharp = sharpImpl || (await import("sharp")).default;
  const layout = boardLayout(cuts.length, project?.settings?.aspect_ratio);
  const W = Math.round(layout.width);
  const H = Math.round(layout.height);
  const imgW = Math.round(layout.card.imgW);
  const imgH = Math.round(layout.card.imgH);

  // 그림 모서리를 둥글게 깎는 마스크 — 카드 문법(참조 시안)의 일부다.
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}"><rect width="${imgW}" height="${imgH}" rx="${Math.round(layout.card.imgR)}" fill="#fff"/></svg>`
  );

  const composites = [];
  const dominants = [];
  for (let i = 0; i < cuts.length; i++) {
    const url = cuts[i]?.image?.url;
    if (!url || !readImage) continue;
    // ★ 한 장을 못 읽어도 보드는 나온다 — 그 칸만 빈 칸 색으로 남는다.
    const bytes = await readImage(url).catch(() => null);
    if (!bytes) continue;
    // 포인트 색 재료 — 이 컷의 지배색(이미 손에 든 바이트라 0원이다).
    const st = await sharp(bytes).stats().catch(() => null);
    if (st?.dominant) dominants.push(st.dominant);
    const buf = await sharp(bytes)
      .resize(imgW, imgH, { fit: "cover" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer()
      .catch(() => null);
    if (!buf) continue;
    const at = cardAt(layout, i, cuts.length);
    composites.push({
      input: buf,
      left: Math.round(at.x + layout.card.pad),
      top: Math.round(at.y + layout.card.pad),
    });
  }

  // 포인트 색 — 컷들의 지배색 중 가장 진한 것에서 color(색상)만 받는다(paletteFor).
  const palette = paletteFor(accentFrom(dominants));
  const bg = await sharp(Buffer.from(boardSvg({ project, cuts, layout, layer: "base", palette }))).png().toBuffer();
  const overlay = Buffer.from(boardSvg({ project, cuts, layout, layer: "overlay", palette }));
  const bytes = await sharp(bg).composite([...composites, { input: overlay }]).png().toBuffer();
  return { bytes, layout };
}
