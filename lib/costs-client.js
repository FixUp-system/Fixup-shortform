// /costs 화면이 브라우저에서 부르는 fetch 판단 — 순수 함수라 페이지 컴포넌트(JSX)에서
// 뺐다. 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없어서(vitest 가 .js 안의 JSX를
// 못 읽는다), React 없이 이 판단만 vitest 로 바로 물 수 있게 여기 둔다.
//
// ★ 403 을 삼키면 안 된다 — 그냥 빈 배열로 떨어뜨리면 일반 사용자에게 "기록이 없다"·
// "$0.00"으로 보여서 잠금이 걸린 게 아니라 원래 비어 있는 것처럼 읽힌다. /admin 화면과
// 같은 방식으로 응답 상태를 먼저 본다.
export async function loadCostsRecords(fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl("/api/costs");
  } catch {
    return { records: [], err: "원장을 불러오지 못했어요" };
  }
  if (!res.ok) {
    return {
      records: [],
      err: res.status === 403 ? "운영자만 볼 수 있어요" : "원장을 불러오지 못했어요",
    };
  }
  const d = await res.json();
  return { records: d.records || [], err: "" };
}
