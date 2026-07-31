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
  const d = await res.json();
  return { projects: d.projects || [], err: "" };
}
