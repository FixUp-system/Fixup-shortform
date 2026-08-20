import { FILM_MODES } from "./mode.js";
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

// "지금 그릴 수 있는가" — **판정은 여기 하나다.**
//
// ★★ 화면은 films[mode].status 만 보고 버튼을 잠근다. 그런데 서버는 10분이 지나면
//   "drawing" 이 남아 있어도 열어 준다(위 FILM_IMAGE_LOCK_MS) — 그 만료 계산을 화면에도
//   적으면 판정이 두 벌이 되고, 언제나 한쪽이 먼저 낡는다. 그래서 서버가 계산해서
//   상태 응답에 담아 내려준다(app/api/film/[id]/status/route.js).
// ★ 순수 함수다 — 이 파일은 "use client" 화면도 import 한다(import 문이 없다).
export function isDrawLocked(film, at = Date.now()) {
  return film?.status === "drawing" && at - Number(film?.drawingAt || 0) < FILM_IMAGE_LOCK_MS;
}

export function drawTriesLeft(film) {
  return Math.max(0, MAX_FILM_IMAGE_TRIES - (Number(film?.imageTries) || 0));
}

// 잠금(재진입)과 상한(횟수) 둘 다 지나야 그릴 수 있다 — 그림 라우트가 보는 두 문 그대로다.
export function canDrawFilm(film, at = Date.now()) {
  return !isDrawLocked(film, at) && drawTriesLeft(film) > 0;
}

// ── 시나리오를 다시 쓸 수 있는가 ───────────────────────────────────────────
//
// ★★ 시나리오는 두 방식이 **공유하는 하나**다. 그래서 이 판정만 방식 하나가 아니라
//   **프로젝트 전체**(films 의 모든 칸)를 본다 — 한 방식이라도 되돌릴 수 없는 자리에
//   들어갔으면 시나리오는 못 고친다.
// ★ 순수 함수다(이 파일은 "use client" 화면도 import 한다). 라우트와 화면이 **같은 값**을
//   봐야 화면이 열어 준 버튼을 서버가 400 으로 막는 어긋남이 안 생긴다 — 그 버튼은
//   지금까지 "누르면 항상 400" 인 채로 열려 있었다.
//
// 막는 이유가 셋이고 사장님에게 하는 말이 다르므로 사유를 함께 돌려준다.
// 못 막을 이유가 없으면 null 이다.
export function scenarioLock(project) {
  const films = Object.values(project?.films || {});

  // ① 이미 구운 편이 있다 — 방식마다 다른 판으로 구우면 비교가 무의미해진다.
  if (films.some((f) => f?.video?.url)) {
    return { reason: "baked", message: "이미 만든 영상이 있어요 — 시나리오를 바꾸려면 새로 시작해 주세요" };
  }

  // ② 굽는 **창** 동안도 같다(2026-08-19). 접수는 됐는데 아직 수거 전인 구간은
  //    video 가 비어 있어 ①을 그냥 지난다. 이 경로는 굽는 데 8분이 걸려 그 창이 좁지
  //    않고, 그 사이 고치면 굽고 있는 편만 옛 판이 된다 — 값(35 크레딧)은 이미 나갔다.
  if (films.some((f) => f?.status === "rendering")) {
    return { reason: "rendering", message: "지금 영상을 만드는 중이에요 — 끝난 뒤에는 새로 시작해 주세요" };
  }

  // ③ 그림 상한을 다 쓴 방식이 있다 — 여기서 안 막으면 **값을 치를 길이 없는 프로젝트**가
  //    된다: 고치고 나면 그 방식은 옛 판 그림뿐인데 다시 그릴 수 없고(6회 소진), 옛 판
  //    그림으로는 굽기가 400 이다(scenarioTries 대조). 어느 문으로도 못 나간다.
  if (films.some((f) => drawTriesLeft(f) === 0)) {
    return { reason: "images_exhausted", message: "그림을 더 못 그리는 방식이 있어요 — 시나리오를 바꾸려면 새로 시작해 주세요" };
  }

  return null;
}

// ── 보관함 카드가 읽는 값 ──────────────────────────────────────────────────
//
// ★★ film 은 한 프로젝트가 **두 편**을 담는다(order·refs). 그래서 목록의 두 자리가
//   film 을 몰랐다(2026-08-19):
//     · 카드가 방식을 모른다 — "한 번에" 배지만 있고 어느 쪽을 구웠는지 안 보였다
//     · **썸네일이 아예 안 나온다** — video_url 이 doc.render(단계별)와 doc.videos[0]
//       (광고)만 봐서 film 은 null 이었다
// ★ 판정을 여기 하나에 둔다 — 목록 flatten 이 네 곳(메모리·Supabase × 목록 둘)이라
//   손으로 적으면 그중 하나가 늘 낡는다.
// ★ 순수 함수다(이 파일은 "use client" 화면도 import 한다).

// 구운 방식 목록 — 표(FILM_MODES)를 돌려 만든다. 방식이 늘어도 여기는 안 고친다.
export function filmModesOf(doc) {
  const films = doc?.films || {};
  return FILM_MODES.filter((m) => films[m.id]?.video?.url).map((m) => m.id);
}

// 카드 썸네일에 쓸 완성본 — 먼저 구운 쪽을 보여준다(표 순서).
export function filmVideoUrlOf(doc) {
  const films = doc?.films || {};
  for (const m of FILM_MODES) {
    const url = films[m.id]?.video?.url;
    if (url) return url;
  }
  return null;
}
