// GET /api/costs — 비용 기록 목록.
// 전사 원장이다 — 일반 사용자가 남의 지출과 프롬프트를 볼 이유가 없다.
//
// ★★ 2026-08-27 — **한 번에 다 안 준다**(사장님 지시: "300개만 불러오고 그 이외는 필터를
//   통해서 검색하는걸로"). 원장은 계속 쌓이는 표라, 화면 한 장을 그리려고 전부 실어
//   보내면 행이 늘수록 그대로 느려진다. 세 단으로 줄인다:
//     ① **기간으로 자른 창**만 SQL 로 읽는다(store.listCosts)
//     ② 사람·종류로 좁힌다 — 이 둘은 프로필·프로젝트를 물어야 해서 SQL 한 번으로 안 끝난다
//     ③ **300개까지만** 실어 보낸다. 넘으면 그 사실을 함께 말한다(truncated)
//
// ★ 좁히는 규칙은 **화면과 같은 순수 모듈 하나**다(lib/costs-filter.js) — 서버가 따로
//   적으면 화면이 보여 주는 것과 서버가 고른 것이 갈린다.
import { withUser } from "../../../lib/auth/require-user.js";
import { listRecords } from "../../../lib/costs";
import { filterRecords } from "../../../lib/costs-filter.js";

// 화면에 실어 보내는 상한. 100개씩 세 쪽이다.
export const COSTS_PAGE_MAX = 300;

// "YYYY-MM-DD" → 그 날의 처음/끝(지역 시각). 판정은 lib/costs-filter.js 가 다시 하므로
// 여기서는 **SQL 창을 넉넉히** 잡는 용도다 — 하루 어긋나도 뒤에서 정확히 걸린다.
function dayBound(ymd, end) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  return d.getTime();
}

export const GET = withUser(async (req) => {
  const q = new URL(req.url, "http://localhost").searchParams;
  const from = q.get("from") || "";
  const to = q.get("to") || "";
  const person = q.get("person") || "";
  const flow = q.get("flow") || "";

  const all = await listRecords({ from: dayBound(from, false), to: dayBound(to, true) });
  const matched = filterRecords(all, { from, to, person, flow });

  return Response.json({
    records: matched.slice(0, COSTS_PAGE_MAX),
    // 몇 건이 걸렸는지 그대로 말한다 — 화면이 "300개까지만 보여 준다"를 말하려면
    // 잘렸다는 사실과 함께 **얼마나** 잘렸는지를 알아야 한다.
    matched: matched.length,
    truncated: matched.length > COSTS_PAGE_MAX,
  });
}, { adminOnly: true });
