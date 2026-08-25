// reel 의 컷 수 규칙 — **순수하다**(fs·env·네트워크를 안 문다. tests/reel-scenario-rules.js 가 잰다).
//
// ★★ 왜 reel 만 따로인가: 광고 지시문(lib/ad/scenario.js)은 "장면 수는 … 넷을 넘기지
//   마라"라고 말하고 그 **근거가 "이 영상은 한 번에 통째로 만들어지므로"** 다. reel 은
//   컷마다 따로 굽고 ffmpeg 가 잇는다 — 그 근거가 여기서는 거짓이다. 그리고 45·60초는
//   Seedance 2.0 이 통째로 못 굽는 길이라(15초가 최대) reel 이 꼭 필요한 자리인데,
//   광고 규칙대로면 60초에 컷 넷 = 컷당 15초가 된다.
//
// ★★ 그런데 아무 수나 쓸 수도 없다. 그림은 **스토리보드 한 장**이고 칸을 나눠 쓰므로
//   컷 수가 곧 격자 칸 수인데, nano-banana 2 는 **프리셋 비율만** 받는다(36:16 은 422 로
//   거절됐다 — 2026-08-24 실측). 그래서 격자로 떨어지는 칸 수만 쓸 수 있다.

// 칸이 9:16 일 때 전체 캔버스가 프리셋 비율에 떨어지는 격자를 **전수 조사**한 표다
// (6행 6열까지, scratchpad/grid2.mjs). 오차는 칸 하나가 9:16 에서 얼마나 어긋나는가 —
// 5% 대는 칸을 자른 뒤 가운데 자르기로 맞춘다.
//
//   칸  격자                       오차   4K 칸 크기   굽기(720×1280) 대비
//    3  1×3                       5.2%   1828×3084    2.54배
//    4  2×2 · 1×4                 0%     1542×2741    2.14배
//    6  2×3                       5.3%   1226×2299    1.70배
//    9  3×3                       0%     1028×1828    1.43배
//   10  2×5                       5.3%    950×1781    1.32배
//   12  3×4 · 4×3 · 2×6           0%      890×1583    1.24배
//   16  4×4                       0%      771×1371    1.07배
//   20  5×4 · 4×5                 —       671×1259    0.93배 ← **여기서 깨진다**
//
// ★★ 상한이 16 인 근거: 20칸부터 **칸이 굽기 해상도보다 작아진다**(0.93배). 그러면
//   스토리보드로 얻는 것(칸이 굽기보다 크다)이 사라져 한 장으로 그릴 이유가 없어진다.
// ★ 5·7·8·11칸이 없는 이유: 격자가 안 나온다(소수이거나, 2×4 처럼 전체 비율이 프리셋에서
//   12% 넘게 멀어져 칸이 찌그러진다).
// ★ 같은 칸 수에 격자가 여럿이면 **오차가 0 인 것**을 쓴다(칸이 안 찌그러진다). 칸 크기
//   차이는 12칸에서 1.24 대 1.27 배로 미미해서 오차가 이긴다. 다만 행 수가 순서 인식에
//   영향을 주는지는 **미검증**이다 — 게이트 D 가 잴 자리다.
// 격자는 **계산한다**(2026-08-25). 표를 버린 이유가 셋이다.
//
// ★★ (1) 프리셋 제약의 근거가 사라졌다. 위 머리말의 "nano-banana 2 는 프리셋 비율만
//   받는다(36:16 은 422)"는 **그 모델 이야기**다. 지금 기본 이미지 모델은 GPT Image 2 이고
//   image_size 를 {width,height} 객체로 받는다 — 임의 치수가 된다(lib/imagegen.js).
//   WARN 그래서 이 계산은 **GPT Image 2 전제**다. FAL_IMAGE_ENDPOINT 를 nano 계열로
//     되돌리면 임의 캔버스가 422 로 거절된다 — 그때는 이 파일도 함께 봐야 한다.
// ★★ (2) 표에 없는 칸 수(5·7·8·11·13·14·15)가 **조용히 컷별로 떨어졌다.** 컷별은 그림을
//   컷 수만큼 사므로 이미지값이 최대 11배다(0.40 달러 → 4.41 달러). 눈에는 안 보인다.
// ★★ (3) 표가 **화질을 몰랐다.** 칸 목표를 늘 1280(720p)으로 잡아, 480p 로 구울 때도
//   불필요하게 큰 캔버스를 요구하다 상한에 걸려 축소됐다 — 16칸이 540x960 이 되어
//   **480p 에 필요한 854 에도 못 미쳤다.** 스스로 만든 손해였다.
//
// ★ 빈 칸은 **안 만든다**(사장님 결정: "빈칸이 없는 것만 여는 쪽으로"). 7컷을 2x4(빈 칸 1)로
//   그리면 모델이 남는 칸에 무엇을 그릴지 실측한 적이 없다. 재 보고 나서 열면 된다 —
//   그때 아래 "나누어떨어지는 것만" 조건을 풀면 된다.
export const STORYBOARD_MAX_SIDE = 3840;

// 굽기 화질의 긴 변 — 칸 하나가 이만큼은 돼야 스토리보드로 얻는 것이 있다
// (칸이 굽기보다 작으면 한 장으로 그릴 이유가 사라진다).
const BAKE_CELL_LONG = Object.freeze({ "480p": 854, "720p": 1280, "1080p": 1920 });
const DEFAULT_CELL_LONG = 1280;

export function bakeCellLong(resolution) {
  return BAKE_CELL_LONG[resolution] || DEFAULT_CELL_LONG;
}

// 비율 문자열 -> [가로, 세로]. 이 파일은 순수해야 해서 lib/aspects.js 를 안 문다
// (그 파일도 순수하지만 여기 규율이 "./" 밖 import 를 막는다 — 테스트가 잰다).
function ratio(aspect) {
  const [w, h] = String(aspect || "9:16").split(":").map(Number);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? [w, h] : [9, 16];
}

// 칸 수 -> 격자. **빈 칸이 0 이고** 칸을 안 줄이고 담기는 것 중 캔버스가 가장 작은 것.
// 못 담으면 null 이다 — 던지지 않는다(부르는 쪽이 컷별로 떨어뜨린다).
// ★ 하한이 **여기** 있다(목록이 아니라). 예전에는 reelCutChoicesFor 만 3 부터 셌는데,
//   격자 함수는 1·2 도 내줘서 "여는 칸 수"의 뜻이 둘이 됐다 — 목록에 없는 2컷이
//   스토리보드로 갔다(tests/reel-oneshot.test.js 가 잡았다).
export const REEL_MIN_CUTS = 3;

export function reelGridFor(count, { resolution = "720p", aspect = "9:16" } = {}) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < REEL_MIN_CUTS) return null;
  const [aw, ah] = ratio(aspect);
  const k = bakeCellLong(resolution) / Math.max(aw, ah);
  const cw = aw * k, ch = ah * k;

  let best = null;
  for (let rows = 1; rows <= n; rows++) {
    if (n % rows !== 0) continue;
    const cols = n / rows;
    const w = cols * cw, h = rows * ch;
    if (Math.max(w, h) > STORYBOARD_MAX_SIDE) continue;
    const area = w * h;
    // 같은 넓이면 **더 정사각에 가까운 것** — 한 줄짜리(1x15)는 칸이 잘고 읽는 순서가
    // 오히려 헷갈린다.
    const skew = Math.abs(Math.log(w / h));
    if (!best || area < best.area || (area === best.area && skew < best.skew)) {
      best = { rows, cols, w, h, area, skew };
    }
  }
  if (!best) return null;
  // canvas 는 GPT Image 2 에서 **안 쓰인다**(imageSize 가 이긴다). nano 갈래로 되돌아갈
  // 때를 위해 실제 치수 비를 그대로 적어 둔다.
  return Object.freeze({
    rows: best.rows,
    cols: best.cols,
    canvas: Math.round(best.w) + ":" + Math.round(best.h),
  });
}

// 그 화질에서 쓸 수 있는 컷 수 — **격자가 정한다.**
// ★ 하한 3: 컷 둘짜리 영상은 이 흐름의 대상이 아니다(옛 표의 하한과 같다).
export function reelCutChoicesFor(resolution = "720p", aspect = "9:16") {
  const out = [];
  for (let n = REEL_MIN_CUTS; n <= 40; n++) if (reelGridFor(n, { resolution, aspect })) out.push(n);
  return out;
}


// ★★ 컷당 초에 **제한을 두지 않는다**(2026-08-24 사장님 결정).
//
//   "카메라 시선에 따라 무언가를 바라보는 컷이 추가될 수도 있고, 세부를 보여 줘야 하는
//    자리에서 컷이 더 들 수도 있고, 그렇지 않으면 적은 컷으로도 된다 — 전체 시나리오
//    구성에 따라 다르다"
//
// 그리고 **짧은 컷도 화면은 정확히 나온다**: 모델이 최소 길이로 굽고 합성이 잘라 쓴다
// (lib/compose.js 의 `trim=duration=`). 기술이 막는 것이 아니다.
//
// ⚠️⚠️ **다만 값은 아직 이것을 못 따라간다.** 기본 모델(seedance-2.0)의 최소 클립이 4초라
//   (lib/clip-limits.js) 1.25초짜리 컷도 **4초치 원가**가 나간다. 그런데 정가(videoPrice)는
//   길이만 보고 컷 수를 안 본다 — 15초 12컷이면 실지출 $6.47 에 청구 40크레딧(≈$2.40)이다.
//   이 회차에 이미 같은 모양의 Critical 이 있었다("정가가 길이를 안 봤다"). 이번엔 컷 수다.
//   → **정가가 컷 수를 따라가게 하는 것은 별건으로 남긴다**(사장님이 순서를 그렇게 정했다).
//     그 전까지 컷을 많이 쓰면 회사가 그 차액을 문다.
export const CLIP_MIN_SECONDS_NOTE = 4;

// 광고 SYSTEM 의 "장면 수" 대목 자리에 들어갈 문구.
//
// ★★ 코드가 컷 수를 못 박지 않는다 — **이야기가 정한다.** 코드가 쥐는 것은 "격자로 그릴 수
//   있는가" 하나뿐이다.
// ★ 길이를 모르면 null 이다 — 부르는 쪽이 `|| AD_SCENE_COUNT_RULE` 로 받아 광고 규칙으로
//   조용히 되돌아간다("모르는 값에 던지지 않는다", lib/ad/scenario.js 의 pickFocus).
// ★★ 2026-08-25 — **화질을 받는다.** 담을 수 있는 칸 수가 화질마다 다르기 때문이다:
//   480p 는 32컷까지, 720p 는 15컷까지, 1080p 는 6컷까지다. 그전에는 화질과 무관하게
//   같은 목록(3·4·6·9·10·12·16)을 줘서, 720p·1080p 에서 **담기지도 않는 수를 권했다**.
// ★ 인자를 안 주면 720p 다 — 옛 호출부가 그대로 돈다.
export function reelSceneCountRule(targetSeconds, resolution = "720p", aspect = "9:16") {
  const total = Number(targetSeconds) || 0;
  if (total <= 0) return null;
  const choices = reelCutChoicesFor(resolution, aspect);
  if (!choices.length) return null;
  return [
    `★★ **장면 수를 네가 고른다.** 이 영상은 ${total}초이고, 쓸 수 있는 장면 수는`,
    `**${choices.join(" · ")}** 이다 — 이 중 하나를 고른다.`,
    `  · shots[].seconds 의 합이 정확히 ${total}초여야 한다. 장면마다 길이가 달라도 된다.`,
    "  · 목록 밖의 수를 쓰지 마라 — 장면 그림을 **한 장에 나눠** 그리기 때문에 그 수만 그릴 수 있다.",
    "  · ★ **이야기가 장면 수를 정한다.** 시선이 옮겨 가는 자리, 자세히 보여 줘야 하는 자리가",
    "    많은 소재면 많은 쪽을 고른다. 한 장면을 길게 끌어야 하는 소재면 적은 쪽을 고른다.",
    "    적은 쪽이 늘 나은 것도, 많은 쪽이 늘 촘촘한 것도 아니다 — 구성이 정한다.",
  ].join("\n");
}
