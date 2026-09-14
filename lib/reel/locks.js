// 설정이 **언제 잠기나** — 한 곳에서 판정한다.
//
// ★★ 새 상태를 만들지 않는다. 여기서 보는 신호는 lib/reel/steps.js 의 도달 판정이 쓰는 것과
//   글자 그대로 같다(scenario.text · cuts[].image.url). 잠금을 위해 문서에 플래그를 더하면,
//   그 플래그와 실제 산출물이 갈리는 날 화면이 거짓말을 한다.
//
// ★ 왜 잠그나: 이 값들은 컷마다 **각인**(`of`)돼 있다(lib/steps.js 하단). 바꾸면 이미 만든
//   산출물이 낡고, 다시 만들면 그만큼 다시 청구된다. 열어 두면 사장님이 모르는 새 재구매다.
//
// ★★ **모델·화질이 「첫 클립」이 아니라 「시나리오 확정」에서 잠기는 이유**(2026-09-14 검토).
//   한때 이 둘을 첫 클립까지 열어 두었는데, 두 자리에서 틀린다 — 되돌리지 마라:
//   ① **컷 수가 그 값에서 나온다.** app/api/reel/[id]/scenario/route.js 의
//      `reelSceneCountRule(seconds, resolution, aspect_ratio, refAspectFor(clipProfileForProject))`
//      가 화질이 담는 칸 수(480p 32 · 720p 15 · 1080p 6)와 모델의 참조 비율을 컷 수에 먹인다.
//      확정 뒤에 바꾸면 이미 만든 컷 구조와 어긋나 통짜로 못 가고 컷별로 떨어진다(fal 1번 → 5번).
//   ② **청구가 그 값으로 걷히고, 다시 안 센다.** 정가는 ④이미지에서
//      `requireVideoCharge({ seconds, model, resolution })` 로 걷는데(app/api/reel/[id]/images/route.js),
//      lib/charges.js 의 `chargeVideo` 는 살아 있는 청구가 있으면 `if (active) return 0` 으로
//      **값을 다시 비교하지 않는다.** 그래서 청구 뒤에 720p→1080p·싼 모델→비싼 모델로 바꾸면
//      `/clips` 가 0 크레딧으로 통과한다 — 비싼 클립을 싼 값에 받는 창이다.
//   시나리오 확정은 그 청구보다 **이르므로**, 여기서 잠그면 두 구멍이 한 번에 닫힌다.
//
// ★ 이 파일은 화면("use client")에서도 import 된다 — **import 를 두지 마라.**

const NOT_LOCKED = { locked: false, reason: "" };
const lock = (on, reason) => (on ? { locked: true, reason } : NOT_LOCKED);

export function lockedAxes(project) {
  const cuts = Array.isArray(project?.cuts) ? project.cuts : [];
  const scenarioDone = !!project?.scenario?.text;
  const drawn = cuts.some((c) => !!c?.image?.url);

  const byScenario = lock(scenarioDone, "시나리오를 확정해서 잠겼어요");
  return {
    aspect_ratio: byScenario,
    target_seconds: byScenario,
    // 화풍만 「첫 그림」이다 — 이 값은 컷 수에 안 들어가고 그림에만 들어간다.
    style: lock(drawn, "첫 그림을 그려서 잠겼어요"),
    i2v_model: byScenario,
    resolution: byScenario,
  };
}

// 화면이 "이 축을 지금 고칠 수 있나"만 묻는 자리 — 라우트도 같은 함수를 쓴다.
export function isAxisOpen(project, axis) {
  const l = lockedAxes(project)[axis];
  return !!l && !l.locked;
}
