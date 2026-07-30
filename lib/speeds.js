// 컷의 속도 — 화면(클라이언트)과 화면 설계·클립 요청(서버)이 함께 본다.
//
// import 가 없다(lib/aspects.js·styles.js·voices.js·clip-limits.js 와 같은 이유).
//
// 왜 닫힌 목록인가: motion 이 자유 서술 한 줄이던 동안 **전 컷이 "천천히"로 수렴했다.**
// 실측(2026-07-30, 농구화 광고): "카메라가 천천히 위로 틸트한다 / 천천히 신발을 따라 회전한다 /
// 천천히 뒤로 물러난다" — 7컷 중 3컷이 느림이고 나머지도 대비가 없었다. 광고는 빠른 컷이 있어야
// 느린 컷이 산다. 자유 서술로는 "대비가 있는가"를 코드가 판정할 수 없다.
//
// 속도는 motion 을 대신하지 않는다 — motion 은 "무엇이 어떻게 움직이나"이고 speed 는 "얼마나
// 빠르게"다. 이 저장소는 "카메라가 움직이거나 피사체가 움직이거나, 둘 다 넣지 않는다"를 이미
// 쥐고 있으므로 motion 을 camera/subject 로 쪼개지 않는다.
export const SPEEDS = [
  { id: "static", label: "정지", note: "거의 움직이지 않는다", clip: "almost still, only the faintest drift" },
  { id: "slow", label: "느리게", note: "천천히", clip: "slow, deliberate motion" },
  { id: "realtime", label: "실시간", note: "실제 속도", clip: "real-time speed, natural pacing" },
  { id: "fast", label: "빠르게", note: "폭발적으로", clip: "fast, explosive motion" },
  { id: "extreme_slowmo", label: "극단적 슬로모션", note: "절정에만", clip: "extreme slow motion, time nearly frozen" },
];

// 속도를 안 받았을 때 떨어질 자리. 지금까지의 동작이 "천천히"였다.
export const DEFAULT_SPEED_ID = "slow";

// 느린 쪽 — 대비를 셀 때 "이것만 있으면 대비가 없다"의 기준이다.
export const SLOW_SPEEDS = ["static", "slow"];

export function isSpeed(id) {
  return SPEEDS.some((s) => s.id === id);
}

export function speedFor(id) {
  return SPEEDS.find((s) => s.id === id) || SPEEDS.find((s) => s.id === DEFAULT_SPEED_ID);
}

// 컷들이 속도 대비를 갖췄는가.
//
// 판정을 둘로 나눈 이유: "고유값이 둘 이상"만 보면 slow·static 둘로도 통과한다. 그 둘은 눈에는
// 같은 속도라 대비가 아니다. 그래서 **느리지 않은 컷이 하나라도 있는지**를 함께 본다.
//
// 컷이 둘 미만이면 판정하지 않는다 — 한 컷짜리 영상에 대비를 요구할 수 없다.
export function speedContrast(cuts) {
  const list = (Array.isArray(cuts) ? cuts : []).map((c) => (isSpeed(c?.speed) ? c.speed : null)).filter(Boolean);
  if (list.length < 2) return { ok: true, reason: null };
  const kinds = new Set(list);
  if (kinds.size < 2) {
    return { ok: false, reason: `전 컷이 "${speedFor(list[0]).label}" 하나뿐이다 — 속도가 다른 컷을 섞는다` };
  }
  if (list.every((s) => SLOW_SPEEDS.includes(s))) {
    return { ok: false, reason: "느린 컷만 있다 — 빠른 컷이 있어야 느린 컷이 산다" };
  }
  // 절정을 살리는 규칙: 극단적 슬로모션은 그 앞이 빨라야 대비가 생긴다.
  // 첫 컷이 극단적 슬로모션인 경우는 앞이 없으므로 보지 않는다.
  for (let i = 1; i < list.length; i++) {
    if (list[i] === "extreme_slowmo" && SLOW_SPEEDS.includes(list[i - 1])) {
      return { ok: false, reason: `${i + 1}번 컷이 극단적 슬로모션인데 그 앞 컷도 느리다 — 앞을 빠르게 해야 절정이 산다` };
    }
  }
  return { ok: true, reason: null };
}
