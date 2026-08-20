// 한 번에 굽는 영상의 단계 표 — **한 벌**이다.
//
// ★★ 왜 lib/steps.js 를 안 쓰나: 저쪽 표는 컷 파이프라인의 낡음 판정·projectSpeaks 분기까지
//   얽혀 있다. 한 표에 두 흐름을 담으면 한쪽을 고칠 때마다 다른 쪽을 확인해야 한다.
//   대신 **모양은 같게** 둔다 — 읽는 사람이 저쪽에서 배운 것을 그대로 쓸 수 있게.
//
// ★★ perMode 가 이 표의 핵심이다. 입력·시나리오는 두 방식이 **공유하는 하나**이고
//   (app/api/film/[id]/scenario/route.js 가 mode 를 아예 안 본다), 그림부터 갈린다.
//   주소가 그 사실을 그대로 담으면, 나중에 방식 하나가 확정됐을 때 뒤쪽 세그먼트만
//   걷어내면 된다 — 앞 두 단계는 손대지 않는다.
//
// ★ import 는 doc.js·mode.js 둘뿐이고 그 사슬에 fs·env 가 없다 — "use client" 화면이
//   이 파일을 그대로 부를 수 있어야 한다(lib/steps.js 머리말과 같은 성질).
import { filmOf } from "./doc.js";
import { filmMode } from "./mode.js";

// ★ 얼려 둔다. 스테퍼·라우팅 가드·currentFilmStepKey 가 **모두 이 표를 본다** —
//   호출부의 push 한 줄로 화면이 여는 문과 가드가 닫는 문이 갈린다(lib/steps.js 가
//   2026-08-13 에 겪은 결함이다).
export const FILM_STEPS = Object.freeze([
  Object.freeze({ key: "material", no: "1", label: "입력", seg: "briefing", perMode: false }),
  Object.freeze({ key: "scenario", no: "2", label: "시나리오", seg: "scenario", perMode: false }),
  Object.freeze({ key: "images", no: "3", label: "그림", seg: "images", perMode: true }),
  Object.freeze({ key: "video", no: "4", label: "영상", seg: "video", perMode: true }),
  Object.freeze({ key: "done", no: "5", label: "완성", seg: "done", perMode: true }),
]);

// ★ 방식별 단계는 모르는 방식으로 주소를 못 만든다 — filmMode 가 던진다.
//   조용히 한쪽으로 떨어뜨리면 사장님이 고른 것과 다른 방식으로 값이 나간다.
export function filmStepHref(step, projectId, mode) {
  if (!step || !projectId) return null;
  if (!step.perMode) return `/film/${projectId}/${step.seg}`;
  filmMode(mode); // 반환값은 안 쓴다 — 모르는 방식을 여기서 던지게 하려는 검증 호출이다
  return `/film/${projectId}/${mode}/${step.seg}`;
}

// 경로 → 단계.
//
// ⚠️ 옛 한 화면(`/film/one/<mode>`)은 이 표의 단계가 **아니다.** `one` 은 정적 세그먼트라
//   프로젝트 id 자리에 오지 않는다 — 가드가 그 화면을 건드리면 멀쩡한 화면이 되돌려진다.
export function filmStepFromPathname(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean);
  if (parts[0] !== "film" || parts.length < 3) return undefined;
  if (parts[1] === "one") return undefined;
  const seg = parts[parts.length - 1];
  const step = FILM_STEPS.find((s) => s.seg === seg);
  if (!step) return undefined;
  // 방식별 단계는 `/film/<id>/<mode>/<seg>` 네 칸, 공유 단계는 `/film/<id>/<seg>` 세 칸이다.
  const want = step.perMode ? 4 : 3;
  return parts.length === want ? step : undefined;
}

// 지금 있어야 할 단계 — **방식마다 따로 센다.** 한 프로젝트에서 두 편을 굽는 것이 이
// 기능이라, order 로 구운 것이 refs 의 진행을 앞당기면 안 된다.
export function currentFilmStepKey(project, mode) {
  const film = filmOf(project, mode);
  if (!project?.scenario?.text) return "scenario";
  if (!film?.images?.length) return "images";
  return "video";
}

// 열림 판정.
//
// ★★ **"열려 있다"와 "지금 있어야 한다"는 다르다.** 2026-07-29 에 단계별에서 이 둘을 섞어
//   완성 단계에 아무도 못 들어가는 잠금 고리를 만들었다(완성이 열리는 조건이 status==="done"
//   인데, status 를 done 으로 만드는 합성은 완성 화면에서만 시작할 수 있었다).
//   완성은 굽기가 끝나면 **열리고**, 지금 단계는 여전히 영상이다.
export function isFilmStepReachable(key, project, mode) {
  const film = filmOf(project, mode);
  if (key === "material" || key === "scenario") return true;
  if (key === "images") return !!project?.scenario?.text;
  if (key === "video") return !!film?.images?.length;
  if (key === "done") return !!film?.video?.url;
  return false;
}
