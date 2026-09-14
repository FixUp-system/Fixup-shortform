// 설정이 **언제 잠기나** — 한 곳에서 판정한다.
//
// ★★ 새 상태를 만들지 않는다. 여기서 보는 신호는 lib/reel/steps.js 의 도달 판정이 쓰는 것과
//   글자 그대로 같다(scenario.text · cuts[].image.url · cuts[].video.url). 잠금을 위해 문서에
//   플래그를 더하면, 그 플래그와 실제 산출물이 갈리는 날 화면이 거짓말을 한다.
//
// ★ 왜 잠그나: 이 값들은 컷마다 **각인**(`of`)돼 있다(lib/steps.js 하단). 바꾸면 이미 만든
//   산출물이 낡고, 다시 만들면 그만큼 다시 청구된다. 열어 두면 사장님이 모르는 새 재구매다.
//
// ★ 이 파일은 화면("use client")에서도 import 된다 — **import 를 두지 마라.**

const NOT_LOCKED = { locked: false, reason: "" };
const lock = (on, reason) => (on ? { locked: true, reason } : NOT_LOCKED);

export function lockedAxes(project) {
  const cuts = Array.isArray(project?.cuts) ? project.cuts : [];
  const scenarioDone = !!project?.scenario?.text;
  const drawn = cuts.some((c) => !!c?.image?.url);
  const baked = cuts.some((c) => !!c?.video?.url);

  const byScenario = lock(scenarioDone, "시나리오를 확정해서 잠겼어요");
  const byClip = lock(baked, "첫 컷을 만들어 잠겼어요");
  return {
    aspect_ratio: byScenario,
    target_seconds: byScenario,
    style: lock(drawn, "첫 그림을 그려서 잠겼어요"),
    i2v_model: byClip,
    resolution: byClip,
  };
}

// 화면이 "이 축을 지금 고칠 수 있나"만 묻는 자리 — 라우트도 같은 함수를 쓴다.
export function isAxisOpen(project, axis) {
  const l = lockedAxes(project)[axis];
  return !!l && !l.locked;
}
