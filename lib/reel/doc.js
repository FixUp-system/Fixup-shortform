// reel 문서의 모양과 잠금.
//
// ★ **순수 함수다 — import 문을 두지 마라.** 화면("use client")도 이 파일을 읽는다.
//   사슬 끝에 fs 가 닿으면 빌드가 깨진다(이 저장소가 세 번 겪은 사고다).
// ★ 판정을 여기 하나에 둔다 — 라우트와 화면이 **같은 값**을 봐야 화면이 열어 준 버튼을
//   서버가 400 으로 막는 어긋남이 안 생긴다.

export function emptyReel() {
  return { status: "draft", video: null, error: null };
}

export function reelOf(project) {
  return project?.reel || emptyReel();
}

export function putReel(project, patch) {
  return { ...project, reel: { ...reelOf(project), ...patch } };
}

// 시나리오를 다시 쓸 수 있는가 — 못 막을 이유가 없으면 null 이다.
//
// ★ film 의 scenarioLock 과 같은 결이다. 다른 점은 방식이 하나뿐이라 films 를 안 돈다.
export function scenarioLock(project) {
  const reel = reelOf(project);

  // ① 이미 구운 편이 있다.
  if (reel?.video?.url) {
    return { reason: "baked", message: "이미 만든 영상이 있어요 — 시나리오를 바꾸려면 새로 시작해 주세요" };
  }

  // ② 굽는 **창** 동안도 같다. 접수는 됐는데 아직 수거 전인 구간은 video 가 비어 있어
  //    ①을 그냥 지난다 — 그 사이 고치면 굽고 있는 편만 옛 판이 되고, 값은 이미 나갔다.
  if (reel?.status === "rendering") {
    return { reason: "rendering", message: "지금 영상을 만드는 중이에요 — 끝난 뒤에는 새로 시작해 주세요" };
  }

  return null;
}

// 굽기 버튼을 열어도 되는가 — 컷마다 프롬프트가 있어야 한다.
//
// ★ 빈 배열은 **아니다.** 컷이 없는데 열면 0개를 굽고 "완성"이 된다.
export function isPromptsReady(cuts) {
  const list = Array.isArray(cuts) ? cuts : [];
  if (!list.length) return false;
  return list.every((c) => typeof c?.clip_prompt === "string" && c.clip_prompt.trim().length > 0);
}
