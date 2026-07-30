import { secondsForText } from "./script.js";
import { activeClipProfile, minSecondsFor, maxSecondsFor } from "./clip-limits.js";
import { activeStyle } from "./styles.js";
import { MIN_UNIT_CHARS, noSpace, clauseBoundaries } from "./clauses.js";

// 절 경계 판정은 lib/clauses.js 에 있다(import 없는 leaf 모듈 — 그 파일 머리말 참고).
// 여기서 다시 내보내는 이유: 컷 분할(splitClauses)이 이 값을 쓰고, 기존에
// lib/cuts.js 에서 clauseBoundaries 를 import 하던 자리(테스트·측정 스크립트)가 있다.
export { clauseBoundaries };

// 컷 분할과 화면 설계 — 두 패스다.
//  1패스(분할): LLM은 컷 경계(문장 번호)만 고르고, 텍스트는 코드가 원고에서 잘라낸다.
//               모델이 문장을 다시 쓰게 두면 사장님이 승인한 원고가 이미지 단계에서 조용히 달라진다.
//  2패스(화면): 컷마다 무엇을 보여줄지 설계한다. 화면 근거는 나레이션 문장이 아니라 이 'shows'다.
// 모든 컷 화면은 AI가 새로 그린다. 업로드 사진은 화면에 직접 넣지 않고 참조(ref)로만 쓴다.

// 원고를 문장으로 나눈다 — 줄바꿈과 종결부호가 경계다.
// 컷 경계는 이 배열의 번호로만 이야기하므로, 나누는 규칙이 곧 컷의 최소 단위다.
export function splitSentences(text) {
  return (text || "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

// 컷 경계 후보. 컷은 여기서 나온 조각의 번호로만 이야기한다.
//
// 왜 문장만으로는 모자란가: 원고 한 문장이 12초인 경우가 있고(실측), 그 안에 성분·사용
// 순서·후기가 다 들어 있었다. 화면 설계가 그것을 한 장면으로 만들려다 동시에 일어날 수 없는
// 동작 둘을 요구했고, 이미지에 **손이 셋** 나왔다.
//
// 8초를 넘는 문장만 나눈다. 이 8초는 **콘텐츠 상한**이다 — 이미지 한 장에 담기는 정보량이지
// 모델 사정이 아니다. 모델을 바꿔도 이 값은 안 바뀐다.
// (모델 상한은 눈금의 최대값이고 lib/clip-limits.js 에 있다. 둘을 섞지 않는다.)
//
// 나눠도 원문은 그대로다: 공백이 있는 자리에서만 자르고 다시 " " 로 이으면 같은 글이 된다.
// **컷을 이어붙이면 원고와 글자 그대로 같다** 는 보장이 이렇게 유지된다.
//
// export 하는 이유: 파이프라인이 "8초를 넘는 컷이 있는가"를 판정할 때 같은 값을 쓴다.
export const CONTENT_MAX_SECONDS = 8;

// 연결어미는 **닫힌 목록**이다. 한국어 연결어미를 다 담으려 하지 않는다 —
// 못 담은 어미는 그 문장이 안 나뉠 뿐이고, 그때는 지금 동작(문장 통째)으로 떨어진다.
// 늘리는 것은 나중에 한 줄이면 된다.
function splitClauses(sentence) {
  const at = clauseBoundaries(sentence);
  const tokens = [...(sentence || "").matchAll(/\S+/g)];
  if (tokens.length === 0) return [sentence];

  const parts = [];
  let start = tokens[0].index;
  for (const pos of at) {
    // 경계 앞 한 글자는 공백 정확히 한 칸이다(clauseBoundaries 가 sep === " " 만 후보로 삼는다).
    // 그 한 칸을 빼고 자른다 — 컷 조각은 join(" ") 으로 원문을 복원하는 계약이라
    // 조각이 구분 공백을 품으면 그 자리에서 공백이 두 칸이 된다.
    // (자막은 계약이 반대다 — join("") 으로 복원하므로 공백을 품은 채 slice 한다.)
    parts.push(sentence.slice(start, pos - 1));
    start = pos;
  }
  // 마지막 조각 — 마지막 토큰 끝이 아니라 문장 끝까지 slice 한다(뒤에 남은 문장부호 등을 지키기 위해)
  const tail = sentence.slice(start);
  if (tail) {
    if (parts.length && noSpace(tail) < MIN_UNIT_CHARS) parts[parts.length - 1] += ` ${tail}`;
    else parts.push(tail);
  }
  return parts.length ? parts : [sentence];
}

export function splitUnits(text) {
  const out = [];
  for (const s of splitSentences(text)) {
    if (secondsForText(s) <= CONTENT_MAX_SECONDS) out.push(s);
    else out.push(...splitClauses(s));
  }
  return out;
}

// 받은 경계를 되돌린다 — 8초를 넘으면서 두 조각 이상인 컷은 조각 하나씩으로 푼다.
//
// 왜 컷이 아니라 경계를 다시 쓰는가: 이 결과를 validateCutRanges 에 다시 통과시키면
// 문장·초·idx 를 그 함수가 전부 다시 뽑아 준다. 재조립 코드를 두 벌 두지 않아도 되고,
// 빈틈·겹침·전량 사용 검사를 공짜로 한 번 더 받는다.
//
// 왜 강제로 푸는가: 판정만 하고 되묻는 방식은 실패했다 — 모델이 같은 답을 다시 냈고
// 코드가 받았다(2026-07-29 실측, 8초 초과 5건 중 4건이 "짧은 조각을 합친 것"이었다).
//
// 조각 하나로 이뤄진 컷은 8초를 넘어도 두고, 8초 이하 묶음도 그대로 둔다 —
// 합치기가 없어지는 것이 아니라 기본에서 예외로 내려오는 것이다.
export function explodeLongRanges(ranges, units) {
  if (!Array.isArray(ranges) || !Array.isArray(units)) return [];
  const out = [];
  let expected = 1;
  for (const r of ranges) {
    // 망가진 경계는 여기서 고치지 않는다 — 빈 배열로 떨어뜨리고 부르는 쪽이 폴백을 쓴다
    if (!Number.isInteger(r?.from) || !Number.isInteger(r?.to)) return [];
    if (r.from !== expected || r.to < r.from || r.to > units.length) return [];
    const seconds = secondsForText(units.slice(r.from - 1, r.to).join(" "));
    if (seconds > CONTENT_MAX_SECONDS && r.to > r.from) {
      for (let i = r.from; i <= r.to; i++) out.push({ from: i, to: i });
    } else {
      out.push({ from: r.from, to: r.to });
    }
    expected = r.to + 1;
  }
  // 원고를 끝까지 다 쓰지 않은 경계는 받지 않는다 — validateCutRanges 와 같은 규칙이다
  if (expected !== units.length + 1) return [];
  return out;
}

// 나누는 것은 시나리오다. 모델이 만들 수 있는 길이는 **목표가 아니라 알려 주는 사실**로 넣는다.
//
// 상한이 둘이라 섞지 않는다:
//  - 콘텐츠 상한(8초) — 이미지 한 장에 담기는 정보량. 모델과 무관하다.
//    실측에서 12초 컷의 화면 설계가 동시에 불가능한 동작 둘을 요구해 손이 셋 나왔다.
//  - 모델 상한(눈금의 최대값) — 넘으면 클립 뒷부분이 움직이지 않는다.
//
// 숫자를 하드코딩하지 않는다. 모델이 바뀌면 눈금 표만 바뀌고 이 문장은 따라 바뀐다.
function splitSystem() {
  // 지금 도는 모델의 하한·상한이다. 눈금 종류(열거/범위)와 무관하게 읽는다.
  const profile = activeClipProfile();
  const lo = minSecondsFor(profile);
  const hi = maxSecondsFor(profile);
  return `너는 숏폼 영상 편집자다. 완성된 나레이션 원고를 컷으로 나눈다.
번호가 매겨진 조각 목록을 받는다. 각 컷이 어느 조각부터 어느 조각까지인지만 고른다.
반드시 JSON 하나만 출력: {"cuts":[{"from":시작 조각 번호,"to":끝 조각 번호}]}
규칙:
- 조각을 고쳐 쓰지 않는다. 너는 경계만 고른다 — 문장은 이미 사장님이 승인했다.
- 컷은 1번 조각에서 시작해 마지막 조각에서 끝난다. 빈틈도 겹침도 없다(앞 컷의 to 다음이 뒤 컷의 from이다).
- 한 컷은 화면 하나다. 화면이 바뀔 자리에서 끊는다 — 말하는 대상이 바뀌거나, 시간·장소가 옮겨가거나, 근거에서 결과로 넘어가는 자리.
- 한 컷에 동시에 일어날 수 없는 동작 둘을 담지 않는다. 정지 화면 하나로 그려지므로, "덜어서 바른다" 처럼 순서가 있는 동작이 한 컷에 들어가면 그림이 무너진다.
- 한국어 낭독은 초당 5.5자 남짓이다. 한 컷이 8초(공백 빼고 44자)를 넘지 않게 한다 — 이미지 한 장이 그보다 오래 머물면 눈이 지친다.
- 이 영상 모델은 ${lo}~${hi}초 클립을 만든다. ${hi}초를 넘는 컷은 뒷부분이 움직이지 않고, ${lo}초보다 짧은 컷은 남는 시간이 생긴다.
- 장면이 바뀌는 자리를 먼저 잡고, 그 안에서 위를 고려한다. 억지로 길이를 맞추려고 장면을 붙이거나 끊지 않는다.`;
}

export function buildSplitMessages(units) {
  const numbered = units.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return {
    system: splitSystem(),
    messages: [{ role: "user", content: `[원고 — 조각 ${units.length}개]\n${numbered}` }],
  };
}

const SHOWS_SYSTEM = `너는 숏폼 영상의 촬영을 설계한다. 컷마다 화면에 무엇이 보일지, 그것이 어떻게 움직일지 적는다.
반드시 JSON 하나만 출력: {"shots":[{"shows":"화면에 보이는 것(정지 화면)","motion":"그 화면이 어떻게 움직이는지 한 줄"}]}
shots는 컷과 같은 개수·같은 순서다.
규칙:
- shows는 카메라가 잡는 것을 눈에 보이게 적는다 — 피사체·행동·샷 크기·앵글. 추상어로 쓰지 않는다.
  샷 크기는 극단적 클로즈업·클로즈업·미디엄 샷·풀 샷·광각(설정 샷) 중에서, 앵글은 눈높이·로우 앵글·하이 앵글·조감도·오버더숄더·시점 샷 중에서 골라 그 말 그대로 적는다.
  화면의 분위기를 정하는 조명도 컷에 맞게 적는다 — 시간대(골든아워·한낮·황혼·새벽), 날씨·공기(안개·이슬비·햇빛에 떠다니는 먼지). 모든 컷에 억지로 넣지는 않는다.
  없는 것으로 쓰지 않는다. 빼고 싶은 것을 말하는 대신 원하는 상태를 그대로 서술한다.
  ✗ "정성이 느껴지는 장면" / "분위기 있는 컷" / "손님이 없는 매장"
  ✓ "아침 7시 주방, 딸기를 통째로 갈아 넣는 손 클로즈업, 창으로 든 새벽빛"
  ✓ "텅 빈 새벽 매장 풀 샷, 의자가 테이블 위에 올려져 있다"
- shows는 그 컷 문장을 그림으로 옮긴 삽화가 아니다. 말이 하지 않는 것을 화면이 맡는다 —
  말이 "한 번에 한 명만 받습니다"이면 화면은 작업대에 놓인 의자 하나를 비춘다.
  화면이 말을 그대로 되풀이하면 그 컷의 정보량은 절반이 된다.
- 거울·유리창처럼 비치는 면에 사람이 함께 보이는 화면은 적지 않는다 — 지금 기술로는 비친 상과 실제가 어긋난다(등지고 선 사람이 정면으로 비치거나 거울 속 목이 돌아간다).
  치수를 재거나 옷을 입어 보는 장면이면 거울 대신 인물과 손을 잡는다.
- 화면 안에서 읽히는 글자·숫자가 보이는 장면은 적지 않는다 — 가격표·간판·메뉴판·문서·화면 속 글자.
  지금 기술로는 글자가 무늬로 그려져 틀린 값이 나온다(실측: VT PDRN → VT PORN, 39,000 → 79,000).
  가격·이름처럼 정확해야 하는 것은 자막이 맡는다.
  ✗ "앰플 병과 가격표가 함께 놓인 테이블 클로즈업"
  ✓ "앰플 병 하나만 놓인 테이블 클로즈업, 아침 햇살"
- 첫 컷은 스크롤을 멈추는 한 방이다. 거리 전경·간판·외관 같은 설정 샷으로 열지 않는다.
- 컷들은 한 편의 영상이다. 같은 피사체를 이어 그리되 같은 그림을 반복하지 않는다 — 샷 크기와 각도를 바꿔 간다.
- **shows 에는 카메라 움직임을 적지 않는다.** shows 로 만드는 것은 클립의 첫 프레임이 될 정지
  화면이라, 움직임을 섞으면 그림이 흐려진다. 움직임은 motion 에 따로 적는다.
- **motion 은 그 정지 화면에서 이어지는 움직임 하나다.** 카메라가 움직이거나 피사체가
  움직이거나 — 둘 다 넣지 않는다. 몇 초 안에 끝나는 작은 변화로 적는다.
  ✗ "카메라가 돌면서 인물이 걸어오고 문이 열린다"(셋을 한 컷에)
  ✓ "카메라가 천천히 뒤로 물러난다"
  ✓ "김이 위로 천천히 피어오른다"
  얼굴 표정·말하는 입·손가락을 세밀하게 쓰는 동작은 적지 않는다 — 지금 기술로는 뭉개진다.
  움직일 것이 마땅치 않으면 "거의 정지, 아주 느린 카메라 이동"으로 적는다.
- [이 영상이 따라가는 것]이 주어져 있으면 컷들이 그것을 중심으로 이어지게 쓴다. 사람이면 그 사람을, 물건이면 그 물건을, 정보면 그 정보를 눈에 보이게 만든다.
  사람이 보이는 컷에는 그 컷에 함께 보이는 사람도 빠짐없이 적는다 — 적지 않은 사람은 뒤 단계가 알 수 없어 컷마다 다른 얼굴로 나온다.
- 초점이 물건인데 사람이 보이는 컷이면, 사람과 물건을 한 화면에 담는다. 시선이나 손이 그 물건을 향하게 쓴다.
  ✗ "20대 후반 여성의 미소 짓는 얼굴 클로즈업" — 초점이 물건인데 물건이 화면에 없다
  ✓ "앰플 병을 손에 들고 바라보며 미소 짓는 20대 후반 여성 미디엄 샷"
- [올린 사진]은 무엇을 찍을 수 있는지 알려 주는 목록이다. 그 사진에 있는 물건·공간을 화면에 넣어도 좋다. 어느 사진을 쓸지는 적지 않는다 — 뒤 단계가 정한다.
- 자료에 없는 사실을 화면으로 지어내지 않는다.`;

export function buildShowsMessages(project, cuts) {
  const photos = (project.material?.photos || []).map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";
  const list = cuts.map((c, i) => `${i + 1}. ${c.sentence}`).join("\n");
  // 초점 — 이 영상이 무엇을 따라가는지. 없으면 블록째 빼서 지금 동작 그대로 둔다.
  // 이것이 없을 때 화면이 어떤 편은 사물로, 어떤 편은 인물로 쏠렸다(2026-07-28~29 관측).
  const f = project.briefing?.focus;
  const focusBlock = f?.mode && f?.subject ? `\n[이 영상이 따라가는 것]\n${f.mode} — ${f.subject}\n` : "";
  const user = `[영상 주제] ${project.briefing?.topic || "(밝히지 않음)"}
[원고 전문]
${project.script?.text || ""}

[컷 ${cuts.length}개 — 이 순서대로 shots를 만든다]
${list}
${focusBlock}
[올린 사진]
${photos}`;
  return { system: SHOWS_SYSTEM, messages: [{ role: "user", content: user }] };
}

// shows 에서 정지 그림에 못 담을 절을 뺀다 — 이미지 프롬프트를 만들 때만 쓴다.
//
// SHOWS_SYSTEM 에 "shows 에는 카메라 움직임을 적지 않는다"가 굵게 적혀 있는데도 지켜지지
// 않아 "자전거 바퀴가 천천히 회전한다"가 그림 지시로 갔다(2026-07-28 관통). 정지 이미지
// 모델은 회전을 그릴 방법이 없어 회전을 **암시하는** 그림을 만든다 — 페달에서 뗀 발,
// 굴러가는 자세. 그 그림이 클립의 첫 프레임이 되어 "페달을 안 밟는데 굴러가는" 결함이 굳는다.
// 이 저장소가 반복해 겪은 패턴이다 — 지켜져야 하는 것은 프롬프트가 아니라 코드가 쥔다.
//
// **저장된 shows 는 건드리지 않는다.** 사장님이 대본 화면에서 보고 고치는 값이라,
// 화면에 보이는 것과 그림 지시가 어긋나면 고칠 근거를 잃는다. 여기서 걸러 쓰기만 한다.
//
// 판정선은 감이 아니라 실측에서 뽑았다 — 화면 설계를 자료 6편 × 3회 돌려 절 122개를 모으고
// (scripts/measure/shows-motion-leak.mjs) 눈으로 라벨해 규칙을 맞췄다. 결과 4/4·오검출 0.
// 절 122개 중 76%가 명사·관형형으로 끝나(구도 서술) 판정 대상조차 아니었고, 오염은 3.3%였다.
const STILL_FORMS = [
  /\s있다$/,      // 보조용언 '있다' 구성 — "놓여 있다"(상태) · "입고 있다"(착용). 둘 다 정지다
  /보인다$/,       // 존재
  /하다$/,        // 양태 — "딸기 조각이 가득하다"
  /(햇빛|햇살|빛|조명|먼지).*(비친다|비춘다|들어온다|떠다닌다)$/, // 빛이 주어인 조명 서술
];
// 유지 형태라도 속도 부사가 붙으면 움직임이다 — "손이 키보드를 빠르게 치고 있다".
// '부드럽게'는 넣지 않는다. 속도가 아니라 태(態)라서, 정당한 "조명이 부드럽게 비친다"까지 지운다.
const SPEED_ADVERBS = /(천천히|서서히|빠르게|점점|조금씩)/;

export function stillOnly(shows) {
  const clauses = String(shows || "").split(/,\s*/).map((c) => c.trim()).filter(Boolean);
  const kept = clauses.filter((c) => {
    // 명사·관형형으로 끝나면 구도 서술이다. 절 안의 동사를 훑으면 안 된다 —
    // "자전거를 타고 지나가며 손을 흔드는 풀 샷"은 '지나가며'가 있어도 정지 화면이다
    if (!/(다|요)$/.test(c)) return true;
    if (SPEED_ADVERBS.test(c)) return false;
    return STILL_FORMS.some((re) => re.test(c));
  });
  return kept.join(", ");
}

export function buildImagePrompt(cut, project, refs = []) {
  const ar = project.settings.aspect_ratio;
  const orient = ar === "9:16" ? "vertical 9:16" : ar === "1:1" ? "square 1:1" : "horizontal 16:9";
  // 화면 근거는 컷의 '보여줌'이다. 나레이션 문장은 귀로 듣는 것이지 그릴 대상이 아니다.
  // 폴백 두 겹: 화면 패스가 실패한 컷 → 구성 시절 프로젝트의 장면 → 그마저 없으면 문장.
  // 움직임 절을 걸러낸 뒤에 폴백을 판정한다 — shows 가 통째로 움직임이면 그릴 것이 없다
  const legacyScene = Number.isInteger(cut.scene_idx) ? project.synopsis?.scenes?.[cut.scene_idx] : null;
  const shows = stillOnly(cut.shows) || stillOnly(legacyScene?.shows) || cut.sentence;
  // 주제 앵커 — 컷이 제품을 직접 안 담아도(가격·위치 컷 등) 전 컷이 같은 대상을 그리게 한다.
  const subject = project.briefing?.topic
    ? ` The video's subject is: ${project.briefing.topic}. Keep this exact product/subject consistent in every scene.`
    : "";
  // 화풍은 사장님이 고른 프리셋에서 온다(lib/styles.js). 고르지 않았으면 실사다 —
  // 그때 이 문장은 화풍을 도입하기 전과 글자 그대로 같다(tests/cuts.test.js 가 못 박는다).
  //
  // 화풍을 shows 에 섞지 않는 이유: shows 는 사장님이 화면에서 보고 고치는 값이다.
  // 화풍이 그 안에 스며들면 화풍을 바꿀 때마다 화면 설계를 다시 해야 하고 손으로 고친 것이
  // 날아간다. stillOnly 가 움직임을 걸러내는 것과 같은 결이다 — 그림 지시는 여기서 합성한다.
  const style = activeStyle(project);
  // 보정 한 줄. 위치가 방어다 — 마감과 글자 금지는 **항상 코드가 이 뒤에** 붙이므로
  // 사장님이 무엇을 쓰든 우리 지시가 지워지지 않는다.
  const note = project.settings?.style?.note;
  const noteClause = typeof note === "string" && note.trim() ? ` Style note: ${note.trim()}.` : "";
  let p = `${style.medium} for a short-form video, ${orient} composition. Scene: ${shows}.${subject}${noteClause} ${style.finish}, no text or letters in the image.`;
  // 레퍼런스 문구는 종류에 따라 갈린다.
  // 지금까지는 사람에게도 "제품의 모양·색·포장을 첨부와 똑같이"라고 붙이고 있었다 —
  // 사람에게는 틀린 지시다.
  //
  // **첨부를 번호로 세어 배역에 묶는다.** 익명으로 두 장을 보냈더니 모델이 배역을 뒤바꿨다
  // (2026-07-29 실측: 캐스팅은 50대를 손님으로 정했는데 그림에서는 50대가 치수를 재고
  //  30대가 코트를 입었다. 한 컷에서는 30대 아바타가 아예 무시되고 낯선 여성이 나왔다).
  // 번호는 image_urls 에 실리는 순서와 같아야 한다 — 부르는 쪽이 이 refs 를 그대로 싣는다.
  const people = refs.filter((r) => r.kind === "person");
  if (people.length) {
    const named = refs
      .map((r, i) => (r.kind === "person" && r.who ? `[${i + 1}] ${r.who}` : null))
      .filter(Boolean);
    if (named.length) {
      p += ` Attached reference images, in order: ${named.join(", ")}.`;
      p += " Draw each of these people as the person in their own numbered image — do not swap them between roles.";
    }
    p += " Keep the same person (face, hair, build) as the attached reference — do not invent a different person.";
    // 인물이 정해진 컷에는 그 밖의 사람을 넣지 못하게 막는다.
    // 2026-07-29 실측: shows 가 "손님이 들어오는" 뿐인 컷에 재봉틀 앞 중년 여성이 덤으로
    // 그려졌고, 그 사람은 레퍼런스가 없어 다음 컷에서 다른 얼굴이 됐다. 초점을 선언해도
    // 줄지 않아 그림 지시에서 직접 막는다.
    //
    // 인물 레퍼런스가 있는 컷에만 붙이는 이유: 거리 풍경처럼 행인이 있어야 자연스러운
    // 화면까지 사람을 지우면 그림이 어색해진다.
    p += " Only the described people appear in this frame — no other people, including in the background.";
  }
  if (refs.some((r) => r.kind === "thing")) {
    p += " Match the product/subject appearance to the attached reference image exactly (shape, colors, packaging).";
  }
  // 사용자가 구체적으로 지시한 수정 — 가장 강하게 반영한다
  if (cut.edit_instruction) {
    p += ` Important correction requested by the user, apply it strictly: ${cut.edit_instruction}.`;
  }
  return p;
}

// 클립 프롬프트 — i2v 에 "이 그림이 어떻게 움직이는가"를 준다.
//
// 이 자리는 오래 비어 있었다. shows 는 정지 화면 설계라 움직임을 일부러 뺐고(위 규칙),
// i2v 는 이미지와 길이만 보냈다. 그래서 컷이 어떻게 움직일지를 아무도 정하지 않고
// 모델 재량에 맡겨져 있었다 — 숏폼에서 움직임은 컷 정보량의 절반이다.
//
// motion 이 없으면(화면 패스 실패·옛 프로젝트) 눈에 띄지 않는 기본값으로 간다.
// 여기서 과한 움직임을 지어내면 그림이 무너지므로, 폴백은 조용한 쪽이다.
export function buildClipPrompt(cut) {
  const motion = typeof cut?.motion === "string" ? cut.motion.trim() : "";
  const base = motion || "거의 정지 상태, 아주 느린 카메라 이동";
  return `${base}. The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged. No text or letters. No talking faces or lip sync.`;
}
