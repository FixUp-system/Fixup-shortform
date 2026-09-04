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
import { reelGridFor, sheetAspectFor } from "./scenario-rules.js";
import { canBakeReelClips } from "./doc.js";
// ★★ 2026-08-25 — 상한을 **모델이 정한다**(2.5 가 열리며 생긴 자리). 옛 주석은
//   "이 파일은 순수해야 해서 clip-limits.js 를 못 문다"였는데, 그 파일도 순수하고
//   (사슬 끝에 fs 가 없다) 이제는 값을 거기서 읽어야 갈리지 않는다.
import { clipProfileForProject, maxSecondsFor, refAspectFor } from "../clip-limits.js";
// ★ 끝남 판정은 lib/progress.js 한 벌이다 — 화면도 파이프라인도 같은 자로 세야
//   "끝났는데 만드는 중"이 안 생긴다. 그 파일도 순수하다(import 는 failure.js 하나).
import { isCutDone } from "../progress.js";
// 무엇을 함께 보낼지(인물 제외)와, 그것이 무엇인지 말해 주는 한 줄. 이 파일이 새로
// 짓지 않는다 — 판정과 문구는 lib/photos.js 하나가 쥔다(두 벌이면 갈래마다 다른 말이 간다).
import { isPersonPhoto, attachedRoleLine } from "../photos.js";
// ★ 화자 판정은 **한 벌**이다 — lib/cuts.js 의 isNarrationSpeaker. 컷별 갈래가 이미 그것으로
//   갈리므로 여기서 다시 적으면 같은 시나리오를 두 갈래가 다르게 읽는다(이 저장소 규율).
//   그 파일은 **스스로 순수하다**: import 일곱 중 여섯이 import 0 건이고, 나머지 하나가
//   이미 허용된 ../clip-limits.js 다. fs·env 는 직접 쓰지도 않는다(실측 2026-08-27).
import { isNarrationSpeaker } from "../cuts.js";
// ★ 내레이션 한 벌 판독은 lib/reel/narration.js 하나다 — 여기서 다시 적으면 지시문은
//   새 길로 가고 자막은 옛 길로 가는 어긋남이 생긴다(그 파일 머리말).
import { reelNarration } from "./narration.js";

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
// ★★ 2026-08-31 — 판 비율 계산의 **집을 scenario-rules 로 옮겼다.** 거기가 격자를 만드는
//   자리이고, 시나리오 단계(컷 수 후보 고르기)도 같은 계산이 필요해졌기 때문이다.
//   여기서 다시 내보내는 것은 옛 import 경로를 안 깨려는 것뿐이다 — 계산은 한 곳이다.
export { sheetAspectFor };

// 그 판이 이 프로젝트의 모델이 받는 비율 안인가. 한계를 모르는 모델은 **통과**다.
export function sheetFitsModel(grid, aspect, project) {
  const limit = refAspectFor(clipProfileForProject(project));
  if (!limit) return true;
  const r = sheetAspectFor(grid, aspect);
  return r > 0 && r >= limit.min && r <= limit.max;
}

// **통짜 굽기에 판과 *함께* 보낼 사진.**
//
// ★★★ 2026-09-04 사장님 신고 — "단계별 기본에서 첨부한 로고가 조금 깨진다."
//   원인은 모델이 아니라 **경로**였다: 통짜는 굽기에 판 한 장만 보내서 **원본 로고가 영상
//   모델에 아예 안 갔다.** 판에 그림 모델이 다시 그린 로고만 갔고, 그 사이 로고는 두 번
//   재생성되며 판 안에서 작아진다(이 저장소 실측: 작은 글자는 "글자처럼 생긴 무늬"로
//   재생성되고 **크기가 결정적**이다). 원클릭은 원본을 그대로 보내 이 문제가 덜하다.
//
// ★★ **인물은 안 보낸다**(사장님 판단). 초상 정책 위험을 피하는 가장 싼 길이고, 이 신고는
//   로고(사물) 이야기라 인물과 무관하다. 인물에 격자를 씌우는 안은 **목적을 깨뜨린다** —
//   인물 사진을 넣는 이유가 "그 사람처럼 나오게"인데 얼굴을 덮으면 모델이 그 얼굴을 못 본다.
// ★ 상한을 둔다 — 참조가 많을수록 **판의 무게가 묽어진다**(판이 이 갈래의 주인공이다).
// ★ 비율 거르기는 여기서 안 한다 — 치수를 알려면 바이트를 읽어야 해서 서버 쪽 일이다
//   (lib/reel/pipeline.js). 이 파일은 화면도 읽으므로 순수해야 한다.
export const ONESHOT_MAX_PHOTO_REFS = 3;

export function oneShotRefPhotos(project) {
  const photos = Array.isArray(project?.material?.photos) ? project.material.photos : [];
  return photos.filter((p) => p?.url && !isPersonPhoto(p)).slice(0, ONESHOT_MAX_PHOTO_REFS);
}

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
  // ★★★ **넷째 조건**(2026-08-31) — 스토리보드 한 장이 **그 모델이 받는 비율 안인가.**
  //   H3 는 참조 이미지 비율을 0.4~2.5 로 제한하는데(런타임 검사다, 스키마에 없다) 컷이
  //   다섯이면 격자가 1행×5열이라 판이 **2.81** 이 된다 → 굽기가 422 로 죽는다.
  //   ★ 막는 것이 아니라 **떨어뜨린다** — 이 함수의 계약 그대로다. 컷별 길은 살아 있으므로
  //     사장님 눈에는 실패가 아니라 그냥 컷별로 만들어진 한 편이다.
  //   ★ 한계를 모르는 모델(Seedance·Kling)은 그대로 통과한다 — 모르면 안 막는다.
  if (cuts.length > 0 && seconds > 0 && seconds <= oneShotMaxFor(project) && sheet && grid
    && sheetFitsModel(grid, settings.aspect_ratio, project)) {
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

// 시나리오가 정한 **목소리**. 누가 어떤 톤으로 읽는가(lib/ad/scenario.js 의 `voice`).
//
// ★★ 2026-08-27 — 이 값이 통짜 갈래에서만 모델에게 안 갔다. 광고(lib/ad/generate.js 의
//   withSpokenLines)와 컷별(lib/cuts.js 의 speechFor)은 싣는다 — **길이 하나로 목소리
//   지정이 있고 없고가 갈렸다**(15초·2.5의 30초 = 통짜 = 안 감, 그 밖 = 감).
//   컷별은 컷마다 다른 fal 호출이라 내레이터가 중간에 바뀌는 것이 눈에 띄어 이미 고쳤고
//   (app/api/reel/[id]/scenario/route.js 의 `narrator_voice` 별칭), 통짜는 한 번에 굽는지라
//   **한 편 안에서는 일관돼서** 아무도 눈치채지 못했다 — 일관되기만 하고 **누구인지를
//   우리가 못 고르는** 상태였다(그 자리의 증상이 "AI 가 읽어주는 느낌"이다).
export function reelVoice(project) {
  const v = project?.scenario?.voice;
  return typeof v === "string" ? v.trim() : "";
}

// 이 영상의 말이 **화면 밖 목소리뿐인가.**
//
// ★★ 2026-08-27 — 컷별 갈래는 화자를 보고 셋으로 갈라 못 박는데(lib/cuts.js 의 buildClipPrompt:
//   내레이션 · 화면 속 인물 · 무음) **통짜에는 그 셋 중 아무것도 없었다.** 남은 단서는 LLM 이
//   지시문에 자연어로 써 준 "as the narrator says …" 하나인데 그것은 **지시가 아니라 묘사**라,
//   모델이 인물의 입을 움직여도 막는 문장이 없다.
// ★ **전부 내레이션일 때만 참이다.** 화면 속 인물이 하나라도 말하면 "아무도 입을 안 움직인다"가
//   틀린 지시가 된다 — 그 갈래(립싱크)는 배선이 따로 없어 여기서 열지 않는다.
// ★ 대사가 아예 없으면 거짓이다 — 붙일 이유가 없다(컷별의 무음 갈래는 다른 문장을 쓴다).
// ★★ 2026-08-27 — 축이 **둘**이 됐다. 새 길에서는 내레이션이 `shots[].line` 이 아니라
//   `scenario.narration` 한 벌에 산다. 옛 판정("말하는 장면이 전부 내레이션인가")만으로는
//   새 길 문서가 **말하는 장면 0개**가 되어 화면 밖 목소리 절이 통째로 빠진다.
export function reelNarrates(project) {
  const shots = Array.isArray(project?.scenario?.shots) ? project.scenario.shots : [];
  const spoken = shots.filter((s) => typeof s?.line === "string" && s.line.trim());
  // 화면 속 인물이 하나라도 말하면 거짓이다 — 그 사람은 입이 움직여야 한다(립싱크 갈래는
  // 컷에 그대로 남는다). 한 벌이 함께 있어도 마찬가지다: "아무도 입을 안 움직인다"가 거짓이 된다.
  if (spoken.some((s) => !isNarrationSpeaker(s?.speaker))) return false;
  return spoken.length > 0 || !!reelNarration(project);
}

// 실제로 fal 로 나가는 지문 = **머리말 + 전체 프롬프트 + 목소리**.
//
// ★★ 머리말은 2026-08-25 실측을 통과한 문장 그대로다(scripts/measure/bake-storyboard-r2v.mjs).
//   두 대목이 load-bearing 이다: **읽는 순서**(행이 둘부터는 자명하지 않다)와 **분할 화면
//   금지**(이 문장이 없으면 모델이 격자를 그대로 움직일 위험이 크다 — 그 갈림이 정확히
//   그 실측이 재려던 것이었다).
//
// ★★ **목소리가 여기 붙는 이유가 각인이다.** 각인(video.of)이 무는 것은 본문(body) 하나고
//   (lib/reel/pipeline.js 의 `of: body` — "머리말을 적으면 각인이 매번 달라져 이미 구운
//   편이 통째로 낡는다"), 지문 쪽에 붙는 글은 그 각인을 **안 흔든다**. 그래서 이미 돈을
//   내고 구운 옛 편이 이 변경으로 낡지 않는다. 사장님 지시가 정확히 그것이었다(08-27).
// ★ 값이 없으면 그 절이 **통째로 없다** — 옛 문서의 지문이 글자 그대로다(광고 갈래의
//   같은 규율: lib/ad/generate.js 의 "값이 없으면 그 줄이 통째로 없다").
// ★ 문구는 광고 갈래에서 **글자 그대로 옮겼다** — 새 문장을 발명하지 않는다.
// ★ 말에 관한 값이 셋을 넘어서 **객체 하나로** 받는다(2026-08-27) — 위치 인자로는
//   `buildOneShotPrompt(g, n, b, "", true, null, "Korean")` 같은 호출이 되어 읽을 수 없다.
// 캐스팅이 정한 **사람의 생김새** — 통짜 지문에 실을 한 줄.
//
// ★★★ 2026-08-31 실측 — 이 값이 **영상까지 못 가고 있었다.** 캐스팅은
//   `cast[].look` 에 *"shoulder-length dark brown hair loosely tucked behind one ear,
//   slim build, cream knit sweater"* 까지 적어 두는데, 통짜 지문 1,080자 안에 그 낱말이
//   **한 개도** 없었다. 영상 모델이 받은 인물 정보는 본문의 *"a cheerful young woman"*
//   한 마디뿐이라, 나오는 사람이 아바타를 안 닮는 것이 당연했다.
// ★★ 왜 이제 결정적인가 — 2.5 는 **얼굴 사진을 참조로 못 받는다**(같은 날 실측 5건:
//   큰 얼굴 · 작은 얼굴 · 단독 인물 카드 · 배경에 작게 · 전부 거절). 그래서 판에서 얼굴을
//   뺐고, **그 순간부터 생김새를 정하는 것은 이 글뿐이다.**
// ★ 각인(`of`)은 본문 하나를 문다 — 이 줄이 늘어도 **이미 구운 편은 안 낡는다**
//   (목소리·내레이션 줄과 같은 규약, runReelOneShot 의 `of: body`).
// ★ 캐스팅이 없거나 비어 있으면 **빈 문자열**이다 — 그러면 지문이 예전과 글자 그대로다.
export function reelCastLine(project) {
  const cast = Array.isArray(project?.cast) ? project.cast : [];
  const people = cast
    .map((c) => {
      const who = typeof c?.who === "string" ? c.who.trim() : "";
      const look = typeof c?.look === "string" ? c.look.trim() : "";
      return [who, look].filter(Boolean).join(" — ");
    })
    .filter(Boolean);
  if (!people.length) return "";
  return `The people in this film: ${people.join(" / ")}. `
    + "Keep each person's look — hair, build, clothing — identical from the first shot to the last.";
}

export function buildOneShotPrompt(grid, count, body, speech = {}) {
  const voice = speech?.voice;
  const narrates = speech?.narrates;
  const rows = Number(grid?.rows) || 1;
  const cols = Number(grid?.cols) || 1;
  const head =
    `The attached reference image is a ${count}-panel storyboard laid out as a ${rows}-row by ${cols}-column grid, ` +
    `read in order left to right across each row, top row first. ` +
    `Use those panels as the shot sequence for this film, in that order. ` +
    `Do NOT show the grid, panel borders, or any split screen — render one single continuous vertical film that moves through those shots.`;
  const text = typeof body === "string" ? body.trim() : "";
  // ★ 본문 **뒤**다 — 뒤에 올수록 모델이 강하게 받는다(이 저장소의 규약, lib/reel/whole-prompt.js).
  // ★ 차례는 컷별 갈래와 같다: **누가 말하는가**(화면 밖인가) → **어떤 목소리인가** → **무슨 말인가**.
  const said = typeof voice === "string" ? voice.trim() : "";
  // ★★ 내레이션 한 벌(2026-08-27). 없으면 아래 두 문장이 통째로 없어 지문이 예전 그대로다.
  const one = speech?.narration;
  const line = typeof one?.text === "string" ? one.text.trim() : "";
  const sayAs = typeof one?.sayAs === "string" ? one.sayAs.trim() : "";
  const langLine = typeof speech?.langLine === "string" && speech.langLine.trim()
    ? speech.langLine.trim() : "Korean";
  const spoken = [
    narrates
      ? "A narrator speaks in voiceover, off-screen — no one in frame speaks or moves their lips."
      : "",
    // ★★ **이어짐을 요구하는 한 마디** — 이것이 이 회차에 새로 더하는 유일한 문장이다.
    //   나머지는 lib/cuts.js 의 내레이션 갈래에서 글자 그대로 옮겼다. 컷별 갈래에는 이 말이
    //   필요 없었다(클립이 하나뿐이라 끊길 자리가 없다) — 한 벌이 되면서 생긴 요구다.
    line
      ? "It is one continuous narration across the whole film, not one line per shot — do not pause between shots."
      : "",
    said
      ? `Voice: ${said}. This describes how the narration sounds — it is audio only, never on-screen text.`
      : "",
    // ★ 말은 **맨 뒤**다 — 뒤에 올수록 강하게 받는다. 컷별 갈래도 Says exactly 가 끝이다.
    line ? `Says exactly, in ${langLine}: "${line}".` : "",
    // ★★★ 2026-09-01 사장님 지시 — **낱말별 발음 표기가 아니라 "그 나라 사람처럼 읽어라"**
    //   한 줄이다. 실측: 낭독 끝의 "픽스업"(붙여 쓴 외래 상표)이 뭉개졌다.
    //   ★ `say_as` 로는 안 닫혔다 — 그 칸은 "필요할 때만"의 판단이 모델 몫이라, 같은 규칙을
    //     두 자리에 적고 두 번 뽑았는데 **두 번 다 빈 문자열**이었다(2026-09-01 실측).
    //     그래서 낱말을 고쳐 주는 대신 **읽는 사람**을 정한다 — 이쪽은 모델의 판단이 안 낀다.
    //   ★ 언어는 못 박지 않는다 — `langLine` 이 사장님이 고른 낭독 언어를 그대로 나른다
    //     (Korean · Japanese · Simplified Chinese …). 한 언어를 적으면 나머지가 죽는다.
    line ? `The narration is delivered by a native ${langLine} speaker with natural, fluent ${langLine} pronunciation and everyday intonation — never a foreign accent, never spelled out letter by letter.` : "",
    // ★ 글자와 소리는 다른 축이다(lib/ad/scenario.js 의 say_as 규칙) — 자막은 위 글을 쓰고
    //   모델은 이 표기를 읽는다. 없으면 이 문장이 아예 없다.
    line && sayAs ? `Pronounce it as: "${sayAs}".` : "",
  ].filter(Boolean).join(" ");
  // ★ 생김새는 **본문 뒤·말 앞**이다. 본문 앞에 두면 모델이 인물을 먼저 읽고 장면보다
  //   사람을 앞세우고, 맨 뒤에 두면 "무슨 말을 하는가"를 밀어낸다.
  const cast = typeof speech?.cast === "string" ? speech.cast.trim() : "";
  // ★★ 첨부한 사진이 **무엇인지** 말해 준다(2026-09-04). 안 말하면 모델이 그것을
  //   "분위기 참고"로 읽고 로고를 자기 식으로 다시 그린다 — 원본을 보내는 뜻이 사라진다.
  //   ★ 문구는 컷별 갈래와 **같은 함수**가 만든다(lib/photos.js 의 attachedRoleLine).
  //   ★ 자리는 **본문 뒤·말 앞**이다. 판이 주인공이라 판 설명을 밀지 않고, 맨 뒤에
  //     두면 "무슨 말을 하는가"를 밀어낸다.
  const attached = attachedRoleLine(speech?.photos).trim();
  return [head, text, cast, attached, spoken].filter(Boolean).join("\n\n");
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

// ── 굽기 진척 ────────────────────────────────────────────────────────────
//
// **갈래마다 세는 단위가 다르다.** 통짜는 컷이 열둘이어도 굽는 것이 **한 편**이라
// total 이 1 이다 — 컷 수로 세면 통짜가 끝난 뒤에도 "1/12"에 멈춰 서서, 정상으로 끝난
// 굽기가 2분 뒤 전부 "멈췄어요"가 된다(runReelOneShot 은 첫 컷에만 담고 나머지 컷의
// 옛 클립은 걷어낸다 — lib/reel/pipeline.js).
//
// ★ "끝났는가"의 판정은 여기서 다시 적지 않는다 — lib/progress.js 의 isCutDone 하나다.
// ★ cuts 를 따로 받는 이유: 화면은 상태 라우트가 준 **더 최신인** 컷으로 세야 한다
//   (문서는 폴링보다 뒤처진다). 안 넘기면 문서의 컷을 쓴다.
export function reelBakeCounts(project, cuts) {
  const all = Array.isArray(cuts) ? cuts : (Array.isArray(project?.cuts) ? project.cuts : []);
  // 갈래는 **문서**로 판정한다 — 상태 라우트는 settings·scenario 를 안 싣는다.
  const whole = planReelBake(project).mode === "oneshot";
  const scope = whole ? all.slice(0, 1) : all;
  return { done: scope.filter((c) => isCutDone(c, "video")).length, total: scope.length };
}
