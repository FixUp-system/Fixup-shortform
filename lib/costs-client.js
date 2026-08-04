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
  // ★ 200 이어도 본문이 JSON 이 아닐 수 있다(프록시가 끼운 HTML 오류 페이지, 반쯤 깨진
  // dev 서버). 여기서 던지면 이 함수의 Promise 가 reject 되고 호출부는 setState 를 못 한다
  // — 화면이 "불러오는 중…"에서 영원히 멈추고 오류 문구조차 못 띄운다.
  let d;
  try {
    d = await res.json();
  } catch {
    return { records: [], err: "원장을 불러오지 못했어요" };
  }
  return { records: d.records || [], err: "" };
}
