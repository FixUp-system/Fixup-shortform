// reel 흐름의 단계 표 — **유일한 자리다.**
//
// ⚠️ 스테퍼·라우팅 가드·현재단계 판정이 모두 이 표를 본다. 한 곳이라도 손으로 적으면
//   화면이 여는 문과 가드가 닫는 문이 갈린다(2026-08-13 에 겪은 결함).
// ★ **순수 함수다 — import 문을 두지 마라.** 화면이 이 파일을 읽는다.
// ★ ③목소리가 없다 — 이 흐름은 클립이 직접 말한다(speaks: true). 만들 것이 없는 단계를
//   두면 사장님에게는 눌러야 할 것 같은 죽은 화면이 된다(2026-08-14 사용자 지적).

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
