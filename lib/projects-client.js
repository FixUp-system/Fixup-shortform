// 홈 화면이 브라우저에서 부르는 fetch 판단 — /costs 화면의 loadCostsRecords(lib/costs-client.js)와
// 같은 이유로 순수 함수로 뺐다(이 저장소에는 컴포넌트 렌더 테스트 인프라가 없어서, React 없이
// 이 판단만 vitest 로 바로 물 수 있게 한다).
//
// ★ 최종 리뷰 I4 — 500·403 을 삼키면 안 된다. 그냥 빈 배열로 떨어뜨리면 "아직 만든 영상이
// 없어요"가 뜨고, 사장님 눈에는 프로젝트가 사라진 것으로 보인다.
export async function loadProjects(fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl("/api/projects");
  } catch {
    return { projects: [], err: "목록을 불러오지 못했어요" };
  }
  if (!res.ok) {
    return { projects: [], err: "목록을 불러오지 못했어요" };
  }
  // ★ 200 이어도 본문이 JSON 이 아닐 수 있다(프록시가 끼운 HTML 오류 페이지, 반쯤 깨진
  // dev 서버). 여기서 던지면 이 함수의 Promise 가 reject 되고 호출부는 setState 를 못 한다
  // — 화면이 "불러오는 중…"에서 영원히 멈추고 오류 문구조차 못 띄운다.
  let d;
  try {
    d = await res.json();
  } catch {
    return { projects: [], err: "목록을 불러오지 못했어요" };
  }
  return { projects: d.projects || [], err: "" };
}
