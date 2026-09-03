// **얼굴 위에 흰 격자를 덧그린다** — 초상 정책 거절을 넘기기 위해서다.
//
// ★★★ 왜 필요한가. fal(=ByteDance) 검사는 참조 이미지에 **실존 인물의 초상으로 보이는
//   얼굴**이 있으면 굽기를 거절한다(`loc:["body","image_urls"]` ·
//   `reason: partner_validation_failed`). 그런데 우리 스토리보드 판에는 사장님이 인물
//   사진을 안 올려도 얼굴이 그려진다 — 시나리오에 사람이 나오면 모델이 그린다.
//   그래서 "인물 사진을 못 올리게 막는" 대응은 조준이 어긋나 있었다. 막아야 할 것은
//   업로드가 아니라 **판에 그려진 얼굴**이다.
//
// ★★ 무엇이 통하고 무엇이 안 통하는지는 실측으로 갈렸다(2026-09-01 · 09-03):
//     ✗ 반투명 격자      — 탐지기가 무시한다. 2.5 에 27×27 시안 반투명으로 8회 전부 거절
//     ✗ 판 전체 격자     — 가로로 긴 판(1행 5열)에서는 얼굴 위 선이 성겨져 못 깨뜨린다(거절)
//     ✓ **얼굴에만 · 불투명 흰색 · 촘촘히** — 2.0 과 2.5 **둘 다 통과**
//   그리고 프롬프트에 **격자 억제 힌트**를 함께 실으면 출력물에 선이 안 남는다(실측 3편).
//
// ★ 얼굴 자리는 VLM 이 찾는다(lib/vlm.js 와 같은 모델·같은 키). 좌표가 조금 빗나가도
//   덮이도록 여유를 준다 — 덜 덮으면 거절이고, 더 덮어도 억제 힌트가 지운다.
// ★ 이 파일은 **서버 전용**이다(sharp 를 늦게 import 한다). 화면이 import 하지 않는다.

// 격자 설정 — 실측으로 정해진 값이다. 바꾸려면 위 ✓/✗ 를 다시 재라.
export const FACE_GRID = {
  cells: 10,        // 얼굴 상자 안에서 10×10
  stroke: 8,        // 굵기(px). 얇으면 탐지기가 얼굴을 그대로 읽는다
  color: "#FFFFFF", // 흰색
  opacity: 1,       // ★ 불투명이다. 반투명은 무시당한다(2026-09-01 실측)
  pad: 0.15,        // 얼굴 상자 둘레 여유
};

// 프롬프트 꼬리 — 출력물에서 격자를 지운다. 굽는 지문 **맨 뒤**에 붙인다
// (뒤에 올수록 모델이 강하게 받는다 — 이 저장소의 규약).
export const GRID_SUPPRESS_LINE =
  "No grid, no overlay, no mesh, no lines across the image, clean skin, smooth image.";

// 이미지 한 장에서 **얼굴 상자 전부**를 찾는다. 없으면 빈 배열.
//
// ★★★ 2026-09-03 오후 — **하나만 찾으면 안 된다.** 프로덕션 편 `00b1885a` 가 격자를
//   씌우고도 422(초상)로 거절됐다. 그 판을 그대로 내려받아 재현해 보니 원인이 둘이었다:
//     ① 칸 하나에 얼굴이 여럿인데 **한 개만** 돌려받았다(실측: 칸 0=3 · 칸 1=2 · 칸 5=2)
//     ② 같은 칸·같은 지문인데 **회차마다 답이 달랐다**(칸 3: 0개 → 1개)
//   **덮다 만 판은 안 덮은 판과 같다** — 얼굴 하나가 남으면 거절은 그대로 난다.
// ★★ 이 저장소가 만드는 판의 주제가 **광고판·전광판 속 인물**이다. 옛 지문의
//   "clearly visible" 은 앞의 큰 얼굴만 부르고 배경의 작은 얼굴을 건너뛰었는데,
//   거절을 부른 것이 바로 그 얼굴이었다. 그래서 배경·작음·광고판을 **이름으로** 부른다.
// ★ 하나도 못 찾으면 **격자를 안 씌운다** — 아무 데나 씌우면 그림만 버린다. 거절은 0원이라
//   못 찾아 거절당하는 쪽이 잘못 씌워 망친 편을 사는 쪽보다 싸다.
export async function findFaceBoxes({ bytes, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  if (!apiKey) return [];
  const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          { type: "text", text:
            'Find EVERY human face in this image, including small, blurred, background, ' +
            'out-of-focus faces and faces printed on billboards, posters, screens or reflections. ' +
            'A face counts even if it is tiny or partly turned away. ' +
            'Reply with JSON only: {"faces":[{"x":0.0,"y":0.0,"w":0.0,"h":0.0}]}. ' +
            'Each entry is one face region in normalized coordinates (0-1) of the whole image, ' +
            'covering the whole head including hair and chin, with generous margin. ' +
            'If there is truly no human face at all, reply {"faces":[]}.' },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${bytes.toString("base64")}` } },
        ],
      }],
      max_tokens: 600,
    }),
  }).catch(() => null);
  if (!res?.ok) return [];
  const j = await res.json().catch(() => null);
  const text = j?.choices?.[0]?.message?.content || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let out;
  try { out = JSON.parse(m[0]); } catch { return []; }
  // ★ 모양이 어긋난 상자는 **버린다** — sharp  extract 가 던지면 굽기가 통째로 죽는다.
  //   여기서 거르는 편이, 얼굴 하나를 놓쳐 거절당하는 것보다 싸다(거절은 0원).
  return (Array.isArray(out?.faces) ? out.faces : [])
    .map((b) => ({ x: Number(b?.x), y: Number(b?.y), w: Number(b?.w), h: Number(b?.h) }))
    .filter((b) => ["x", "y", "w", "h"].every((k) => Number.isFinite(b[k])) && b.w > 0 && b.h > 0);
}

// 정규화 상자(0~1)를 픽셀 사각형으로. 여유를 주고 이미지 밖으로 안 나가게 자른다.
export function boxToRect(box, width, height, pad = FACE_GRID.pad) {
  const x = Math.max(0, box.x - box.w * pad);
  const y = Math.max(0, box.y - box.h * pad);
  const w = Math.min(1 - x, box.w * (1 + pad * 2));
  const h = Math.min(1 - y, box.h * (1 + pad * 2));
  return {
    left: Math.round(x * width),
    top: Math.round(y * height),
    width: Math.max(1, Math.round(w * width)),
    height: Math.max(1, Math.round(h * height)),
  };
}

// 사각형 여럿에 격자를 그린 SVG 한 장.
export function gridSvg(width, height, rects, opts = {}) {
  const { cells, stroke, color, opacity } = { ...FACE_GRID, ...opts };
  const groups = rects.map((r) => {
    // ★★★ 2026-09-03 오후 — **작은 얼굴에서는 칸 수를 줄인다.**
    //   굵기는 실측값이라 못 건드린다(얇으면 탐지기가 얼굴을 그대로 읽는다). 그런데 10칸을
    //   48px 짜리 배경 얼굴에 그리면 선이 서로 붙어 **흰 덩어리**가 된다 — 초상은 가려도
    //   그 자리의 그림이 통째로 사라지고, 모델이 그 칸을 못 읽는다(실측으로 눈에 보였다).
    //   그래서 **간격이 굵기의 두 배는 되게** 칸 수를 낮춘다. 최소 2칸은 남긴다.
    const n = Math.max(2, Math.min(cells, Math.floor(Math.min(r.width, r.height) / (stroke * 2))));
    const lines = [];
    for (let i = 0; i <= n; i++) {
      const x = Math.round(r.left + (r.width * i) / n);
      const y = Math.round(r.top + (r.height * i) / n);
      lines.push(`<line x1="${x}" y1="${r.top}" x2="${x}" y2="${r.top + r.height}"/>`);
      lines.push(`<line x1="${r.left}" y1="${y}" x2="${r.left + r.width}" y2="${y}"/>`);
    }
    return `<g stroke="${color}" stroke-width="${stroke}" stroke-opacity="${opacity}">${lines.join("")}</g>`;
  });
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${groups.join("")}</svg>`
  );
}

// **판 한 장**에 격자를 씌운다 — 격자가 걸린 자리가 하나도 없으면 원본을 그대로 돌려준다.
//
// ★ 격자가 든 판은 우리 바이트라 주소가 없다. 부르는 쪽은 이것을 **바이트로** fal 에
//   넘기고(refs 의 `{bytes,key}` 규약), 각인(imageOf)에는 **원본 판 주소**를 그대로 쓴다 —
//   각인은 "무엇에서 나왔는가"이지 "무엇을 보냈는가"가 아니다.
// ★ 격자를 못 씌워도 **던지지 않는다.** 그러면 얼굴이 든 채로 나가 거절될 수 있지만,
//   거절은 0원이고 여기서 던지면 얼굴이 없는 편까지 못 굽는다.
export async function gridFacesOnSheet({ bytes, cells: cellCount = 1, grid, deps = {} }) {
  const sharp = (await import("sharp")).default;
  const find = deps.findFaceBoxes || findFaceBoxes;
  const meta = await sharp(bytes).metadata();
  const rows = Number(grid?.rows) || 1;
  const cols = Number(grid?.cols) || 1;
  const cellW = Math.floor(meta.width / cols);
  const cellH = Math.floor(meta.height / rows);

  const rects = [];
  for (let i = 0; i < cellCount; i++) {
    const cx = (i % cols) * cellW;
    const cy = Math.floor(i / cols) * cellH;
    if (cx + cellW > meta.width || cy + cellH > meta.height) continue;
    const cell = await sharp(bytes).extract({ left: cx, top: cy, width: cellW, height: cellH })
      .jpeg({ quality: 88 }).toBuffer();
    // ★ 한 칸에서 찾은 얼굴을 **전부** 담는다. 하나만 담던 것이 09-03 거절의 원인이었다.
    for (const box of (await find({ bytes: cell })) || []) {
      const r = boxToRect(box, cellW, cellH);
      rects.push({ left: cx + r.left, top: cy + r.top, width: r.width, height: r.height });
    }
  }
  if (!rects.length) return { bytes, faces: 0 };

  const out = await sharp(bytes)
    .composite([{ input: gridSvg(meta.width, meta.height, rects), top: 0, left: 0 }])
    .jpeg({ quality: 92 }).toBuffer();
  return { bytes: out, faces: rects.length };
}

// **사진 한 장**(사장님이 올린 인물 참조)에 격자를 씌운다.
export async function gridFacesOnPhoto({ bytes, deps = {} }) {
  const sharp = (await import("sharp")).default;
  const find = deps.findFaceBoxes || findFaceBoxes;
  const boxes = (await find({ bytes })) || [];
  if (!boxes.length) return { bytes, faces: 0 };
  const meta = await sharp(bytes).metadata();
  const rects = boxes.map((b) => boxToRect(b, meta.width, meta.height));
  const out = await sharp(bytes)
    .composite([{ input: gridSvg(meta.width, meta.height, rects), top: 0, left: 0 }])
    .jpeg({ quality: 92 }).toBuffer();
  return { bytes: out, faces: rects.length };
}
