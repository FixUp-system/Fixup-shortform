// 단계별 만들기의 단계 정의 — 사이드바 스테퍼와 라우팅 가드가 같은 표를 본다.
// 구성은 docs/superpowers/specs/2026-07-24-pipeline-roadmap.md 3절 확정 순서를 따른다.

export const STEPS = [
  { key: "material", no: "①", label: "자료", seg: "briefing" },
  { key: "script", no: "②", label: "대본", seg: "script" },
  { key: "voice", no: "③", label: "목소리", seg: "voice", soon: true },
  { key: "images", no: "④", label: "이미지", seg: "images" },
  { key: "video", no: "⑤", label: "영상", seg: "video", soon: true },
  { key: "done", no: "⑥", label: "완성", seg: "done", soon: true },
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
// 문턱은 산출물의 유무다 — 브리핑 확정 → 대본(원고).
// 컷 단계 판정을 대본 유무보다 앞에 둔다: 컷은 이미 있는 프로젝트를 돈 주고 만든 컷에서
// 쫓아내지 않기 위해서다(구성 단계를 없앨 때도 같은 이유로 이 순서를 지킨다).
export function currentStepKey(project) {
  if (!project) return "material";
  if (!project.briefing?.confirmed) return "material";
  if (project.status === "cuts") return "images";
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
