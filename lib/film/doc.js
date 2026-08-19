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
