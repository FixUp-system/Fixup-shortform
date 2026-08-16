// 시나리오가 지켜야 할 규칙 — 화면·라우트·생성이 **같은 함수**를 본다.
//
// ★ 왜 순수 모듈인가: 사장님이 초를 고치는 화면이 "지금 합이 맞는가"를 즉시 보여줘야 하고,
//   라우트가 저장 전에 같은 판정을 해야 한다. 두 벌이면 화면은 통과라는데 저장이 막힌다.
//   그래서 import 를 lib/clip-limits.js(순수)·lib/cuts.js(사슬에 fs 없음)로만 제한한다.
//
// ★ problems 는 한 벌이다 — 사장님이 화면에서 읽는 문장이자, 모델이 재시도 지시로 받는
//   사유다. 두 벌로 두면 화면에는 친절하고 모델에는 쓸모없는 문장이 갈린다.
import { clipProfileForProject, minSecondsFor } from "./clip-limits.js";
// ★ 화자가 화면 밖인가는 isNarrationSpeaker 한 자리가 정한다(lib/cuts.js). 여기서 다시
//   재면 화면이 요구하는 조건과 컷이 실제로 받는 표시가 갈린다.
import { CONTENT_MAX_SECONDS, isNarrationSpeaker } from "./cuts.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const text = (v) => (typeof v === "string" ? v.trim() : "");

export function scenarioSeconds(scenario) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  return shots.reduce((a, s) => a + num(s?.seconds), 0);
}

// 이 시나리오에 화면 밖 목소리가 있는가 — 규칙과 화면이 **같은 것**을 본다.
// (화면이 손으로 다시 재면 "칸은 안 보이는데 확정이 막히는" 자리가 생긴다.)
export function hasNarration(scenario) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  return shots.some((s) => text(s?.line) && isNarrationSpeaker(s?.speaker));
}

export function checkScenario(scenario, project) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  const problems = [];

  if (!shots.length) {
    return { ok: false, problems: ["장면이 하나도 없어요 — 최소 한 장면이 필요해요."] };
  }

  const profile = clipProfileForProject(project);
  const min = minSecondsFor(profile);
  const target = num(project?.settings?.target_seconds);

  // 합 — 어긋나면 합성에서 길이가 안 맞는다
  const total = scenarioSeconds(scenario);
  if (target && total !== target) {
    problems.push(`장면 초의 합이 ${total}초예요 — ${target}초에 맞춰 주세요.`);
  }

  // 컷 개수 — 하한이 천장이다. 15초를 4초짜리로 나누면 3개가 최대다.
  if (target) {
    const maxCuts = Math.max(1, Math.floor(target / min));
    if (shots.length > maxCuts) {
      problems.push(`장면이 ${shots.length}개인데 ${target}초에는 ${maxCuts}개까지만 담을 수 있어요.`);
    }
  }

  shots.forEach((s, i) => {
    const at = `${i + 1}번 장면`;
    const secs = num(s?.seconds);
    if (secs > CONTENT_MAX_SECONDS) {
      problems.push(`${at}이 ${secs}초예요 — 그림 한 장은 ${CONTENT_MAX_SECONDS}초까지만 화면에 둘 수 있어요.`);
    }
    if (secs < min) {
      problems.push(`${at}이 ${secs}초예요 — 이 모델은 ${min}초보다 짧은 장면을 만들지 못해요.`);
    }
    // 대사가 있으면 누가 말하는지가 있어야 한다. 없으면 그 대사가 소리로 안 나온다.
    if (text(s?.line) && !text(s?.speaker)) {
      problems.push(`${at}에 대사가 있는데 말하는 사람이 없어요.`);
    }
  });

  // 내레이터 목소리 — 화면 밖 목소리가 있는데 비어 있으면 잡는다.
  //
  // ★ 왜 규칙인가: 컷마다 fal 을 **따로** 부르고, 그 호출에 목소리 설명이 없으면 모델이
  //   컷마다 알아서 고른다 — 이어 붙이면 내레이터가 중간에 다른 사람이 된다. 화면 속
  //   인물은 cast[].voice 가 그 자리를 맡는데(캐스팅이 한 번 정해 전 컷에 실린다) 내레이터에는
  //   그 자리가 없다. 그래서 시나리오가 제안하고 사장님이 고치는 값 하나를 여기서 요구한다.
  // ★ 내레이션이 없으면 요구하지 않는다 — 안 쓰는 값 때문에 확정이 막히면 안 된다.
  if (hasNarration(scenario) && !text(scenario?.narrator_voice)) {
    problems.push("화면 밖 목소리(내레이션)가 있는데 내레이터 목소리가 비어 있어요 — 컷마다 목소리가 달라져요.");
  }

  return { ok: problems.length === 0, problems };
}
