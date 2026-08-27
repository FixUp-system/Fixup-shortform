// 비용 기록 고르기 — **순수 함수다.** 날짜와 사람으로 원장을 좁힌다(2026-08-27 사장님 요청).
//
// ★ 왜 화면이 아니라 여기인가: 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다
//   (lib/costs-client.js 머리말과 같은 사정). 판정을 순수 모듈로 빼야 경계값(그 날 23:59:59
//   가 들어오는가)을 vitest 로 바로 물 수 있다.
// ★ import 문을 두지 마라 — 화면("use client")이 읽는다.

// "YYYY-MM-DD" → 그 날 00:00:00.000 (브라우저의 지역 시각).
//
// ★ `new Date("2026-08-27")` 을 쓰지 않는다 — 그것은 **UTC 자정**으로 읽혀서, 한국(UTC+9)
//   에서는 그 날 오전 9시가 된다. 그러면 오전에 쓴 기록이 "그 날"에서 통째로 빠진다.
//   숫자로 갈라 지역 시각으로 만든다.
function dayStart(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
}

// 끝 날짜는 **그 날을 포함한다.** 사람이 "8/27 까지"라고 적으면 8/27 에 쓴 것도 보고 싶다 —
// 자정으로 자르면 그 하루가 통째로 사라진다.
function dayEnd(ymd) {
  const start = dayStart(ymd);
  return start === null ? null : start + 24 * 60 * 60 * 1000 - 1;
}

// 이 원장에 실제로 등장하는 사람들. 고를 수 없는 이름을 목록에 두지 않는다.
//
// ★ 값(value)은 **actor** 다 — 이름·이메일이 아니다. 같은 이름을 쓰는 계정이 둘일 수 있고,
//   문자열 actor("admin"·"local")도 섞여 있다. 화면에 보이는 말과 고르는 값은 다른 축이다.
export function actorOptions(records) {
  const seen = new Map();
  for (const r of records || []) {
    const key = r?.actor || "";
    if (!key || seen.has(key)) continue;
    // 이름을 먼저 보여 주고 이메일을 곁들인다 — 같은 이름 둘을 사람이 가를 수 있어야 한다.
    const name = r.actor_name || r.actor_label || "(알 수 없음)";
    const email = r.actor_label && r.actor_label !== name ? r.actor_label : "";
    seen.set(key, { value: key, label: email ? `${name} (${email})` : name });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

// 좁히기. 빈 값은 **조건 없음**이다 — 빈 문자열을 조건으로 읽으면 아무것도 안 보인다.
export function filterRecords(records, { from = "", to = "", actor = "", flow = "" } = {}) {
  const start = dayStart(from);
  const end = dayEnd(to);
  return (records || []).filter((r) => {
    if (actor && r.actor !== actor) return false;
    if (flow && flowOf(r) !== flow) return false;
    const ts = Number(r?.ts);
    // 시각을 모르는 행은 날짜로 거르지 않는다 — 날짜를 안 골랐을 때와 같이 남긴다.
    if (!Number.isFinite(ts)) return start === null && end === null;
    if (start !== null && ts < start) return false;
    if (end !== null && ts > end) return false;
    return true;
  });
}

// 고른 것들의 합. 화면 타일이 이 값을 쓴다 — 화면에서 다시 더하면 표와 합계가 갈린다.
export function sumCost(records) {
  return (records || []).reduce((s, r) => s + (Number(r?.est_cost_usd) || 0), 0);
}

// ── 흐름 구분 ────────────────────────────────────────────────────────────
//
// **광고와 영상 만들기는 다른 제품이다** — 한 페이지에서 보되 값은 갈라 봐야 한다
// (2026-08-27 사장님 요청). 판정은 프로젝트 문서의 `kind` 하나다(lib/costs.js 의
// listRecords 가 원장 줄에 실어 준다).
//
// ★ 이름은 **사장님이 쓰는 말**이다 — 사이드바에 뜨는 그 이름과 같아야 한다
//   (components/Sidebar.jsx 의 SIDEBAR_FLOWS: 영상 만들기 · 광고).
// ★ 모르는 종류가 와도 죽지 않는다 — 그대로 보여 준다. 새 흐름이 늘었는데 이 표만
//   낡았을 때, 그 지출이 "기타"에 섞여 안 보이는 것이 더 나쁘다.
export const FLOWS = [
  { id: "reel", label: "영상 만들기" },
  { id: "ad", label: "광고" },
  { id: "film", label: "한 번에 굽기" },
  { id: "step", label: "단계별" },
  { id: "etc", label: "기타" },
];

// 원장 한 줄 → 흐름 id.
//
// ★ `kind` 가 없는 것은 두 가지다: **단계별 흐름**(그 문서에는 kind 가 원래 없다)과
//   **프로젝트가 아예 없는 줄**(대화 등) · **지워진 프로젝트**. 앞은 "단계별", 뒤는
//   "기타"다 — 둘을 뭉치면 단계별 지출이 기타에 섞여 안 보인다.
//   가르는 값은 listRecords 가 실어 주는 known_project 다.
export function flowOf(record) {
  const kind = record?.kind;
  if (kind) return kind;
  if (record?.project_id && record?.known_project) return "step";
  return "etc";
}

export function flowLabel(id) {
  return FLOWS.find((f) => f.id === id)?.label || id;
}

// 흐름별 합계 — 화면 타일이 이것을 쓴다. **0 인 흐름은 안 담는다**(안 쓴 제품의 빈 칸을
// 늘어놓으면 무엇을 봐야 하는지가 흐려진다).
export function sumByFlow(records) {
  const out = new Map();
  for (const r of records || []) {
    const id = flowOf(r);
    const cur = out.get(id) || { flow: id, label: flowLabel(id), usd: 0, count: 0 };
    cur.usd += Number(r?.est_cost_usd) || 0;
    cur.count += 1;
    out.set(id, cur);
  }
  // 표 순서(FLOWS)를 따른다 — 값 크기로 정렬하면 하루하루 순서가 바뀌어 눈이 헤맨다.
  const order = FLOWS.map((f) => f.id);
  return [...out.values()].sort((a, b) => order.indexOf(a.flow) - order.indexOf(b.flow));
}
