// 「영상 만들기」를 눌렀을 때 갈 곳 — **작업 중이던 자리**다. 순수 함수(화면이 import 한다).
//
// ★★ 2026-08-25 사장님 지적: 시나리오까지 만들어 놓고 사이드바를 눌렀더니 진행 사항이
//   사라졌다. 링크가 `/reel/new` 고정이라 새 프로젝트 화면으로 갔기 때문이다.
//   (문서가 지워진 것은 아니다 — 보관함에 그대로 있었다. 돌아갈 길이 없었을 뿐이다.)
//
// ★ 옆의 둘이 이미 같은 규칙이다: components/Sidebar.jsx 의 makeHref(단계별)·makeAdHref(광고).
//   reel 만 못 하던 이유는 프로젝트가 레이아웃 안에서만 살아서였는데, 공급자를 루트로
//   올리면서(components/ReelProjectContext) 그 이유가 사라졌다.
//
// ★★ **어느 단계인가는 여기서 세지 않는다** — currentReelStepKey 하나가 안다.
//   화면이나 이 파일이 따로 세면 단계가 늘거나 순서가 바뀔 때 그 자리만 낡는다.
import { REEL_STEPS, currentReelStepKey, reelStepHref } from "./steps.js";

export function makeReelHref(project) {
  if (!project?.id) return "/reel/new";
  const step = REEL_STEPS.find((s) => s.key === currentReelStepKey(project)) || REEL_STEPS[0];
  return reelStepHref(step, project.id);
}
