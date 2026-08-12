// 화풍 각인에 쓴다. styles.js 도 import 가 없는 순수 데이터라 화면이 이 파일을 읽어도
// 번들에 fs 가 섞이지 않는다 — 이 모듈이 지켜야 하는 성질이다.
import { styleKey } from "./styles.js";
// 자막 위치 상수. subtitles.js 는 import 가 clauses.js(leaf, import 없음) 하나뿐이라
// 이 파일의 "화면이 읽어도 안전하다"는 성질이 유지된다.
import { DEFAULT_SUBTITLE_POSITION, SUBTITLE_POSITIONS } from "./subtitles.js";
// 말하는 컷의 각인. 클립 프롬프트와 **같은 판정**을 써야 해서 그 파일에서 가져온다 —
// cuts.js 도 import 사슬(script·clip-limits·styles·speeds·clauses)에 fs·env 가 없다.
import { spokenOf } from "./cuts.js";

// 단계별 만들기의 단계 정의 — 사이드바 스테퍼와 라우팅 가드가 같은 표를 본다.
// 구성은 docs/superpowers/specs/2026-07-24-pipeline-roadmap.md 3절 확정 순서를 따른다.

// 목소리가 이미지 앞인 이유: 낭독 길이가 컷 구조를 판정한다.
// TTS 실측이 cut.seconds 를 덮고, 그 값이 i2v 상한(10초)을 넘으면 클립이 잘린다 —
// 이미지 값을 치르기 전에 알아야 쪼갤 기회가 있다. 이미지는 컷당 후보 2장이라 가장 비싸다.
// 컷 분할은 대본 승인이 부른다(OpenAI만 쓰므로 fal 비용이 없다).
export const STEPS = [
  { key: "material", no: "1", label: "자료", seg: "briefing" },
  { key: "script", no: "2", label: "대본", seg: "script" },
  { key: "voice", no: "3", label: "목소리", seg: "voice" },
  { key: "images", no: "4", label: "이미지", seg: "images" },
  { key: "video", no: "5", label: "영상", seg: "video" },
  { key: "done", no: "6", label: "완성", seg: "done" },
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

// project 는 선택 인자다(isImageStale 과 같은 규칙) — 말하는 모델에서는 대사·목소리가
// 클립 프롬프트에 실리는데 목소리는 컷이 아니라 캐스팅(project.cast)에 있다.
// 안 주면 말하는 축을 건너뛴다: 덜 알리는 쪽이 안전하다(낡음을 더 알리면 유료 호출을 부른다).
export function clipKey(cut, project) {
  const base = `${cut?.image?.url || ""}|${cut?.seconds ?? ""}|${cut?.motion || ""}`;
  // 속도가 클립 프롬프트에 실리므로(buildClipPrompt) 속도를 바꾸면 클립이 낡아야 한다.
  //
  // ⚠️ 있을 때만 덧붙인다. 형식을 무조건 바꾸면 옛 각인(url|초|움직임)이 전부 불일치가 되어
  //    이미 값을 치른 클립이 통째로 낡는다 — style_of 때와 같은 함정이다.
  const withSpeed = cut?.speed ? `${base}|${cut.speed}` : base;
  // 말하는 모델에서는 대사와 목소리도 프롬프트에 실린다 — 같은 이유로 각인에 넣는다.
  //
  // ⚠️ 값은 컷에 저장된 것이 아니라 **지금 프로젝트에서 판다**(lib/cuts.js spokenOf).
  //    저장해 두면 저장값과 비교값이 같은 출처가 되어 대사·목소리를 바꿔도 영영 안 낡는다.
  // 여기서도 **있을 때만** 덧붙인다(말하지 않는 프로젝트의 옛 각인을 건드리지 않는다).
  const spoken = spokenOf(cut, project);
  return spoken ? `${withSpeed}|${spoken}` : withSpeed;
}

// 자막이 문장에서 나오므로 sentence 도 넣는다(lib/subtitles.js).
//
// 자막 **위치**도 넣는다 — 합성이 그 값으로 ASS 를 만드는데, 각인에 없으면 위치를 바꿔도
// "안 낡음"이 되어 다시 만들기 버튼이 안 뜬다. 바꿨는데 아무 일도 안 일어난다.
//
// ⚠️ 각인은 "사장님이 무엇을 눌렀는가"가 아니라 **"완성본이 어떻게 보이는가"의 지문**이다.
//    그래서 기본값(아래)일 때는 적을 것이 없다 — 자리가 안 붙어야 옛 각인과 글자 그대로 같고,
//    이미 만든 완성본이 통째로 낡지 않는다(clipKey 의 speed 와 같은 함정, style_of 때 겪었다).
//    기본값을 **명시로** 저장한 것만으로 낡게 만들면 픽셀이 같은 mp4 를 다시 만들게 시킨다.
//    구별해서 얻는 것도 없다 — '위'로 바꾸면 어차피 "top\n" 이 붙어 옛 각인과 달라진다.
export function renderKey(project) {
  const base = (project?.cuts || [])
    .map((c) => `${c.audio?.url || ""}|${c.video?.url || ""}|${c.sentence || ""}`)
    .join("\n");
  const pos = project?.settings?.subtitle_position;
  return pos && pos !== DEFAULT_SUBTITLE_POSITION ? `${pos}\n${base}` : base;
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

// project 는 clipKey 와 같은 이유로 선택 인자다. 포인트프리로 넘기면(cuts.some(isClipStale))
// 배열 번호가 이 자리에 들어와 말하는 축이 조용히 죽는다 — tests/staleness-ui.test.js 가 막는다.
export function isClipStale(cut, project) {
  const of = cut?.video?.of;
  if (of === undefined) return false;
  return of !== clipKey(cut, project);
}

export function isRenderStale(project) {
  const of = project?.render?.of;
  if (of === undefined) return false;
  return of !== renderKey(project);
}

// 각인에서 자막 위치 머리를 뗀다. 위치가 붙었다면 첫 줄이 닫힌 목록의 한 낱말이고,
// 본문 줄은 언제나 "소리|클립|문장" 꼴이라 "|" 를 품어 서로 섞이지 않는다.
function renderKeyBody(key) {
  const s = key || "";
  const nl = s.indexOf("\n");
  const head = nl === -1 ? s : s.slice(0, nl);
  return SUBTITLE_POSITIONS.includes(head) ? s.slice(nl + 1) : s;
}

// 낡음의 원인이 **자막 위치뿐인가**. 화면이 원인을 갈라 말하려고 묻는다 —
// 위치만 바꾼 사장님에게 "컷을 고친 뒤라 옛 소리·옛 그림으로 만든 것"이라 하면
// 자기가 무엇을 망가뜨렸나로 읽는다.
//
// 판정을 화면에 흩지 않고 여기 둔다(낡음 판정은 이 파일 하단에 모인다).
// 컷·그림이 함께 낡았으면 거짓이다 — 그쪽이 더 큰 사실이라 기존 문구가 맞다.
export function isSubtitlePositionOnlyStale(project) {
  if (!isRenderStale(project)) return false;
  const cuts = project?.cuts || [];
  if (cuts.some((c) => isClipStale(c, project))) return false;
  if (cuts.some((c) => isImageStale(c, project))) return false;
  // 위치를 뗀 몸통이 같다 = 달라진 것은 위치뿐이다
  return renderKeyBody(project.render.of) === renderKeyBody(renderKey(project));
}
