// /costs 화면이 브라우저에서 부르는 fetch 판단 — 순수 함수라 페이지 컴포넌트(JSX)에서
// 뺐다. 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없어서(vitest 가 .js 안의 JSX를
// 못 읽는다), React 없이 이 판단만 vitest 로 바로 물 수 있게 여기 둔다.
//
// ★ 403 을 삼키면 안 된다 — 그냥 빈 배열로 떨어뜨리면 일반 사용자에게 "기록이 없다"·
// "$0.00"으로 보여서 잠금이 걸린 게 아니라 원래 비어 있는 것처럼 읽힌다. /admin 화면과
// 같은 방식으로 응답 상태를 먼저 본다.
// ★★ 2026-08-27 — **좁히는 조건을 서버로 넘긴다.** 그전에는 전부 받아 화면에서 걸렀다.
//   원장이 계속 쌓이는 표라 그 방식은 행이 늘수록 그대로 느려진다. 이제 서버가 걸러
//   300개까지만 주고, 화면은 그것을 100개씩 넘긴다.
// ★ 빈 조건은 안 싣는다 — `?person=` 같은 빈 값을 실으면 주소만 길어진다.
export async function loadCostsRecords(fetchImpl = fetch, params = {}) {
  const q = new URLSearchParams();
  for (const key of ["from", "to", "person", "flow"]) {
    const v = String(params[key] || "").trim();
    if (v) q.set(key, v);
  }
  const url = q.toString() ? `/api/costs?${q}` : "/api/costs";
  let res;
  try {
    res = await fetchImpl(url);
  } catch {
    return { records: [], err: "원장을 불러오지 못했어요", matched: 0, truncated: false };
  }
  if (!res.ok) {
    return {
      records: [],
      err: res.status === 403 ? "운영자만 볼 수 있어요" : "원장을 불러오지 못했어요",
      matched: 0,
      truncated: false,
    };
  }
  // ★ 200 이어도 본문이 JSON 이 아닐 수 있다(프록시가 끼운 HTML 오류 페이지, 반쯤 깨진
  // dev 서버). 여기서 던지면 이 함수의 Promise 가 reject 되고 호출부는 setState 를 못 한다
  // — 화면이 "불러오는 중…"에서 영원히 멈추고 오류 문구조차 못 띄운다.
  let d;
  try {
    d = await res.json();
  } catch {
    return { records: [], err: "원장을 불러오지 못했어요", matched: 0, truncated: false };
  }
  // matched·truncated — "300개까지만 보여 준다"를 화면이 말하려면 얼마나 걸렸는지 알아야 한다.
  return { records: d.records || [], err: "", matched: d.matched ?? (d.records || []).length, truncated: !!d.truncated };
}
