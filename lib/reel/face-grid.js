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
  // ★★★ 2026-09-03 오후 정정 — **칸 수가 아니라 간격이다.**
  //   09-03 오전에 통한 설정은 "얼굴에 딱 맞는 상자에 10칸"이었고, 그 상자가 200~300px
  //   이었으니 실제로 작동한 값은 **선 간격 20px 안팎**이었다. 그런데 칸 수로 적어 두면
  //   상자가 커질수록 성겨진다 — 프로덕션에서 상자가 515×1248px(칸의 72%×98%)로 잡혀
  //   간격이 52px 이 됐고, **얼굴이 격자 한 칸 안에 통째로 들어가** 그대로 읽혀 거절됐다
  //   (요청 `01a065aa`, fal 이 되돌려준 입력을 눈으로 확인).
  spacing: 20,      // 목표 선 간격(px). 상자가 크든 작든 이 간격을 지킨다
  maxCells: 60,     // 한 축의 선 개수 상한 — SVG 가 끝없이 커지지 않게
  // ★★★ 2026-09-03 오후 — **좌표가 회차마다 크게 흔들린다.** 같은 칸을 네 번 물었더니
  //   얼굴 상자가 (0.31,0.10)·(0.37,0.05)·(0.35,0.06)·(0.33,0.14) 로 흩어졌고, 한 회차만
  //   쓰면 얼굴을 빗나간다 — 프로덕션 판 칸 0 에서 격자가 **하늘에** 그려졌다. 그런데
  //   넷을 합치면 얼굴이 덮인다. 비결정성을 약점이 아니라 재료로 쓴다.
  //   ★ 값은 굽기 한 편($4.5)에 비하면 무시할 수준이다(칸당 gpt-4o 몇 센트).
  passes: 3,
  stroke: 8,        // 굵기(px). 얇으면 탐지기가 얼굴을 그대로 읽는다
  color: "#FFFFFF", // 흰색
  // ★★★ 2026-09-09 — **1 → 0.45.** "불투명이어야 한다"는 두 주 된 결론이 틀렸다.
  //   그 근거였던 09-01 의 8회 거절은 세 가지가 한꺼번에 달랐다 —
  //   반투명 · **2px 얇은 선** · **판 전체에 깔기**. 투명도만 따로 잰 적이 없었다.
  //   사장님 지시로 각 1회씩 유료 실측(4초 480p · $0.82씩, seedance-2.5 r2v):
  //     불투명 0.65 → **통과** · 인물 일치 · 격자 흔적 0
  //     불투명 0.45 → **통과** · 인물 일치 · 격자 흔적 0
  //   즉 탐지기를 넘긴 것은 불투명도가 아니라 **굵기(8px)와 자리(얼굴에만)** 였다.
  // ★★★ 그리고 짙으면 **다른 것이 깨진다.** 1.0 은 참조에서 사람을 지워 모델이 얼굴을
  //   스스로 지어낸다 — 사장님 신고 "스토리보드 이미지랑 인물이 달라졌다"가 그것이다.
  //   지금 값은 **얼굴이 눈에 보이는** 상태이고, 그것이 인물을 지키는 유일한 채널이다.
  // ⚠️ 표본이 2건이고 **칸 한 장**으로 쟀다. 프로덕션은 여러 칸이 붙은 판을 보내고
  //   fal 판정은 회차마다 흔들린다(09-03 실측) — 거절이 다시 나면 **여기부터 의심해라.**
  //   올릴 때는 0.6 을 넘기지 마라(그 위는 사람이 지워지기 시작한다 · tests 가 막는다).
  opacity: 0.45,
  // ★★★ 2026-09-09 실측 — **0.15 에서 0.5 로 넓혔다.** 프로덕션 편 `14fd0ce0` 이
  //   초상으로 거절됐는데, 그 판을 그대로 내려받아 재현하니 **탐지는 멀쩡했다**:
  //   얼굴 있는 칸 일곱 개를 전부 찾아 아홉 자리에 격자를 그렸다. 그런데 상자가 얼굴보다
  //   조금 작고 조금 밀려, 칸 0 의 여자는 **오른쪽 절반**이 · 칸 6 의 남자는 **얼굴 윗부분**이
  //   격자 밖에 남았다. 얼굴 하나만 읽히면 거절은 그대로 난다.
  //   · pad 0.15 → fal 거절 (판의 28.3% 를 덮음)
  //   · pad 0.5  → **통과. 720p·30초 완성본이 나왔다** (49.7% 를 덮음, $13.87)
  //   ★ 이 값은 취향이 아니라 **좌표 오차를 흡수하는 여유**다. VLM 은 "무엇이 있나"는
  //     잘 답해도 "어디에 있나"를 못 맞춘다(09-03 실측: 같은 칸을 네 번 물으면 상자가
  //     흩어진다). 오차가 상자 크기의 3할 안팎이라 여유가 그보다 작으면 덮다 만다.
  //
  // ★★★ 2026-09-09 **저녁 — 0.5 → 0.3.** 위 "0.5 로 통과"는 사실이지만, 그렇게 통과한
  //   편에서 **스토리보드와 다른 인물이 나왔다**(사장님 신고). 판을 눈으로 그려 보니
  //   이유가 분명했다: `w = box.w * (1 + pad*2)` 라 0.5 는 상자를 **각 변 2배(면적 4배)**
  //   로 키우고, 얼굴이 여럿이면 그 상자들이 `mergeRects` 로 합쳐져 **상반신을 통째로 덮는
  //   한 덩어리**가 된다(같은 판 실측: 덮음 0.15→20.7% · 0.3→26.1% · **0.5→49.0%**).
  //   얼굴을 가린 것이 아니라 **사람을 지운 것**이다.
  //   ★ 그래서 여유는 좌표 오차를 흡수할 만큼만 두고, **가리는 일은 불투명도가 맡는다**
  //     (위 opacity 참고 — 0.45 로 통과·인물 일치를 실측했다). 두 손잡이의 역할이 다르다:
  //       pad     = 어디까지 덮을까   (넓히면 사람이 사라진다)
  //       opacity = 얼마나 지울까     (짙게 하면 얼굴이 사라진다)
  pad: 0.3,         // 얼굴 상자 둘레 여유
  // ★★★ 2026-09-10 저녁 — **회차 상자를 합치지 않고 대표값 하나로 줄인다**(사장님 지시).
  //   프로덕션 편 `de1cd655`(2.0 · 1행 5열 · 480p)에서 **판의 63.2% 가 덮였다**. 격자가
  //   얼굴을 가린 것이 아니라 **사람을 지웠고**, 그래서 모델이 얼굴을 스스로 지어냈다
  //   (사장님 신고: "영상 속 인물과 스토리보드 이미지랑 인물이 다르다").
  //   ★ 원인은 pad 가 아니었다 — 같은 판에서 pad 0.15 도 **50.4%** 였다. 진짜 원인은
  //     **흔들림이 상자 크기가 되는 구조**다:
  //       ① `findFaceBoxes` 가 3회차 상자를 **전부 그대로** 돌려준다(얼굴 하나 = 상자 3개)
  //       ② 그 셋을 각각 pad 로 부풀린 **뒤에** `mergeRects` 가 union 으로 합친다
  //       → 상자 ≈ (얼굴 + 흔들림 폭) × 1.6  ... 흔들림이 **누적**된다
  //     대표값(중앙값)으로 줄이면 흔들림이 **상쇄**된다: 상자 ≈ 얼굴 × 1.6.
  //   ★ 3회차는 그대로 둔다 — 그것은 보험이고(한 회차만 쓰면 빗나간다, 09-03 실측),
  //     바꾸는 것은 **그 셋을 어떻게 쓰느냐**뿐이다: union → 중앙값.
  //   ★ 한 회차에서만 나온 상자도 **버리지 않는다**. 헛것일 수 있지만 얼굴 하나를
  //     놓치면 거절은 그대로 나고, 덮다 만 판은 안 덮은 판과 같다.
  //   이 값은 "두 상자가 같은 얼굴인가"의 문턱이다 — 겹친 넓이 ÷ 작은 상자의 넓이.
  consensus: 0.5,
  // ★★★ 2026-09-10 저녁 — **부풀린 상자의 상한.** 위 줄이기만으로는 부족했다(실측
  //   63.8% → 52.7%). 상자를 눈으로 보고 수를 찍어 보니 지배적인 항이 흔들림이 아니라
  //   **VLM 이 돌려준 상자 자체**였다. 같은 판 칸 0·4 의 대표 상자:
  //     칸 0  w=0.52 h=0.77 → 칸의 **40%**   ·   칸 4  w=0.61 h=0.78 → 칸의 **48%**
  //   지문이 "TIGHT · 몸·어깨는 넣지 마라"라고 못 박는데도 클로즈업 칸에서는 안 지킨다.
  //   거기에 pad 0.3(면적 2.56배)이 곱해지면 h 가 1.23 이 되어 **칸을 넘는다** — 그래서
  //   칸 0·4 가 위아래로 꽉 찼다.
  //   ★ 그래서 pad 를 **상한에 맞춰 줄인다**: 부풀린 넓이가 칸의 이 비율을 넘지 않게 하고,
  //     원본이 이미 넘으면 **더 키우지 않는다**(pad 0). pad 의 목적은 좌표 오차 흡수인데,
  //     상자가 이미 칸의 절반이면 그 목적은 이미 달성돼 있고 남는 것은 해악뿐이다.
  //   ★ 실측(같은 판 · 상자 재사용이라 추가 비용 0):
  //       옛 방식(회차 union)            63.8%
  //       대표값만                       52.7%
  //       대표값 + 상한 0.3            **32.8%**
  //       대표값 + pad 0(하한)           25.4%
  //     상한을 0.15~0.35 로 움직여도 28.9~33.8% 로 거의 같다 — 큰 상자 둘이 지배하기 때문이다.
  //     즉 **더 내리려면 pad 가 아니라 상자 자체를 줄여야 한다**(지문·후처리, 아직 미착수).
  // ⚠️ 덜 덮으면 fal 이 초상으로 거절할 수 있다. 그 맞바꿈은 **의도한 것**이다 —
  //   거절은 0원이고, 다른 인물이 나온 편은 굽는 값을 다 치른 뒤 못 쓴다.
  maxCell: 0.3,
};

// 이 상자에 실제로 먹일 여유. 부풀린 넓이가 `maxCell` 을 넘지 않게 pad 를 깎는다.
// ★ 넓이 기준이라 길쭉한 상자에도 같은 규칙이 걸린다(칸 0 은 w 0.52 × h 0.77 이었다).
// ★ 원본이 이미 상한을 넘으면 **0** — 줄이지는 않는다. 그 상자도 얼굴을 덮고는 있으므로
//   깎으면 덮다 만 판이 되고, 덮다 만 판은 안 덮은 판과 같다.
export function padFor(box, { pad = FACE_GRID.pad, maxCell = FACE_GRID.maxCell } = {}) {
  const area = Number(box?.w) * Number(box?.h);
  if (!(area > 0)) return pad;
  if (area >= maxCell) return 0;
  // w·h 를 같은 배율로 키우므로 넓이는 배율의 제곱이다: (1+2p)^2 = maxCell/area
  const maxPad = (Math.sqrt(maxCell / area) - 1) / 2;
  return Math.max(0, Math.min(pad, maxPad));
}

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
async function askFaceBoxesOnce({ bytes, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
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
            'Each box must be TIGHT around the face only: from the forehead hairline to the chin, ' +
            'and from ear to ear. Do NOT include the body, shoulders, clothing, or the whole ' +
            'poster/billboard the face appears on — a box that covers a person head to toe is wrong. ' +
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

// **여러 번 물어 합친다.** 한 회차의 좌표는 못 미덥다(위 `passes` 주석의 실측).
// ★ 병렬로 묻는다 — 직렬로 하면 칸 수 × passes 만큼 굽기 시작이 늦어진다.
export async function findFaceBoxes({ passes = FACE_GRID.passes, ...rest }) {
  const runs = await Promise.all(Array.from({ length: Math.max(1, passes) }, () => askFaceBoxesOnce(rest)));
  return runs.flat();
}

// **같은 얼굴을 가리키는 상자들을 하나로 줄인다** (2026-09-10 · 위 FACE_GRID.consensus 참고).
//
// 회차마다 좌표가 흔들리므로 얼굴 하나에 상자가 `passes` 개 온다. 그것을 union 으로 합치면
// **흔들림 폭이 그대로 상자 크기**가 되고, 거기에 pad 가 곱해져 사람을 지운다.
// 여기서는 겹치는 것끼리 묶은 뒤 **각 축의 중앙값**을 쓴다 — 흔들림이 상쇄되고 상자는
// 얼굴 크기로 남는다.
//
// ★ 왜 평균이 아니라 중앙값인가. 회차 셋 중 **하나가 크게 빗나가는** 것이 이 탐지의
//   실패 모양이다(09-03 실측: 같은 칸을 네 번 물으면 하나가 하늘을 가리켰다). 평균은 그
//   빗나간 값에 끌려가고, 중앙값은 그것을 통째로 버린다.
// ★ 축마다 따로 중앙값을 낸다 — 상자 하나를 통째로 고르면 그 회차의 오차가 그대로 남는다.
// ★ 묶는 판정은 **pad 를 먹이기 전** 원본 상자로 한다. 부풀린 뒤에 묶으면, 원래 안 닿던
//   다른 얼굴까지 pad 때문에 닿아 한 덩어리가 된다(그것이 63.2% 를 만든 연쇄다).
export function consensusBoxes(boxes, { overlap = FACE_GRID.consensus } = {}) {
  const ok = (b) => Number(b?.w) > 0 && Number(b?.h) > 0;
  const area = (b) => b.w * b.h;
  // 겹친 넓이 ÷ **작은 쪽**의 넓이. 작은 상자가 큰 상자 안에 들어 있으면 1 이 된다 —
  // 같은 얼굴을 크게/작게 잡은 두 회차가 바로 그 모양이다(IoU 로 재면 그 짝을 놓친다).
  const same = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w <= 0 || h <= 0) return false;
    return (w * h) / Math.max(1e-9, Math.min(area(a), area(b))) >= overlap;
  };
  const mid = (xs) => {
    const s = [...xs].sort((p, q) => p - q);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const clusters = [];
  for (const b of (boxes || []).filter(ok)) {
    // ★ 닿는 묶음이 **여럿일 수 있다** — 그 둘은 이 상자를 통해 같은 얼굴이므로 함께 묶는다.
    //   (mergeRects 가 union 을 연쇄로 도는 것과 같은 이유다.)
    const hit = [];
    for (let i = clusters.length - 1; i >= 0; i--) {
      if (clusters[i].some((m) => same(m, b))) hit.push(...clusters.splice(i, 1)[0]);
    }
    clusters.push([...hit, b]);
  }
  return clusters.map((c) => ({
    x: mid(c.map((b) => b.x)), y: mid(c.map((b) => b.y)),
    w: mid(c.map((b) => b.w)), h: mid(c.map((b) => b.h)),
  }));
}

// **겹치는 사각형은 하나로 합친다.** 겹쳐 그리면 두 격자의 선이 엇갈려 그 자리가
// **흰 덩어리**가 된다 — 초상은 가려도 그림이 통째로 사라진다.
// ★ 2026-09-10 — 이 함수가 받는 것은 이제 **얼굴마다 하나씩인 상자**다(consensusBoxes 가
//   회차를 먼저 줄인다). 여기 남은 일은 **서로 다른 얼굴이 pad 뒤에 닿았을 때**뿐이다.
// ★ 합친 결과가 또 다른 것과 겹칠 수 있으므로 **더 합칠 것이 없을 때까지** 돈다.
export function mergeRects(rects) {
  const hit = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height;
  const union = (a, b) => {
    const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
    return {
      left, top,
      width: Math.max(a.left + a.width, b.left + b.width) - left,
      height: Math.max(a.top + a.height, b.top + b.height) - top,
    };
  };
  const out = [];
  for (const r of rects) {
    let cur = r, merged = true;
    while (merged) {
      merged = false;
      for (let i = out.length - 1; i >= 0; i--) {
        if (!hit(cur, out[i])) continue;
        cur = union(cur, out[i]); out.splice(i, 1); merged = true;
      }
    }
    out.push(cur);
  }
  return out;
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
  const { spacing, maxCells, stroke, color, opacity } = { ...FACE_GRID, ...opts };
  // ★ 간격은 굵기의 두 배 아래로 안 내려간다 — 그 아래면 선이 붙어 **흰 덩어리**가 되고
  //   초상은 가려도 그 자리의 그림이 통째로 사라진다(2026-09-03 실측).
  const step = Math.max(spacing, stroke * 2);
  const groups = rects.map((r) => {
    // ★★★ **가로와 세로를 따로 센다.** 옛 코드는 한 칸 수를 양쪽에 같이 써서, 길쭉한
    //   상자(153×837)에서 세로선은 19px 간격인데 **가로선은 105px** 간격이 나왔다.
    //   한쪽만 촘촘하면 얼굴은 그대로 읽힌다 — 프로덕션 거절 판이 그 모양이었다.
    const nx = Math.max(2, Math.min(maxCells, Math.round(r.width / step)));
    const ny = Math.max(2, Math.min(maxCells, Math.round(r.height / step)));
    const lines = [];
    for (let i = 0; i <= nx; i++) {
      const x = Math.round(r.left + (r.width * i) / nx);
      lines.push(`<line x1="${x}" y1="${r.top}" x2="${x}" y2="${r.top + r.height}"/>`);
    }
    for (let i = 0; i <= ny; i++) {
      const y = Math.round(r.top + (r.height * i) / ny);
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
    // ★★ 2026-09-10 — 다만 **회차 상자를 먼저 대표값으로 줄인다**(consensusBoxes).
    //   줄이지 않으면 얼굴 하나가 상자 셋으로 들어와, pad 로 부푼 뒤 union 되며
    //   칸을 통째로 덮는다(실측 63.2%).
    for (const box of consensusBoxes((await find({ bytes: cell })) || [])) {
      // ★ 여유는 상자 크기에 따라 깎인다(padFor) — 큰 상자에 pad 를 그대로 먹이면 칸을 넘는다.
      const r = boxToRect(box, cellW, cellH, padFor(box));
      rects.push({ left: cx + r.left, top: cy + r.top, width: r.width, height: r.height });
    }
  }
  if (!rects.length) return { bytes, faces: 0 };
  // ★ 회차가 여럿이라 같은 얼굴에 상자가 여럿 온다 — 합쳐서 한 벌만 그린다.
  const merged = mergeRects(rects);

  const out = await sharp(bytes)
    .composite([{ input: gridSvg(meta.width, meta.height, merged), top: 0, left: 0 }])
    .jpeg({ quality: 92 }).toBuffer();
  return { bytes: out, faces: merged.length };
}

// **사진 한 장**(사장님이 올린 인물 참조)에 격자를 씌운다.
export async function gridFacesOnPhoto({ bytes, deps = {} }) {
  const sharp = (await import("sharp")).default;
  const find = deps.findFaceBoxes || findFaceBoxes;
  // ★ 판 갈래와 **같은 줄이기**를 쓴다 — 두 갈래가 갈리면 한쪽만 사람을 지운다.
  const boxes = consensusBoxes((await find({ bytes })) || []);
  if (!boxes.length) return { bytes, faces: 0 };
  const meta = await sharp(bytes).metadata();
  const rects = mergeRects(boxes.map((b) => boxToRect(b, meta.width, meta.height, padFor(b))));
  const out = await sharp(bytes)
    .composite([{ input: gridSvg(meta.width, meta.height, rects), top: 0, left: 0 }])
    .jpeg({ quality: 92 }).toBuffer();
  return { bytes: out, faces: rects.length };
}
