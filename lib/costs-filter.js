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

// 이 원장에 실제로 등장하는 사람들 — **적어 넣을 때 거들어 주는 목록**이다(datalist).
//
// ★★ 2026-08-27 — 고르기(select)에서 **찾기**로 바꿨다(사장님 지시: "사용자는 검색할 수
//   있게"). 사람이 늘면 목록을 눈으로 훑어 내려가는 것이 일이 된다. 이름 몇 글자를 적으면
//   좁혀지는 편이 빠르고, 이메일 조각으로도 찾을 수 있다.
// ★ 그래서 값이 **보이는 말**이다 — 고르는 값(actor)이 아니다. 좁히는 규칙은 아래
//   filterRecords 가 이름·이메일·actor 셋에 부분일치로 건다.
export function actorOptions(records) {
  const seen = new Set();
  for (const r of records || []) {
    const name = r?.actor_name || r?.actor_label || "";
    if (name) seen.add(name);
    // 이메일도 목록에 둔다 — 같은 이름 둘을 이메일로 가른다.
    if (r?.actor_label && r.actor_label !== name) seen.add(r.actor_label);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "ko"));
}

// 좁히기. 빈 값은 **조건 없음**이다 — 빈 문자열을 조건으로 읽으면 아무것도 안 보인다.
export function filterRecords(records, { from = "", to = "", person = "", flow = "" } = {}) {
  const start = dayStart(from);
  const end = dayEnd(to);
  // ★ 사람은 **부분일치**다(대소문자 무시) — 이름 몇 글자·이메일 조각으로 찾는다.
  //   셋을 다 본다: 이름 · 신원(이메일·admin) · 원장에 적힌 actor 값.
  const q = String(person || "").trim().toLowerCase();
  return (records || []).filter((r) => {
    if (q) {
      const hay = `${r?.actor_name || ""} ${r?.actor_label || ""} ${r?.actor || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
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
// ★★ 2026-08-27 — **지금 파는 제품 둘만**이다(사장님 지시: "종류도 광고 영상, 영상 만들기
//   2개만"). 사이드바가 그 둘만 보여 주는 것과 같은 결이다(SIDEBAR_FLOWS) — 옛 흐름
//   (한 번에 굽기·단계별)은 화면에서 내려간 지 오래고, 고를 수 있는 자리에 두면
//   "그것도 지금 쓰는 것"처럼 읽힌다.
// ★ 이름은 사이드바와 **글자 그대로 같다** — 같은 것을 두 화면이 다르게 부르면 안 된다.
// ⚠️ 2026-09-01 — **이름이 어긋나 있었다.** 위 규칙("사이드바와 글자 그대로 같다")은
//   2026-08-27 에 맞는 말이었는데, 그 뒤 **사이드바만** 원클릭 영상 · 단계별 영상으로
//   바뀌었다. 비용 화면은 옛 이름에 남아, 사장님이 아는 두 제품과 원장의 종류가 안
//   이어졌다("광고 영상"·"영상 만들기" 가 무엇인지 화면 어디에도 없다).
//   ★ 순서도 사이드바를 따른다 — 거기서 원클릭이 위다.
//   ★ tests/costs-flow-names.test.js 가 **사이드바 소스를 읽어** 대조한다. 손으로 적으면
//     다음에 사이드바가 바뀔 때 그 판도 같이 낡아 또 못 잡는다.
export const FLOWS = [
  { id: "ad", label: "원클릭 영상" },
  { id: "reel", label: "단계별 영상" },
];

// 표의 종류 칸에 쓰는 이름. **고르는 목록(FLOWS)과 다른 축이다** — 옛 흐름의 지출도
// 원장에는 남아 있고, 그 줄에 "film" 같은 안쪽 말을 그대로 보여 줄 수는 없다.
// ⚠️ `step` 은 **종류가 없던 옛 문서**다. 그 이름이 "단계별" 이었는데 이제 `reel` 이
//   "단계별 영상" 이라 표에서 둘이 헷갈린다 — 옛것임이 이름에 드러나야 한다.
const LEGACY_LABELS = { film: "한 번에 굽기", step: "옛 단계별", etc: "기타" };

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
  return FLOWS.find((f) => f.id === id)?.label || LEGACY_LABELS[id] || id;
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
  // 표 순서(FLOWS)를 따르고, 표에 없는 옛 흐름은 그 뒤에 선다.
  // ★ 옛 흐름의 지출을 **버리지 않는다** — 고르는 목록에서만 뺐지, 쓴 돈은 쓴 돈이다.
  //   버리면 흐름별 합이 위의 누적과 안 맞아 "어디로 샜지"가 된다.
  const order = FLOWS.map((f) => f.id);
  const rank = (id) => (order.indexOf(id) === -1 ? order.length : order.indexOf(id));
  // ★ 옛 흐름끼리는 **이름순**이다 — 값 크기로 두면 날마다 순서가 바뀌어 눈이 헤맨다
  //   (표 순서를 쓰는 이유와 같다). 그 흐름들은 표에 없어 기댈 순서가 없다.
  return [...out.values()].sort(
    (a, b) => rank(a.flow) - rank(b.flow) || a.label.localeCompare(b.label, "ko")
  );
}
