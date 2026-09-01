// reel 흐름의 단계 표 — **유일한 자리다.**
//
// ⚠️ 스테퍼·라우팅 가드·현재단계 판정이 모두 이 표를 본다. 한 곳이라도 손으로 적으면
//   화면이 여는 문과 가드가 닫는 문이 갈린다(2026-08-13 에 겪은 결함).
// ★ ③목소리가 없다 — 이 흐름은 클립이 직접 말한다(speaks: true). 만들 것이 없는 단계를
//   두면 사장님에게는 눌러야 할 것 같은 죽은 화면이 된다(2026-08-14 사용자 지적).
//
// ★ **순수 함수다** — 화면이 이 파일을 읽는다. import 는 **같은 lib/reel 안의 순수
//   모듈만** 허용한다(tests/reel-steps.test.js 의 "순수 규율"이 그 뜻으로 못 박는다) —
//   진짜 목적은 "사슬 끝에 fs·env 가 안 닿는 것"이지 "import 0건"이 아니다.
//   ★★ 2026-08-21 Task 12 리뷰 A4 — 가드 판정(isReelStepReachable·currentReelStepKey·
//   reelStepFromPathname)이 처음엔 app/reel/[id]/layout.js 안에 있었다. reel 은 방식이
//   하나뿐이라 레이아웃이 유일한 소비자일 줄 알았는데, 보관함 상세(app/archive/[id]/page.js)
//   가 "이어서 작업하기" 링크를 만들려면 같은 판정이 또 필요했다 — 그래서 표 옆으로
//   옮긴다(두 벌이면 갈린다).
//   ★★ 2026-08-21 리뷰 C1 — 옮긴 직후엔 `lib/reel/doc.js` 의 `canBakeReelClips` 를
//   못 빌린다고(순수 규율이 import 자체를 막는다고) 잘못 판단해 뜻만 같은 판정을 로컬에
//   두 벌 뒀었다. **틀렸다** — film 이 이미 같은 모양이다(`lib/film/steps.js:14` 의
//   `import { filmOf } from "./doc.js"`). 순수→순수 import 는 이 저장소의 정상 관용구고,
//   위 순수 규율의 진짜 뜻(fs 가 안 닿는 것)도 그 길을 막지 않는다 — 그래서 그대로
//   가져다 쓴다. 판정은 정확히 **한 곳**(doc.js)이다.
// ★★ 2026-08-25 — 굽기 게이트가 **갈래마다 다르다**(통짜는 컷별 프롬프트가 아예 없다).
//   그 판정도 순수 모듈 하나에 있다 — lib/reel/oneshot.js 의 canBakeReel 이 컷별
//   갈래에서는 canBakeReelClips 를 그대로 부른다(회귀 0).
import { canBakeReel } from "./oneshot.js";
// ★ 순수→순수 import 다(위 머리말의 관용구) — 그림 잠금 판정을 두 벌로 두지 않는다.
import { reelOf, isImagesLocked } from "./doc.js";

export const REEL_STEPS = Object.freeze([
  Object.freeze({ key: "material", no: "1", label: "입력", seg: "briefing" }),
  Object.freeze({ key: "scenario", no: "2", label: "시나리오", seg: "scenario" }),
  Object.freeze({ key: "images", no: "3", label: "이미지 생성", seg: "images" }),
  // ★ 굽기 **전**이다. 여기서 고치는 것은 0원이고, 구운 뒤 고치면 컷당 12크레딧이다.
  Object.freeze({ key: "prompts", no: "4", label: "영상 프롬프트", seg: "prompts" }),
  Object.freeze({ key: "video", no: "5", label: "영상", seg: "video" }),
  Object.freeze({ key: "done", no: "6", label: "완성", seg: "done" }),
]);

export function reelStepHref(step, projectId) {
  if (!projectId) return "/reel/new";
  return `/reel/${projectId}/${step.seg}`;
}

// 낡음은 **각인(of)** 으로 판정한다 — 버전 번호가 아니라 "무엇에서 나왔는지"를 적어 두고
// 지금 값과 비교한다(lib/steps.js 하단과 같은 규율).
//
// ★★ 각인이 **저장된 프롬프트**다. LLM 은 부를 때마다 다른 문장을 내므로, 각인을 "지금
//   다시 부른 결과"로 잡으면 이미 산 클립이 매번 낡는다(컷당 12크레딧 재구매).
//
// ★★ 2026-08-21 재검토 B1 — 그림만 다시 그린 경우(clip_prompt 는 그대로)도 낡음이다.
//   `of` 형식(clip_prompt 그대로)은 **안 바꾼다** — 바꾸면 이미 구운 클립 전부가 "그림
//   축이 새로 생겼다"는 이유만으로 한꺼번에 낡는다(lib/steps.js 의 clipKey 머리말이 적어
//   둔 그 함정 — 게다가 tests/reel-pipeline-clips.test.js 가 `video.of === clip_prompt`
//   를 그대로 못 박아 뒀다). 그래서 그림 축은 **별도 필드**(video.imageOf)로 둔다.
//   ⚠️ **있을 때만 비교한다** — `video.imageOf` 가 없는 클립(이 축이 생기기 전에 구운
//   것)은 비교하지 않는다. `cut.image.url` 은 클립을 구우려면 항상 있어야 하므로
//   "있으면 비교"로 적으면 옛 클립 전부가 즉시 낡는다 — clipKey 의 speed 축과 달리
//   image 는 컷마다 있고 없고가 갈리는 값이 아니라서, "저장된 각인이 이 축을 아는가"로
//   조건을 잡아야 옛 각인이 안 다친다.
export function isReelClipStale(cut) {
  const url = cut?.video?.url;
  if (!url) return false;
  if ((cut?.video?.of || "") !== (cut?.clip_prompt || "")) return true;
  if (cut?.video?.imageOf === undefined) return false;
  return cut.video.imageOf !== (cut?.image?.url || null);
}

// ── 열림 판정 (2026-08-21, Task 12 리뷰 A4 — app/reel/[id]/layout.js 에서 옮김) ────────
//
// 순서 그대로 문이 열린다:
//   ①입력·②시나리오는 항상 열려 있다.
//   ③그림은 시나리오가 있어야 연다(시나리오 라우트가 컷을 만든다).
//   ④영상 프롬프트는 컷마다 그림이 있어야 연다 — `/clips` 가 그림 없는 컷을 거절한다
//     (lib/reel/pipeline.js 의 runReelClips 가 문 앞에서 그것부터 본다).
//   ⑤영상(컷별 굽기)은 `canBakeReelClips`(lib/reel/doc.js) 다 — `/clips` 의 청구 앞
//     검사와 **정확히 같은 함수**다(프롬프트뿐 아니라 그림까지, 2026-08-21 리뷰 A2).
//   ⑥완성은 클립을 하나라도 구워야 연다(합성이 구울 재료가 있어야 한다 — `/render` 의
//     "영상을 먼저 만들어 주세요" 400 과 같은 조건).
export function isReelStepReachable(key, project) {
  const cuts = project?.cuts || [];
  if (key === "material" || key === "scenario") return true;
  if (key === "images") return !!project?.scenario?.text;
  if (key === "prompts") return cuts.length > 0 && cuts.every((c) => !!c?.image?.url);
  if (key === "video") return canBakeReel(project);
  if (key === "done") return cuts.some((c) => !!c?.video?.url);
  return false;
}

// 지금 있어야 할 단계 — 위 판정이 여는 순서를 그대로 따라간다.
export function currentReelStepKey(project) {
  if (!project?.scenario?.text) return "scenario";
  const cuts = project?.cuts || [];
  if (!cuts.length || !cuts.every((c) => !!c?.image?.url)) return "images";
  if (!canBakeReel(project)) return "prompts";
  if (!cuts.some((c) => !!c?.video?.url)) return "video";
  return "done";
}

// 경로 → 단계. reel 은 방식이 없어 `/reel/<id>/<seg>` 세 칸 하나뿐이다(film 의 두 갈래와
// 다르다 — film/steps.js 의 filmStepFromPathname 참고).
// 이 단계의 **앞 단계**. 화면이 되돌아가는 링크를 그릴 때 쓴다(2026-08-25).
//
// ★★ 순서는 **표가 쉠다** — 화면마다 "나의 앞은 ②시나리오"라고 손으로 적으면
//   단계가 늘거나 순서가 바뀌는 날 그 화면만 낡는다. 이 저장소가 두 벌을 경계하는 그 자리다.
// ★ 모르는 값·첫 단계면 null 이다 — 던지지 않는다(화면이 그냥 링크를 안 그린다).
export function reelPrevStep(key) {
  const i = REEL_STEPS.findIndex((s) => s.key === key);
  return i > 0 ? REEL_STEPS[i - 1] : null;
}

export function reelStepFromPathname(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean);
  if (parts[0] !== "reel" || parts.length !== 3) return undefined;
  const seg = parts[2];
  return REEL_STEPS.find((s) => s.seg === seg);
}

// **지금 도는 단계는 어디인가** — 사이드바가 깜박일 자리를 고르는 데 쓴다(2026-09-01).
//
// ★★★ ⑤영상과 ⑥완성이 **같은 status("rendering")** 를 쓴다(/clips 와 /render 가 둘 다
//   그렇게 찍는다). 그래서 status 만으로는 못 가른다 — 가르는 것은 **진행 표식(phase)**
//   이다. /render 가 "render" 를 찍고, /clips 는 "video" 를 찍는다.
//   ⚠️ 옛 문서에는 /render 의 표식이 없다(그 줄이 2026-09-01 에야 생겼다) — 그때는
//     "video" 로 읽는다. 굽기가 훨씬 잦았으므로 그쪽이 덜 틀린다.
//
// ★ 그림은 status 가 아니라 **잠금**으로 안다 — 판정은 lib/reel/doc.js 의 isImagesLocked
//   하나다(그리는 화면이 재진입을 막는 데 쓰는 그 값). 두 벌로 적으면 갈린다.
// ★ 모르면 null 이다 — 아무 줄도 안 깜박인다. 넓히는 값이 아니라 **보여 주는 값**이라
//   틀리면 거짓 신호가 된다.
export function runningReelStepKey(project, at = Date.now()) {
  const reel = reelOf(project);
  if (isImagesLocked(reel, at)) return "images";
  if (reel?.status !== "rendering") return null;
  return project?.progress?.phase === "render" ? "done" : "video";
}
