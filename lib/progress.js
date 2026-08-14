// 생성 진척 — "이 컷은 이 단계에서 끝났는가"와 "생성이 지금 어떤 상태인가"를 판정하는
// **순수** 모듈. 뒤엣것은 다섯 갈래다 — "안 눌렀다 / 되고 있다 / 멈춘 것 같다 /
// 실패했다 / 끝났다".
//
// 서버(lib/pipeline.js 의 심장박동)와 화면이 **같은 자를 써야 한다.** 같은 조회식을 화면에
// 한 번 더 손으로 적으면 그 사본이 조용히 어긋나고, 어긋난 쪽만 "안 끝났다"로 세어
// 멀쩡히 끝난 생성이 멈춘 것처럼 보인다. 그래서 한 벌만 둔다.
//
// 화면이 직접 재지 않는 이유 둘:
//  ① 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다(lib/projects-client.js:2 주석).
//     판정을 순수 모듈로 빼야 경계(119초/120초)를 vitest 로 직접 잴 수 있다.
//  ② 같은 판정을 화면 다섯이 쓴다. 흩으면 조금씩 갈린다 — ④이미지가 images_error 를
//     영영 못 보던 버그가 그렇게 났다.
//
// ★ 여기는 화면이 import 한다 — fs·next/server·env 를 절대 끌어오지 말 것.
//   순수 함수만 있어야 클라이언트 번들에 들어가도 안전하다.
//   import 는 lib/failure.js 하나뿐이고 그것도 import 0 개다.
import { classifyFailure } from "./failure.js";

// 단계별 "끝남" 판정.
//
// ★ 세 단계 모두 **성공과 종착 실패를 함께** 센다. 끝난 것은 끝난 것으로 세어야
//   진척이 total 까지 차오른다. 실패를 안 세면 실패한 컷 하나 때문에 문서가
//   done: N-1 에 영원히 멈춰, 정상 종료한 생성이 계속 "멈춤"으로 읽힌다
//   (그리고 스스로 낫지 않는다 — 그 컷은 다시 저장되지 않기 때문이다).
//   images 의 종착 실패는 오류 필드가 아니라 state 다(processCut 의 catch 는
//   image 없이 state: "needs_attention" 만 남긴다).
// ★ 무음 컷은 낭독에서 **처음부터 끝난 것**이다(2026-08-14 병합에서 찾았다).
//   runVoicePipeline 의 TTS 루프가 무음 컷을 건너뛰므로(lib/pipeline.js) 그 컷에는
//   audio 도 voice_error 도 영영 안 생긴다. 그것을 "안 끝났다"로 세면 done 이 total 에
//   절대 못 닿아, **정상으로 끝난 낭독이 2분 뒤 전부 "멈춤"으로 뜬다.**
//   판정식은 저 루프의 건너뛰기 조건(silent ‖ 빈 문장)과 같은 것을 봐야 한다.
//
// ★ 다만 `sentence` 가 **아예 없는** 컷은 무음이 아니라 **아직 모르는** 컷이다.
//   `!c.sentence` 로 뭉치면 `{}` 까지 "끝났다"가 되어, 반대 방향으로 같은 버그가 난다 —
//   안 읽은 컷을 끝났다고 세는 쪽이다. 실제로 나오는 컷은 무음이든 아니든 늘 sentence 를
//   쥔다(lib/validate.js 가 무음에 "" 를 넣고, 말하는 컷은 빈 문장이면 통째로 거절한다).
//   그래서 **키가 있고 그 값이 비었을 때만** 무음으로 읽는다.
const isSilentCut = (c) =>
  c.silent === true || (typeof c.sentence === "string" && !c.sentence.trim());

const PHASE_DONE = {
  images: (c) => !!(c.image || c.source === "photo" || c.state === "needs_attention"),
  voice: (c) => !!(c.audio || c.voice_error || isSilentCut(c)),
  video: (c) => !!(c.video || c.video_error),
};

// 모르는 단계는 던지지 않고 false 다 — 판정 못 하는 것이지 "안 끝난 것"은 아니지만,
// 세는 쪽에서 0 으로 떨어져 "판정 불가"로 읽히는 편이 안전하다.
export function isCutDone(cut, phase) {
  const isDone = PHASE_DONE[phase];
  return isDone ? !!isDone(cut || {}) : false;
}

// 진척이 이만큼 멈춰 있으면 "멈춘 것 같다"고 말한다.
// 클립 하나가 30초쯤 걸리므로 2분이면 정상 진행으로 설명되지 않는다.
export const STALL_MS = 120_000;

// ★ 합성은 뺀다. 단일 ffmpeg 작업이라 중간 진척이 없고 정상적으로 최대 10분까지 걸린다 —
//   임계를 적용하면 잘 돌고 있는 합성이 전부 "멈춤"으로 보인다.
export const STALL_EXEMPT_PHASES = ["render"];

// 마지막 진척 이후 흐른 밀리초. 판정할 근거가 없으면 null 이다.
//
// ★ 이 계산은 **서버에서** 돌아야 한다(상태 라우트가 부른다). 브라우저가 자기 시계로
//   빼면 사장님 PC 가 3분 빠를 때 시작하자마자 "멈췄어요"가 뜬다.
export function stalledFor(status, now) {
  const at = status?.progress?.at;
  if (typeof at !== "number") return null;
  return Math.max(0, now - at);
}

// 순서가 곧 규칙이다 — 위엣것이 더 큰 사실이다.
export function generationState({
  done = 0,
  total = 0,
  error = null,
  phase = null,      // 문서에 남은 심장박동의 단계
  stepPhase = null,  // 지금 보고 있는 화면의 단계
  stalledForMs = null,
  busy = false,      // 방금 시작 버튼을 눌렀는가(아직 컷이 pending 이라 진척으로는 안 보인다)
} = {}) {
  // ① 실패는 무엇보다 먼저다. 실패한 채로 "도는 중"이라 말하면 사장님이 계속 기다린다.
  if (error) {
    // 벗기는 일은 classifyFailure 가 이미 한다(문자열이든 {message} 든). 여기서 한 번 더
    // 벗기면 그 사본이 갈린다 — 실제로 `?? `는 빈 문자열 message 를 통과시켜 규칙이 어긋난다.
    return { kind: "failed", done, total, reason: classifyFailure(error) };
  }
  // ② 만들 대상이 없다.
  // ★ `=== 0` 이 아니라 `<= 0` 이다. 기본값은 undefined 에만 걸리므로 total: null 이 여기를
  //   빠져나가면 `0 >= null` 이 참이 되어 "완료 0/null" 이 화면에 뜬다.
  if (!(total > 0)) return { kind: "idle", done, total, reason: null };
  // ③ 다 끝났다. 진척이 멈춘 지 오래여도 여기가 먼저다 — 끝나서 멈춘 것이다.
  if (done >= total) return { kind: "done", done, total, reason: null };

  // 이 심장박동이 지금 화면의 것인가. 아니면 앞 단계가 남긴 것이라 판정에 못 쓴다.
  const mine = stepPhase !== null && phase === stepPhase;

  // ④ 아직 안 눌렀다 — 누르지 않았는데 스피너가 돌면 자동으로 되는 줄 알고 기다린다
  //    (④이미지 화면 placeholder 주석에 같은 사고가 적혀 있다).
  if (!busy && (!mine || stalledForMs === null)) {
    return { kind: "idle", done, total, reason: null };
  }
  // ⑤ 멈춤 의심 — 내 단계의 심장박동이 임계만큼 멎었을 때만.
  if (
    mine &&
    stalledForMs !== null &&
    stalledForMs >= STALL_MS &&
    !STALL_EXEMPT_PHASES.includes(phase)
  ) {
    return { kind: "stalled", done, total, reason: null };
  }
  // ⑥ 그 밖은 도는 중
  return { kind: "running", done, total, reason: null };
}
