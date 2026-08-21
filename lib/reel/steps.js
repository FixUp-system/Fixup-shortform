// reel 흐름의 단계 표 — **유일한 자리다.**
//
// ⚠️ 스테퍼·라우팅 가드·현재단계 판정이 모두 이 표를 본다. 한 곳이라도 손으로 적으면
//   화면이 여는 문과 가드가 닫는 문이 갈린다(2026-08-13 에 겪은 결함).
// ★ ③목소리가 없다 — 이 흐름은 클립이 직접 말한다(speaks: true). 만들 것이 없는 단계를
//   두면 사장님에게는 눌러야 할 것 같은 죽은 화면이 된다(2026-08-14 사용자 지적).
//
// ★ **순수 함수다 — import 문을 두지 마라.** 화면이 이 파일을 읽는다
//   (tests/reel-steps.test.js 의 "import 문이 없다"가 못 박는다).
//   ★★ 2026-08-21 Task 12 리뷰 A4 — 가드 판정(isReelStepReachable·currentReelStepKey·
//   reelStepFromPathname)이 처음엔 app/reel/[id]/layout.js 안에 있었다. reel 은 방식이
//   하나뿐이라 레이아웃이 유일한 소비자일 줄 알았는데, 보관함 상세(app/archive/[id]/page.js)
//   가 "이어서 작업하기" 링크를 만들려면 같은 판정이 또 필요했다 — 그래서 표 옆으로
//   옮긴다(두 벌이면 갈린다). film 은 이 자리(lib/film/steps.js)에서 doc.js 를 import 해
//   `filmOf`를 부르지만, 여기서는 그 길을 안 따른다 — reel/doc.js 도 "import 문을 두지
//   마라"는 같은 순수 규율이 걸려 있고(tests/reel-doc.test.js), 이 태스크의 파일 범위가
//   그 두 순수-규율 테스트(reel-steps·reel-doc) 밖이라 되돌아가 풀 수 없다. 그래서 아래
//   `cutsBakeReady` 는 `lib/reel/doc.js` 의 `canBakeReelClips` 와 **의도적으로 같은 판정을
//   두 벌** 둔다 — 어긋나면 두 판정이 서로 다른 답을 낼 수 있다는 뜻이니, 저 함수를 고칠
//   때는 반드시 이 함수도 함께 본다. ⚠️ 이 복제는 **경로 안내(라우팅)에만** 쓰인다 — 실제
//   청구 앞 게이트(app/api/reel/[id]/clips/route.js)와 화면 버튼 잠금
//   (app/reel/[id]/video/page.js)은 둘 다 `canBakeReelClips` 를 **직접 import** 해서
//   쓴다(그 두 파일은 "use client"/route 핸들러라 순수 규율이 없다) — 그래서 값이 나가는
//   판정 자체는 한 곳(doc.js)이고, 여기 복제가 어긋나도 새는 것은 "잘못된 화면으로
//   안내"뿐이지 "잘못 청구"가 아니다.
function cutsBakeReady(cuts) {
  const list = Array.isArray(cuts) ? cuts : [];
  if (!list.length) return false;
  return list.every(
    (c) => typeof c?.clip_prompt === "string" && c.clip_prompt.trim().length > 0 && !!c?.image?.url
  );
}

export const REEL_STEPS = Object.freeze([
  Object.freeze({ key: "material", no: "1", label: "입력", seg: "briefing" }),
  Object.freeze({ key: "scenario", no: "2", label: "시나리오", seg: "scenario" }),
  Object.freeze({ key: "images", no: "3", label: "그림", seg: "images" }),
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
//   ⑤영상(컷별 굽기)은 `cutsBakeReady` 다 — `/clips` 의 청구 앞 검사(`canBakeReelClips`,
//     lib/reel/doc.js)와 **같은 뜻**의 판정이다(프롬프트뿐 아니라 그림까지, 2026-08-21
//     리뷰 A2) — 왜 같은 함수를 못 부르고 뜻만 맞췄는지는 위 머리말 참고.
//   ⑥완성은 클립을 하나라도 구워야 연다(합성이 구울 재료가 있어야 한다 — `/render` 의
//     "영상을 먼저 만들어 주세요" 400 과 같은 조건).
export function isReelStepReachable(key, project) {
  const cuts = project?.cuts || [];
  if (key === "material" || key === "scenario") return true;
  if (key === "images") return !!project?.scenario?.text;
  if (key === "prompts") return cuts.length > 0 && cuts.every((c) => !!c?.image?.url);
  if (key === "video") return cutsBakeReady(cuts);
  if (key === "done") return cuts.some((c) => !!c?.video?.url);
  return false;
}

// 지금 있어야 할 단계 — 위 판정이 여는 순서를 그대로 따라간다.
export function currentReelStepKey(project) {
  if (!project?.scenario?.text) return "scenario";
  const cuts = project?.cuts || [];
  if (!cuts.length || !cuts.every((c) => !!c?.image?.url)) return "images";
  if (!cutsBakeReady(cuts)) return "prompts";
  if (!cuts.some((c) => !!c?.video?.url)) return "video";
  return "done";
}

// 경로 → 단계. reel 은 방식이 없어 `/reel/<id>/<seg>` 세 칸 하나뿐이다(film 의 두 갈래와
// 다르다 — film/steps.js 의 filmStepFromPathname 참고).
export function reelStepFromPathname(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean);
  if (parts[0] !== "reel" || parts.length !== 3) return undefined;
  const seg = parts[2];
  return REEL_STEPS.find((s) => s.seg === seg);
}
