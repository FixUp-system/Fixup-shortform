// 화풍 각인에 쓴다. styles.js 도 import 가 없는 순수 데이터라 화면이 이 파일을 읽어도
// 번들에 fs 가 섞이지 않는다 — 이 모듈이 지켜야 하는 성질이다.
import { styleKey } from "./styles.js";

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

// 도달 가능한 단계인가 — 앞선 단계가 끝나야 열린다.
//
// "열려 있다"와 "지금 있어야 한다"는 다르다. ⑥완성은 사장님이 버튼을 눌러야 시작되므로
// 클립이 끝난 뒤에도 현재 단계는 ⑤영상이다(currentStepKey 참고). 그렇다고 ⑥을 닫으면
// 잠금 고리가 된다 — status 가 done 이어야 열리는데, status 는 합성이 끝나야 done 이 되고,
// 합성은 ⑥에서만 시작할 수 있다. 그래서 완성은 현재 단계가 아니라 클립 유무로 판정한다.
export function isReachable(stepKey, project) {
  if (stepKey === "material") return true;
  if (!project) return false;
  if (stepKey === "done") return project.status === "video" || project.status === "done";
  const order = STEPS.map((s) => s.key);
  return order.indexOf(stepKey) <= order.indexOf(currentStepKey(project));
}

// ── 낡음 판정 ───────────────────────────────────────────────────────────
// 산출물마다 "무엇에서 나왔는지"를 of 로 각인해 두고, 지금 값과 비교한다.
//
// 버전 번호를 쓰지 않는 이유: 번호를 올려주는 자리를 사람이 기억해야 하고, 컷을 건드리는
// 곳이 이미 넷이다(PATCH·regenCut·runSplitPipeline·초점 변경). 한 군데만 빠뜨리면
// 낡았는데 안 낡았다고 나온다 — 위의 cuts_script_version 이 render 를 빠뜨린 것이 그 예다.
// 각인은 지금 값에서 파생되므로 빠뜨릴 자리가 없다.
//
// ⚠️ areCutsStale 과 판단이 갈리는 곳이 하나 있다: 각인이 없는 옛 산출물을 여기서는
// "낡지 않음"으로 본다. 컷 재분할은 OpenAI 만 써서 공짜지만 소리·클립은 유료이고,
// 거짓 경고는 유료 호출 버튼을 띄운다. 둘을 실수로 맞추지 말 것.
//
// 연쇄를 만들지 않는다("그림이 낡았으니 클립도 낡았다"를 코드로 잇지 않는다).
// 그림이 낡으면 ④에서 막히므로 ⑤로 갈 수 없고, 그림을 실제로 다시 만들면 주소가 바뀌어
// 클립은 그때 자동으로 낡는다. 규칙을 더 두면 규칙끼리 어긋날 자리가 생긴다.

export function clipKey(cut) {
  return `${cut?.image?.url || ""}|${cut?.seconds ?? ""}|${cut?.motion || ""}`;
}

// 자막이 문장에서 나오므로 sentence 도 넣는다(lib/subtitles.js).
export function renderKey(project) {
  return (project?.cuts || [])
    .map((c) => `${c.audio?.url || ""}|${c.video?.url || ""}|${c.sentence || ""}`)
    .join("\n");
}

export function isAudioStale(cut) {
  const of = cut?.audio?.of;
  if (of === undefined) return false;
  return of !== (cut.sentence || "");
}

// 그림의 근거는 둘이다: 화면 설명(컷 안)과 화풍(프로젝트 settings).
//
// 각인을 두 필드로 가른 이유: of 에 화풍을 합성하면 화풍을 도입하기 전에 만든 그림의
// 각인이 전부 불일치가 되어 "각인 없는 옛 산출물은 낡지 않았다"는 계약이 깨진다.
// 필드를 갈라야 옛 프로젝트가 조용히 실사로 남는다.
//
// project 는 선택 인자다. 안 주면 화풍 판정을 건너뛴다 — cuts.filter(isImageStale) 처럼
// 함수를 그대로 넘기면 배열 번호가 이 자리에 들어오는데, 그때 낡음을 **더** 알리면
// 거짓 경고가 뜨고 그 버튼은 유료 호출이다. 덜 알리는 쪽이 안전하다.
// (호출부가 project 를 넘기는지는 tests/staleness-ui.test.js 가 소스에서 판정한다.)
export function isImageStale(cut, project) {
  const of = cut?.image?.of;
  if (of !== undefined && of !== (cut.shows || "")) return true;
  const styleOf = cut?.image?.style_of;
  if (styleOf === undefined) return false;
  if (!project || typeof project !== "object") return false;
  return styleOf !== styleKey(project);
}

export function isClipStale(cut) {
  const of = cut?.video?.of;
  if (of === undefined) return false;
  return of !== clipKey(cut);
}

export function isRenderStale(project) {
  const of = project?.render?.of;
  if (of === undefined) return false;
  return of !== renderKey(project);
}
