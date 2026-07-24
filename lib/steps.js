// 단계별 만들기의 단계 정의 — 사이드바 스테퍼와 라우팅 가드가 같은 표를 본다.
// 구성은 docs/superpowers/specs/2026-07-24-pipeline-roadmap.md 3절 확정 순서를 따른다.

export const STEPS = [
  { key: "material", no: "①", label: "자료", seg: null },
  { key: "script", no: "②", label: "대본", seg: "script" },
  { key: "voice", no: "③", label: "목소리", seg: "voice", soon: true },
  { key: "images", no: "④", label: "이미지", seg: "images" },
  { key: "video", no: "⑤", label: "영상", seg: "video", soon: true },
  { key: "done", no: "⑥", label: "완성", seg: "done", soon: true },
];

export function stepHref(step, projectId) {
  if (!step.seg) return "/create";
  return projectId ? `/create/${projectId}/${step.seg}` : null;
}

// 경로 → 단계. 프로젝트 인덱스(`/create/<id>`)는 단계 미상(undefined)이다.
// seg 없이 STEPS를 찾으면 seg:null인 ①자료가 매칭돼 모든 단계가 열린 것처럼 보이므로 분기한다.
export function stepFromPathname(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean);
  if (parts[0] !== "create") return undefined;
  if (parts.length === 1) return STEPS[0];
  const seg = parts[2];
  return seg ? STEPS.find((s) => s.seg === seg) : undefined;
}

// 프로젝트 상태 → 지금 사장님이 있어야 할 단계
export function currentStepKey(project) {
  if (!project) return "material";
  if (project.status === "cuts") return "images";
  return "script"; // draft(대본 생성 중) · script(대본 확인)
}

// 도달 가능한 단계인가 — 앞선 단계가 끝나야 열린다
export function isReachable(stepKey, project) {
  if (stepKey === "material") return true;
  if (!project) return false;
  const order = STEPS.map((s) => s.key);
  return order.indexOf(stepKey) <= order.indexOf(currentStepKey(project));
}
