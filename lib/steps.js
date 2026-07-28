// 단계별 만들기의 단계 정의 — 사이드바 스테퍼와 라우팅 가드가 같은 표를 본다.
// 구성은 docs/superpowers/specs/2026-07-24-pipeline-roadmap.md 3절 확정 순서를 따른다.

// 목소리가 이미지 앞인 이유: 낭독 길이가 컷 구조를 판정한다.
// TTS 실측이 cut.seconds 를 덮고, 그 값이 i2v 상한(10초)을 넘으면 클립이 잘린다 —
// 이미지 값을 치르기 전에 알아야 쪼갤 기회가 있다. 이미지는 컷당 후보 2장이라 가장 비싸다.
// 컷 분할은 대본 승인이 부른다(OpenAI만 쓰므로 fal 비용이 없다).
export const STEPS = [
  { key: "material", no: "①", label: "자료", seg: "briefing" },
  { key: "script", no: "②", label: "대본", seg: "script" },
  { key: "voice", no: "③", label: "목소리", seg: "voice" },
  { key: "images", no: "④", label: "이미지", seg: "images" },
  { key: "video", no: "⑤", label: "영상", seg: "video" },
  { key: "done", no: "⑥", label: "완성", seg: "done" },
];

export function stepHref(step, projectId) {
  // ①자료는 프로젝트가 생기기 전엔 /create, 생긴 뒤엔 그 프로젝트의 브리핑 화면이다
  if (step.key === "material") return projectId ? `/create/${projectId}/briefing` : "/create";
  return projectId ? `/create/${projectId}/${step.seg}` : null;
}

// 경로 → 단계. 프로젝트 인덱스(`/create/<id>`)는 단계 미상(undefined)이다.
// ①자료의 seg가 비어 있던 시절에는 seg 없이 STEPS를 찾으면 ①자료가 매칭돼 가드가 통째로
// 무력화됐다. 지금 ①자료의 seg는 "briefing"이라 그 매칭은 더는 일어나지 않지만,
// seg 없는 경로가 어떤 단계로도 읽히지 않는다는 것은 명시해 둔다(그 자리를 다시 열지 않게).
export function stepFromPathname(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean);
  if (parts[0] !== "create") return undefined;
  if (parts.length === 1) return STEPS[0];
  const seg = parts[2];
  return seg ? STEPS.find((s) => s.seg === seg) : undefined;
}

// 프로젝트 상태 → 지금 있어야 할 단계.
// status 는 "마지막으로 끝난 산출물", 이 함수가 돌려주는 것은 "다음에 열릴 화면"이다.
// 이 구분이 흐려지면 완성본을 두고 앞 화면으로 되돌아가는 결함이 재발한다.
//
// images 가 video 를 가리키는 것과 달리 video 는 자기 자신을 가리킨다 —
// 완성은 사장님이 버튼을 눌러야 시작되므로, 클립이 끝나도 열려 있어야 할 화면은 ⑤영상이다.
export function currentStepKey(project) {
  if (!project) return "material";
  if (!project.briefing?.confirmed) return "material";
  // 뒤 단계부터 확인한다 — 앞선 조건에 먼저 걸리면 앞서간 프로젝트를 끌어내린다
  if (project.status === "done") return "done";
  if (project.status === "video") return "video";
  if (project.status === "images") return "video";
  if (project.status === "voice") return "images";
  if (project.status === "cuts") return "voice";
  return "script";
}

// 지금 컷이 원고보다 낡았는가 — 원고를 다시 쓰면 버전이 오른다.
// 방향이 뒤집혔다: 예전에는 대본이 구성에 대해 낡았고, 이제는 컷이 원고에 대해 낡는다.
// 이 판정이 "컷 다시 만들기"(유료 호출) 버튼을 띄우므로 거짓 경고가 나면 안 된다.
// 원고 도입 전에 만들어진 컷은 script_version 자체가 없다 — 그것도 "이전 것"이다.
export function areCutsStale(project) {
  const version = project?.script?.version;
  if (!version || !(project?.cuts || []).length) return false;
  return project.cuts_script_version !== version;
}

// 도달 가능한 단계인가 — 앞선 단계가 끝나야 열린다
export function isReachable(stepKey, project) {
  if (stepKey === "material") return true;
  if (!project) return false;
  const order = STEPS.map((s) => s.key);
  return order.indexOf(stepKey) <= order.indexOf(currentStepKey(project));
}
