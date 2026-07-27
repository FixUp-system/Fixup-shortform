// 단계별 만들기의 단계 정의 — 사이드바 스테퍼와 라우팅 가드가 같은 표를 본다.
// 구성은 docs/superpowers/specs/2026-07-24-pipeline-roadmap.md 3절 확정 순서를 따른다.

export const STEPS = [
  { key: "material", no: "①", label: "자료", seg: "briefing" },
  { key: "synopsis", no: "②", label: "구성", seg: "synopsis" },
  { key: "script", no: "③", label: "대본", seg: "script" },
  { key: "voice", no: "④", label: "목소리", seg: "voice", soon: true },
  { key: "images", no: "⑤", label: "이미지", seg: "images" },
  { key: "video", no: "⑥", label: "영상", seg: "video", soon: true },
  { key: "done", no: "⑦", label: "완성", seg: "done", soon: true },
];

export function stepHref(step, projectId) {
  // ①자료는 프로젝트가 생기기 전엔 /create, 생긴 뒤엔 그 프로젝트의 브리핑 화면이다
  if (step.key === "material") return projectId ? `/create/${projectId}/briefing` : "/create";
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

// 프로젝트 상태 → 지금 있어야 할 단계.
// 문턱은 산출물의 유무다 — 브리핑 확정 → 구성 → 대본.
// 컷 단계 판정을 구성 유무보다 앞에 둔다: 구성 도입 전에 만들어져 synopsis가 없지만
// 컷은 이미 있는 프로젝트를, 돈 주고 만든 컷에서 쫓아내지 않기 위해서다.
export function currentStepKey(project) {
  if (!project) return "material";
  if (!project.briefing?.confirmed) return "material";
  if (project.status === "cuts") return "images";
  if (!project.synopsis) return "synopsis";
  return "script";
}

// 지금 대본이 구성보다 낡았는가 — 구성을 다시 만들면 버전이 오른다.
// 이 판정이 "대본 다시 쓰기"(유료 호출) 버튼을 띄우므로 거짓 경고가 나면 안 된다.
// 손편집(PATCH synopsis_scene)은 version을 올리지 않으므로 여기서도 낡음이 아니다.
// 구성 도입 전에 쓰인 대본은 synopsis_version 자체가 없다 — 그것도 "이전 것"이다.
export function isScriptStale(project) {
  const version = project?.synopsis?.version;
  if (!version || !project?.script) return false;
  return project.script.synopsis_version !== version;
}

// 도달 가능한 단계인가 — 앞선 단계가 끝나야 열린다
export function isReachable(stepKey, project) {
  if (stepKey === "material") return true;
  if (!project) return false;
  const order = STEPS.map((s) => s.key);
  return order.indexOf(stepKey) <= order.indexOf(currentStepKey(project));
}
