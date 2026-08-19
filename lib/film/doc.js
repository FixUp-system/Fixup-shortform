// 방식별로 **두 벌**을 남긴다.
//
// ★ 한 자리에 덮어쓰면 비교 대상이 사라진다 — 그런데 비교가 이 기능의 목적이다.
//   films.order 를 구워도 films.refs 가 그대로 있어야 두 영상을 나란히 볼 수 있다.
import { filmMode } from "./mode.js";

export function emptyFilm() {
  return { images: [], video: null, status: "draft", error: null };
}

export function filmOf(project, mode) {
  filmMode(mode);
  return project?.films?.[mode] || emptyFilm();
}

export function putFilm(project, mode, patch) {
  filmMode(mode);
  return {
    ...project,
    films: {
      ...(project?.films || {}),
      [mode]: { ...filmOf(project, mode), ...patch },
    },
  };
}

// ── 그림 다시 그리기 그물 ──────────────────────────────────────────────────
//
// ★ 그림에는 **청구가 없다**(정가는 굽기 한 번에 붙는다). 그런데 fal 이미지는 장당 ≈$0.08 이
//   실제로 나가므로, 청구가 없는 자리에는 **횟수와 잠금**이라도 있어야 한다 — 한 번이라도
//   결제한 사람은 잔액이 0 이어도 음수가 아니라 lib/costs.js 의 assertBudget 그물에 안 걸린다
//   (그 판정은 balance < 0 과 체험만 본다). 즉 지금 이 두 상수가 유일한 그물이다.
// ★ 상한의 선례는 광고 시나리오의 MAX_SCENARIO_TRIES 다 — "무료지만 무제한은 아니다".
export const MAX_FILM_IMAGE_TRIES = 6;

// 그리는 중 잠금이 **영원히 걸리지 않게** 하는 상한. 서버리스는 인스턴스가 도중에 죽을 수
// 있고(그러면 status 가 "drawing" 인 채로 남는다), 그때 잠금이 안 풀리면 사장님은 다시 그릴
// 길이 아예 없다. 이미지 몇 장은 몇 분이면 끝나므로 10분이면 넉넉히 지난 뒤다.
export const FILM_IMAGE_LOCK_MS = 10 * 60 * 1000;
