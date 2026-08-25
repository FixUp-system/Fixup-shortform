// 15초 이하 한 편은 **스토리보드 한 장 + 프롬프트 하나 → r2v 한 번**이다.
//
// ★★ 2026-08-25 실측(scripts/measure/bake-storyboard-r2v.mjs · 480p 15초 · $2.02 · 15.07초):
//   스토리보드 한 장을 통째로 `bytedance/seedance-2.0/reference-to-video` 에 주고 지문에
//   "패널을 순서대로 읽어라 · 분할 화면 금지"를 못 박으니 **이음새 없는 한 편**이 나왔다.
//   분할 화면은 안 나왔다. 사장님 말: "우리가 개별 컷을 전달하는 게 아니라 하나의
//   스토리보드 이미지를 전달하는 거니까."
//   → 그러면 컷별 프롬프트(④)·컷별 굽기(⑤)가 15초 이하에서는 통째로 필요 없다.
//
// ★★ **컷별 배선은 지우지 않는다.** 45·60초는 통짜가 물리적으로 불가하다 — Seedance 2.0 은
//   한 번에 15초가 최대다(lib/clip-limits.js 의 `max: 15`). 그 길은 그대로 살아 있어야 하고,
//   그래서 갈래 판정을 **순수 함수 하나**에 둔다(lib/reel/storyboard.js 의 planReelImages 가
//   그 선례다 — 라우트·화면·테스트가 같은 값을 본다).
//
// ★ **순수 함수다 — 화면("use client")이 이 파일을 읽는다.** import 는 같은 lib/reel 안의
//   순수 모듈만 허용한다(tests/reel-oneshot.test.js 가 그 뜻으로 못 박는다). 진짜 목적은
//   "사슬 끝에 fs·env 가 안 닿는 것"이다 — lib/reel/steps.js 머리말과 같은 규율이다.
import { reelGridFor } from "./scenario-rules.js";
import { canBakeReelClips } from "./doc.js";
// ★★ 2026-08-25 — 상한을 **모델이 정한다**(2.5 가 열리며 생긴 자리). 옛 주석은
//   "이 파일은 순수해야 해서 clip-limits.js 를 못 문다"였는데, 그 파일도 순수하고
//   (사슬 끝에 fs 가 없다) 이제는 값을 거기서 읽어야 갈리지 않는다.
import { clipProfileForProject, maxSecondsFor } from "../clip-limits.js";

// 한 번에 굽을 수 있는 최대 — **모델이 정한다**(lib/clip-limits.js 의 CLIP_PROFILES.max).
//
// ★★ 2026-08-25 — 여기 15 를 박아 두었었다. 2.5(한 번에 30초)가 열리면서 그 상수가
//   거짓이 됐다: 30초가 통짜 조건을 못 맞춰 컷별로 떨어지고, 2.5 는 **컷 최소가 15초**라
//   3컷이면 45초를 굽는다(청구는 30초). 눈으로는 안 보인다 — trim 이 잘라 낸다.
// ★ 이 값은 **옛 문서·모델을 모르는 자리의 기본값**으로 남는다(seedance-2.0 의 상한).
export const ONESHOT_MAX_SECONDS = 15;

// 이 프로젝트의 통짜 상한. 모르는 모델은 clipProfileForProject 가 기본 프로필로
// 떨어뜨리므로 **던지지 않는다**(화면도 부르는 자리다).
export function oneShotMaxFor(project) {
  const max = maxSecondsFor(clipProfileForProject(project));
  return Number.isFinite(max) && max > 0 ? max : ONESHOT_MAX_SECONDS;
}

// 칸 수 → 격자. 표는 lib/reel/scenario-rules.js 의 REEL_GRIDS 하나다(시나리오 지시문이
// 컷 수를 고를 때 보는 그 표).
//
// ★ lib/reel/storyboard.js 가 이 함수를 다시 내보낸다 — 옛 import 경로를 안 깨려는 것이지
//   판정이 둘이라는 뜻이 아니다. 여기로 옮긴 이유는 storyboard.js 가 **서버 전용**
//   (sharp·Storage)이라 화면이 그 파일을 못 읽어서다.
// ★★ 2026-08-25 — 표가 아니라 **계산**이다(lib/reel/scenario-rules.js 의 reelGridFor).
//   화질이 담을 수 있는 칸 수를 정하므로 화질을 함께 받는다 — 안 주면 720p 다.
export function storyboardGridFor(count, opts) {
  return reelGridFor(count, opts);
}

// 이 프로젝트의 스토리보드 원본 주소. 컷별로 그린 그림에는 없다(격자 밖 칸 수 · 한 칸만
// 다시 그리기) — 그때는 빈 문자열이고 통짜 갈래가 안 열린다.
//
// ★ 적는 자리는 app/api/reel/[id]/images/route.js 의 `sheet` 하나다.
export function reelSheetUrl(cuts) {
  const list = Array.isArray(cuts) ? cuts : [];
  const found = list.find((c) => typeof c?.image?.sheet === "string" && c.image.sheet);
  return found ? found.image.sheet : "";
}

// ── 갈래 판정 ────────────────────────────────────────────────────────────
//
// 통짜로 굽는 조건은 셋이고 **전부** 만족해야 한다:
//   ① 길이가 **그 모델의 상한 이하**다(2.0 은 15초 · 2.5 는 30초) — 그 위는 한 번에 못 굽는다
//   ② 스토리보드 원본이 있다 — 통짜 굽기의 유일한 참조다
//   ③ 칸 수가 격자 표 안이다 — 지문이 "R행 C열"을 말해야 모델이 순서로 읽는다(게이트 D)
// 하나라도 어긋나면 **던지지 않고 컷별로 떨어진다.** 그 길은 그대로 살아 있다.
export function planReelBake(project) {
  const cuts = Array.isArray(project?.cuts) ? project.cuts : [];
  const settings = project?.settings || {};
  // target_seconds 가 정가·청구가 읽는 축이다(app/api/reel/route.js 가 seconds 를 그 별칭으로 둔다).
  const seconds = Number(settings.target_seconds) || Number(settings.seconds) || 0;
  const sheet = reelSheetUrl(cuts);
  // ★ 격자는 **이 프로젝트의 화질·비율**로 잰다 — 720p 로 고정해 재면 480p 프로젝트가
  //   담을 수 있는 칸 수를 놓치고, 1080p 는 못 담는 수를 담긴다고 잘못 읽는다.
  const grid = storyboardGridFor(cuts.length, {
    resolution: settings.resolution,
    aspect: settings.aspect_ratio,
  });
  if (cuts.length > 0 && seconds > 0 && seconds <= oneShotMaxFor(project) && sheet && grid) {
    return { mode: "oneshot", sheet, grid, seconds, count: cuts.length };
  }
  return { mode: "percut", sheet: "", grid: null, seconds, count: cuts.length };
}

// ── 전체 프롬프트 하나 ───────────────────────────────────────────────────
//
// ★★ **시나리오의 `text` 가 그대로 전체 프롬프트다.** lib/ad/scenario.js 가 "이 영상은 한
//   번에 통째로 만들어진다"를 전제로 쓴 통짜 지시문이라, 통짜 굽기에 필요한 글이 이미 다
//   쓰여 있다 — 새로 LLM 을 부를 이유가 없다(그래서 이 갈래에는 "다시 쓰기" 값도 0 이다).
// ★ 사장님이 ④에서 고친 것은 `reel.prompt` 에 산다. 시나리오 `text` 를 직접 덮지 않는
//   이유: 그 값은 컷·그림의 원천이라(scenarioLock 이 지키는 그 값) 고치면 그림까지 낡는다.
export function reelWholePrompt(project) {
  const edited = typeof project?.reel?.prompt === "string" ? project.reel.prompt.trim() : "";
  if (edited) return edited;
  const text = project?.scenario?.text;
  return typeof text === "string" ? text.trim() : "";
}

// 실제로 fal 로 나가는 지문 = **머리말 + 전체 프롬프트**.
//
// ★★ 머리말은 2026-08-25 실측을 통과한 문장 그대로다(scripts/measure/bake-storyboard-r2v.mjs).
//   두 대목이 load-bearing 이다: **읽는 순서**(행이 둘부터는 자명하지 않다)와 **분할 화면
//   금지**(이 문장이 없으면 모델이 격자를 그대로 움직일 위험이 크다 — 그 갈림이 정확히
//   그 실측이 재려던 것이었다).
export function buildOneShotPrompt(grid, count, body) {
  const rows = Number(grid?.rows) || 1;
  const cols = Number(grid?.cols) || 1;
  const head =
    `The attached reference image is a ${count}-panel storyboard laid out as a ${rows}-row by ${cols}-column grid, ` +
    `read in order left to right across each row, top row first. ` +
    `Use those panels as the shot sequence for this film, in that order. ` +
    `Do NOT show the grid, panel borders, or any split screen — render one single continuous vertical film that moves through those shots.`;
  const text = typeof body === "string" ? body.trim() : "";
  return [head, text].filter(Boolean).join("\n\n");
}

// ── 굽기 게이트 ──────────────────────────────────────────────────────────
//
// ★ 화면(⑤·스테퍼)과 라우트의 **청구 앞 검사**가 이 함수 하나를 함께 본다 — 손으로 다시
//   적으면 화면이 열어 준 버튼을 서버가 400 으로 막는 어긋남이 생긴다(이 저장소 규율).
// ★ 통짜 갈래는 `clip_prompt` 를 안 본다 — 그 갈래에는 컷별 프롬프트가 아예 없다.
//   컷별 갈래는 예전 판정(canBakeReelClips) 글자 그대로다.
export function canBakeReel(project) {
  const plan = planReelBake(project);
  if (plan.mode === "oneshot") return !!reelWholePrompt(project);
  return canBakeReelClips(project?.cuts);
}

// ── 낡음 ────────────────────────────────────────────────────────────────
//
// 각인 규율은 컷별과 같다(lib/reel/steps.js 의 isReelClipStale) — "무엇에서 나왔는지"를
// 적어 두고 지금 값과 비교한다. 축이 둘이다: 전체 프롬프트(of)와 스토리보드 원본(imageOf).
//
// ★ `imageOf` 를 모르는 클립은 그 축으로 안 낡는다 — 옛 각인 보호(같은 함정을 컷별에서
//   이미 한 번 밟았다, isReelClipStale 머리말 참고).
export function isReelOneShotStale(project) {
  const cut = (Array.isArray(project?.cuts) ? project.cuts : [])[0];
  const video = cut?.video;
  if (!video?.url) return false;
  if ((video.of || "") !== reelWholePrompt(project)) return true;
  if (video.imageOf === undefined) return false;
  return video.imageOf !== (reelSheetUrl(project?.cuts) || null);
}
