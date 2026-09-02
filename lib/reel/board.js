// 스토리보드 **보드** — 사람이 보고 내려받는 한 장 (2026-09-02 사장님 요청).
//
// ★★★ 출력이 둘이고 원천은 하나다.
//   · **모델용** = r2v 시트(lib/reel/storyboard.js). 격자 그림 한 장이고 **글자가 없다**.
//     이 파일은 그 경로를 **한 줄도 안 건드린다** — 각인(video.of)이 그 위에 서 있어서
//     한 글자만 달라져도 이미 산 클립이 낡는다.
//   · **사람용** = 이 보드. 번호·타임코드·카메라·연기·대사가 붙은 카드 격자.
//
// ★★ 값이 0원이다 — fal 도 LLM 도 안 부른다. 이미 있는 컷 데이터를 다르게 그리기만 한다.
//
// ★★ 글자는 **폰트를 심어서** 그린다. sharp 의 SVG 렌더러는 시스템 폰트를 쓰는데 배포
//   (리눅스 컨테이너)에는 한글 폰트가 없다 — 심지 않으면 로컬에서만 멀쩡하고 프로덕션에서
//   두부(□□□)가 된다. 이 저장소가 자막에서 이미 밟은 함정이라 여기서는 처음부터 심는다.
//   ★ 폰트 폴더는 **public/fonts** 다(assets/ 가 아니다 — 폴더가 둘이라 매번 틀린 쪽을 짚었다).
//
// ★★★ **그리는 순서가 계약이다** — 바탕 → **컷 그림** → 글자.
//   처음에 글자를 바탕에 그리고 그림을 위에 얹었더니 **번호·타임코드 배지가 통째로
//   가려졌다**(2026-09-02, 실제로 그려 보고 알았다. 판으로는 안 잡히는 결함이다).
//   그래서 글자층은 **배경이 없는 별도 SVG**로 맨 위에 얹는다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { aspectFor } from "../aspects.js";

// 카드가 이 아래로 내려가면 무엇이 그려졌는지 알 수 없다 — ③그림이 2026-08-25 에 배운 값
// (86px 썸네일로는 제품 로고 누락을 못 알아본다)에서 왔다.
export const MIN_CARD_W = 260;

const BASE_W = 1600;
const CAP_RATIO = 0.34;   // 캡션 높이 / 카드 폭
const GAP_RATIO = 0.045;  // 카드 사이 / 카드 폭
const PAD_RATIO = 0.04;   // 가장자리 여백 / 캔버스 폭
const HEADER_RATIO = 0.13; // 머리글 높이 / 캔버스 높이

// ── 배치: **비율이 열 수를 정하고, 격자는 캔버스를 채운다**
//
// 열 수를 표로 박지 않는다. 목표 비율에 가장 가까워지는 열 수를 고르면 9:16 은 자연히 적은
// 열, 16:9 는 많은 열이 된다 — 표로 박으면 컷 수가 바뀔 때 그 표만 낡는다.
export function boardLayout(cutCount, aspectId) {
  const a = aspectFor(aspectId);           // 모르는 값은 기본(9:16)으로 떨어진다
  const target = a.width / a.height;
  const imgAR = a.width / a.height;        // 컷 그림도 프로젝트 비율이다
  const n = Math.max(1, cutCount || 0);
  const cardH1 = 1 / imgAR + CAP_RATIO;    // 단위 카드(폭 1)의 높이

  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const gw = cols + GAP_RATIO * (cols - 1);
    const gh = rows * cardH1 + GAP_RATIO * (rows - 1);
    // 로그 거리 — 가로/세로 어느 쪽으로 빗나가든 같은 무게로 본다.
    const score = Math.abs(Math.log((gw / gh) / target));
    if (!best || score < best.score) best = { cols, rows, gw, gh, score };
  }

  // 절대 크기 — 캔버스는 **정확히 목표 비율**이고, 카드가 최소 크기를 지킬 때까지 키운다.
  let width = BASE_W;
  let geo;
  for (let i = 0; i < 60; i++) {
    geo = fit(width, target, best);
    if (geo.cardW >= MIN_CARD_W) break;
    width = Math.round(width * 1.12);
  }

  return {
    cols: best.cols,
    rows: best.rows,
    width,
    height: geo.height,
    gap: geo.cardW * GAP_RATIO,
    pad: width * PAD_RATIO,
    header: { h: geo.headerH },
    origin: { x: geo.originX, y: geo.originY },
    card: { w: geo.cardW, h: geo.cardW * cardH1, imgH: geo.cardW / imgAR, capH: geo.cardW * CAP_RATIO },
  };
}

// 격자를 **캔버스 안에 채워 넣고 가운데 세운다.** 위로 붙이면 아래가 통째로 빈다
// (2026-09-02 첫 렌더가 그랬다 — 사장님 지시는 "그 안에서 내용을 채울 수 있게" 였다).
function fit(width, target, best) {
  const height = Math.round(width / target);
  const pad = width * PAD_RATIO;
  const headerH = height * HEADER_RATIO;
  const areaW = width - 2 * pad;
  const areaH = height - 2 * pad - headerH;
  const cardW = Math.min(areaW / best.gw, areaH / best.gh);
  return {
    height, headerH, cardW,
    originX: (width - cardW * best.gw) / 2,
    originY: pad + headerH + (areaH - cardW * best.gh) / 2,
  };
}

// ── 글자
const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// 카드 한 장이 앉을 자리. **마지막 줄이 덜 찼으면 그 줄만 가운데로 민다** — 안 그러면
// 5컷을 3열로 놓을 때 마지막 줄이 왼쪽으로 쏠려 보드가 기운 것처럼 보인다(2026-09-02 실측).
export function cardAt(L, i, total) {
  const row = Math.floor(i / L.cols);
  const col = i % L.cols;
  const inRow = Math.min(L.cols, total - row * L.cols);
  const rowW = inRow * L.card.w + (inRow - 1) * L.gap;
  const fullW = L.cols * L.card.w + (L.cols - 1) * L.gap;
  const shift = (fullW - rowW) / 2;
  return {
    x: L.origin.x + shift + col * (L.card.w + L.gap),
    y: L.origin.y + row * (L.card.h + L.gap),
  };
}

export function timecode(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// 한 줄에 몇 글자가 들어가나 — **칸 폭과 글자 크기에서 낸다.**
// 처음엔 16자로 박아 뒀다가 3단 캡션이 서로 **겹쳐서** 알았다(실제로 그려 보고).
// 한글은 한 글자가 대략 글자크기만큼, 라틴은 그 절반쯤 먹는다.
function perLineFor(pxWidth, fontSize, sample) {
  const ratio = /[가-힣]/.test(String(sample || "")) ? 1.0 : 0.55;
  return Math.max(4, Math.floor(pxWidth / (fontSize * ratio)));
}

function wrap(text, perLine, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  let dropped = false;
  for (const w of words) {
    if (!cur) { cur = w.length > perLine ? w.slice(0, perLine) : w; continue; }
    if ((cur + " " + w).length <= perLine) cur += " " + w;
    else if (lines.length + 1 < maxLines) { lines.push(cur); cur = w; }
    else { dropped = true; break; }
  }
  if (cur) lines.push(cur);
  if (dropped && lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, "…");
  return lines.slice(0, maxLines);
}

let FONT_B64 = null;
function fontBase64() {
  if (FONT_B64 !== null) return FONT_B64;
  try {
    FONT_B64 = readFileSync(path.resolve(process.cwd(), "public/fonts/subtitle-basic.otf")).toString("base64");
  } catch {
    // 폰트를 못 읽어도 보드는 나온다 — 글자만 기본 폰트로 떨어진다. 던지지 않는 이유:
    // 보드는 곁들이는 산출물이라 여기서 멈추면 화면 전체가 죽는다.
    FONT_B64 = "";
  }
  return FONT_B64;
}

// 셋째 칸은 **대사 우선, 없으면 조명**이다. 지금 흐름은 내레이션을 영상 전체 한 벌로
// 뽑아서(2026-08-27) 컷별 sentence 가 비어 있다 — 대사만 두면 모든 카드가 빈 칸이 된다
// (실데이터로 확인했다). 조명은 항상 채워져 있고 참조 보드의 셋째 칸과 성격이 같다.
function thirdOf(cut) {
  const said = String(cut?.sentence || "").trim();
  return said ? { label: "대사", text: said } : { label: "LIGHTING", text: cut?.lighting || "" };
}

// 글자층 — **배경이 없다.** 컷 그림 위에 얹히기 때문이다(파일 머리말의 순서 계약).
export function boardSvg({ project, cuts = [], layout, withBackground = true }) {
  const L = layout || boardLayout(cuts.length, project?.settings?.aspect_ratio);
  const s = project?.settings || {};
  const font = fontBase64();
  const W = Math.round(L.width);
  const H = Math.round(L.height);

  const fs = L.card.w * 0.05;
  const fsLabel = L.card.w * 0.036;
  const fsBadge = L.card.w * 0.07;

  const p = [];
  p.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<style>${font ? `@font-face{font-family:"SB";src:url(data:font/otf;base64,${font}) format("opentype");}` : ""}
      text{font-family:"SB",sans-serif;fill:#1d2321}
      .lbl{fill:#7c8a83;letter-spacing:.05em}
      .cap{fill:#2c3733}
      .bt{fill:#ffffff;font-weight:700}
      .h1{fill:#1d3227;font-weight:700}
      .meta{fill:#4a5a52}
    </style>`
  );
  if (withBackground) p.push(`<rect width="100%" height="100%" fill="#f7f4ee"/>`);

  // ── 머리글 — **세로로 쌓는다**(제목 → 메타 → 내레이션), 셋 다 전체 폭을 쓴다.
  //
  // ★★ 처음엔 왼쪽 제목 / 오른쪽 내레이션으로 **가로로 나눴다가 두 번 겹쳤다**(2026-09-02).
  //   원인은 글자 폭을 못 재는 것이다 — SVG 를 sharp 로 굽는 구조라 실제 폭을 알 수 없고,
  //   글꼴마다 비율이 달라 상수로 맞히면 반드시 어긋난다(볼드 세리프는 0.85, 처음 쓴 값은
  //   0.62 였다). **가로 경계를 없애면 그 종류의 결함이 통째로 사라진다.**
  const headTop = L.pad;
  const fullW = W - 2 * L.pad;
  const TITLE = "STORYBOARD";
  // 그래도 제목은 폭을 넘지 않게 가둔다 — 이제 넘칠 상대가 없으니 여유롭게 잡는다.
  const fsTitle = Math.min(L.header.h * 0.30, fullW / (TITLE.length * 0.85));
  const fsMeta = L.header.h * 0.13;
  const fsN = L.header.h * 0.11;
  p.push(
    `<text class="h1" x="${L.pad}" y="${headTop + L.header.h * 0.30}" font-size="${fsTitle}">${TITLE}</text>`,
    `<text class="meta" x="${L.pad}" y="${headTop + L.header.h * 0.53}" font-size="${fsMeta}">${esc(
      `${s.target_seconds || s.seconds || "—"}초 · ${s.aspect_ratio || "9:16"} · ${s.style || "—"} · ${s.mood || "—"} · 컷 ${cuts.length}개`
    )}</text>`
  );
  const narration = String(project?.scenario?.narration?.text || "").trim();
  if (narration) {
    // 두 줄까지 — 머리글 아래를 안 넘도록 줄 높이까지 계산한다.
    wrap(narration, perLineFor(fullW, fsN, narration), 2).forEach((ln, i) =>
      p.push(`<text class="meta" x="${L.pad}" y="${headTop + L.header.h * 0.75 + i * fsN * 1.35}" font-size="${fsN}">${esc(ln)}</text>`)
    );
  }

  // ── 카드
  let acc = 0;
  cuts.forEach((cut, i) => {
    const { x, y } = cardAt(L, i, cuts.length);
    const start = acc;
    acc += Number(cut?.seconds) || 0;

    // 캡션 바탕(그림 아래라 가릴 것이 없다)
    p.push(`<rect x="${x}" y="${y + L.card.imgH}" width="${L.card.w}" height="${L.card.capH}" fill="#ffffff"/>`);

    // 번호·타임코드 배지 — **그림 위**에 온다
    const bw = fsBadge * 1.7;
    p.push(
      `<rect x="${x}" y="${y}" width="${bw}" height="${bw}" fill="#2f5d3f"/>`,
      `<text class="bt" x="${x + bw / 2}" y="${y + bw * 0.71}" font-size="${fsBadge}" text-anchor="middle">${i + 1}</text>`
    );
    const tcW = fsBadge * 4.6;
    p.push(
      `<rect x="${x + L.card.w - tcW}" y="${y}" width="${tcW}" height="${fsBadge * 1.5}" fill="#2f5d3f" opacity="0.92"/>`,
      `<text class="bt" x="${x + L.card.w - tcW / 2}" y="${y + fsBadge * 1.02}" font-size="${fsBadge * 0.6}" text-anchor="middle">${esc(
        `${timecode(start)}-${timecode(acc)}`
      )}</text>`
    );

    // 캡션 3단 — 칸 폭에서 줄바꿈을 낸다(고정 글자 수는 겹친다)
    const third = thirdOf(cut);
    const cells = [
      { label: "CAMERA", text: cut?.camera || "" },
      { label: "ACTION", text: cut?.action || "" },
      { label: third.label, text: third.text },
    ];
    const cw = L.card.w / 3;
    const inner = cw * 0.9;
    cells.forEach((c, k) => {
      const cx = x + k * cw + cw * 0.05;
      const cy = y + L.card.imgH + L.card.capH * 0.24;
      p.push(`<text class="lbl" x="${cx}" y="${cy}" font-size="${fsLabel}">${esc(c.label)}</text>`);
      wrap(c.text, perLineFor(inner, fs, c.text), 4).forEach((ln, li) =>
        p.push(`<text class="cap" x="${cx}" y="${cy + fs * (1.4 + li * 1.12)}" font-size="${fs}">${esc(ln)}</text>`)
      );
    });
  });

  p.push("</svg>");
  return p.join("\n");
}

// ── 그리기
//
// ★ sharp 는 인자로 받는다 — 배치·글자 판정과 그리기를 같은 자리에 두지 않는다.
export async function drawBoard({ project, cuts = [], readImage, sharpImpl }) {
  const sharp = sharpImpl || (await import("sharp")).default;
  const layout = boardLayout(cuts.length, project?.settings?.aspect_ratio);
  const W = Math.round(layout.width);
  const H = Math.round(layout.height);

  const composites = [];
  for (let i = 0; i < cuts.length; i++) {
    const url = cuts[i]?.image?.url;
    if (!url || !readImage) continue;
    // ★ 한 장을 못 읽어도 보드는 나온다 — 그 칸만 바탕색으로 남는다.
    const bytes = await readImage(url).catch(() => null);
    if (!bytes) continue;
    const buf = await sharp(bytes)
      .resize(Math.round(layout.card.w), Math.round(layout.card.imgH), { fit: "cover" })
      .toBuffer().catch(() => null);
    if (!buf) continue;
    // ★ 자리 계산은 cardAt **하나**다 — 여기서 손으로 다시 적으면 글자와 그림이 어긋난다.
    const at = cardAt(layout, i, cuts.length);
    composites.push({ input: buf, left: Math.round(at.x), top: Math.round(at.y) });
  }

  // ★★ 순서: 바탕 → 컷 그림 → **글자층**. 글자를 먼저 그리면 그림이 배지를 덮는다.
  const bg = await sharp({
    create: { width: W, height: H, channels: 3, background: "#f7f4ee" },
  }).png().toBuffer();
  const overlay = Buffer.from(boardSvg({ project, cuts, layout, withBackground: false }));
  const bytes = await sharp(bg).composite([...composites, { input: overlay }]).png().toBuffer();
  return { bytes, layout };
}
