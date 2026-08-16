// 시나리오 — 사장님 설명 한 덩어리를 읽고 영화처럼 전체 틀을 짠다.
//
// ★ 이 파일은 서버 전용이다(lib/llm.js 를 부른다). 화면은 이것을 import 하지 않는다 —
//   화면이 쓰는 판정은 lib/scenario-rules.js 에 있다.
//
// ★ 광고(lib/ad/scenario.js)와 갈라 두는 이유: 그쪽 지문은 "컷 편집을 지시하지 마라 —
//   편집 단계가 없다"를 못박는다(영상 모델이 한 번의 생성 안에서 장면을 잇는다).
//   여기는 편집 단계가 있어서 그 줄이 정확히 뒤집힌다. 한 파일을 공유하면 한쪽 요구가
//   다른 쪽을 망가뜨린다. 광고 파일은 건드리지 않는다.
//
// ★ 카메라·조명·움직임은 여기서 묻지 않는다 — 화면 설계(2패스)가 답한다.
//   여기서 미리 받으면 값이 두 벌이 되고, 2패스의 재시도가 사장님이 고친 시나리오를 덮는다.
import { clipProfileForProject, minSecondsFor, maxSecondsFor } from "./clip-limits.js";
import { CONTENT_MAX_SECONDS } from "./cuts.js";
import { callJson } from "./llm.js";
import { checkScenario } from "./scenario-rules.js";

const FOCUS_MODES = ["사람", "물건", "정보"];
const str = (v) => (typeof v === "string" ? v.trim() : "");

const SYSTEM = `너는 짧은 영상의 연출을 총괄하는 감독이다.
사장님이 준 설명을 읽고 **이 영상을 어떻게 전달할지** 전체 틀을 짠다.

너가 정하는 것은 셋이다:
- **무엇을 중심에 둘 것인가** — 이 영상이 따라가는 대상(사람·물건·정보 중 하나)
- **어떤 흐름으로 갈 것인가** — 시작에서 끝까지의 형태. 무엇으로 붙잡고 무엇으로 닫는가
- **장면을 어떻게 나눌 것인가** — 각 장면이 이야기에서 하는 일, 그 장면의 대사, 길이

지켜야 할 것:
- **영상을 장면으로 나눈다.** 장면 하나가 그림 한 장으로 만들어진다 — 한 장면 안에서
  장소나 구도가 바뀌면 안 된다.
- 장면 초의 **합이 주어진 길이와 정확히 같아야** 한다.
- 장면 하나는 **주어진 하한 이상, ${CONTENT_MAX_SECONDS}초 이하**다. 그림 한 장이 그보다
  오래 화면에 머물면 정지 화면처럼 보인다.
- **대사는 짧게. 영상 길이를 말로 다 채우지 마라** — 쉬는 자리가 있어야 숨이 트인다.
  말이 없는 장면을 넣어도 된다(그때는 line 을 빈 문자열로 둔다).
- **대사가 있는 장면에는 누가 말하는지를 반드시 적는다.** 화면에 보이는 사람이면 그 사람을
  적고(예: "40대 남성 제빵사"), 화면 밖 목소리면 "내레이션"이라고 적는다.
  ★ 내레이션은 **최소로** 쓴다 — 화면에 보이는 사람이 말하는 쪽이 결과가 좋다.
- 화면에 **글자를 넣으라고 요구하지 마라.** 모델은 글자를 "글자처럼 생긴 무늬"로 그린다.
  자막·로고는 우리가 나중에 따로 붙인다.
- **화면 설명(무엇이 어떻게 보이는가)은 적지 마라.** 그것은 다음 단계가 정한다.
  너는 "이 장면이 이야기에서 하는 일"만 적는다.
- 정보가 모자라도 **되묻지 말고**, 합리적으로 채워 완성된 시나리오 하나를 낸다.

JSON 으로만 답한다:
{
  "topic": "이 영상이 무엇에 대한 것인지 한 줄",
  "focus": {"mode": "사람|물건|정보 중 하나", "subject": "그 갈래의 대상 한 줄", "look": "물건이면 생김새 — 색·부위·소재(아니면 빈 문자열)"},
  "angle": "이 영상을 어떻게 전달하는가 — 무엇을 중심에 두고 어떤 흐름으로 가는가",
  "shots": [{
    "beat": "이 장면이 이야기에서 하는 일 (한국어)",
    "line": "이 장면의 대사 (없으면 빈 문자열)",
    "speaker": "이 대사를 누가 말하는가 (대사가 없으면 빈 문자열)",
    "seconds": 이 장면의 길이(정수)
  }]
}`;

export function buildScenarioMessages(project) {
  const profile = clipProfileForProject(project);
  const min = minSecondsFor(profile);
  const max = maxSecondsFor(profile);
  const target = Number(project?.settings?.target_seconds) || 0;
  const aspect = project?.settings?.aspect_ratio || "9:16";
  const photos = (project?.material?.photos || []).map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";

  const user = `[사장님 설명]
${project?.material?.text || ""}

[올린 사진]
${photos}

[영상 길이] ${target}초 — 장면 초의 합이 정확히 이 값이어야 한다
[화면 비율] ${aspect} ${aspect === "9:16" ? "(세로 — 세로 구도로 짠다)" : ""}
[장면 길이] 하한 ${min}초 · 상한 ${CONTENT_MAX_SECONDS}초 (영상 모델 상한은 ${max}초지만 그림 한 장의 상한이 더 낮다)
[담을 수 있는 장면 수] 최대 ${Math.max(1, Math.floor(target / min))}개`;

  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// 모양만 본다 — 규칙(합·상한·하한·화자)은 lib/scenario-rules.js 의 checkScenario 가 본다.
// 둘을 한 함수에 넣으면 "모양은 맞는데 규칙에 걸린 답"을 사장님에게 보여 줄 수 없다.
export function validateScenario(obj) {
  if (!obj || !Array.isArray(obj.shots)) return null;
  const shots = [];
  for (const s of obj.shots) {
    const beat = str(s?.beat);
    // beat 가 없으면 화면 설계가 무엇을 그릴지 모른다 — 그 장면은 버린다
    if (!beat) continue;
    const line = str(s?.line);
    shots.push({
      beat,
      line,
      // 대사가 없으면 화자도 없다 — 빈 대사에 화자가 붙으면 checkScenario 가 헷갈린다
      speaker: line ? str(s?.speaker) : "",
      seconds: Math.round(Number(s?.seconds) || 0),
    });
  }
  if (!shots.length) return null;

  const mode = str(obj?.focus?.mode);
  const subject = str(obj?.focus?.subject);
  const focus = FOCUS_MODES.includes(mode) && subject
    ? { mode, subject, look: str(obj?.focus?.look) }
    : null;

  return { topic: str(obj.topic), focus, angle: str(obj.angle), shots };
}

// SHOTFORM_FAKE=all 에서 ②시나리오가 받는 답.
//
// ★ 왜 lib/llm.js 가 아니라 여기인가: 이 답은 **checkScenario 를 실제로 통과해야** 한다
//   (합 = 고른 길이, 장면마다 모델 하한 이상 CONTENT_MAX_SECONDS 이하, 대사에는 화자).
//   그러려면 목표 초와 모델 하한을 알아야 하는데 그것을 아는 곳은 프로젝트를 쥔 여기다.
//   가짜 모드 **판정**은 여전히 lib/fake.js 한 곳이고(llm.js 가 부른다), 여기는 값만 만든다.
//
// 나누는 법: 장면 수를 상한(그림 한 장이 머물 수 있는 시간)으로 먼저 정하고, 하한에 걸리면
// 줄인다. 나머지는 앞 장면부터 1초씩 얹어 **합이 정확히 목표와 같게** 한다 — 반올림으로
// 1초가 새면 그것만으로 사장님이 안 겪어도 될 결함 문구를 본다.
export function fakeScenario(project) {
  const min = minSecondsFor(clipProfileForProject(project));
  const target = Number(project?.settings?.target_seconds) || 0;
  // 길이를 안 고른 프로젝트도 관통은 돼야 한다 — 그때 합 규칙은 아예 안 걸린다(checkScenario)
  const total = target > 0 ? target : min;

  let n = Math.max(1, Math.ceil(total / CONTENT_MAX_SECONDS));
  while (n > 1 && Math.floor(total / n) < min) n -= 1;
  const base = Math.floor(total / n);
  const extra = total - base * n;

  const shots = Array.from({ length: n }, (_, i) => ({
    beat: `가짜 장면 ${i + 1} — 배선만 확인한다`,
    line: `가짜 대사 ${i + 1}.`,
    speaker: "내레이션",
    seconds: base + (i < extra ? 1 : 0),
  }));
  return {
    topic: "가짜 시나리오 주제",
    focus: { mode: "물건", subject: "가짜 제품", look: "" },
    angle: "가짜 모드 — 값이 아니라 배선을 본다",
    shots,
  };
}

// ★ 두 번까지만 부른다. 세 번째를 두지 않는 이유는 이 저장소가 컷 분할에서 이미 겪었다 —
//   되물었더니 모델이 같은 답을 다시 냈고 값(시간·호출)만 치렀다.
//   두 번째도 걸리면 **그대로 사장님에게 보여 준다**. 코드가 초를 몰래 주무르지 않는다:
//   합을 맞추려고 마지막 장면을 늘리면 사장님이 안 시킨 편집이 되고, 무엇이 왜 바뀌었는지
//   화면이 설명할 수 없다.
export async function generateScenario(project, { call = callJson } = {}) {
  const built = buildScenarioMessages(project);
  let scenario = null;
  let problems = [];
  let calls = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = problems.length
      ? [...built.messages, { role: "user", content: `[다시] ${problems.join(" ")}\n같은 형식으로 전부 다시 낸다.` }]
      : built.messages;
    calls += 1;
    const got = validateScenario(
      // fake 는 가짜 모드에서만 쓰인다(lib/llm.js) — 주입된 call 로 도는 테스트는 이 키를
      // 읽지 않으므로 계약이 그대로다.
      await call({
        system: built.system, messages, stage: "시나리오", projectId: project?.id,
        fake: () => fakeScenario(project),
      })
    );
    if (!got) {
      problems = ["형식이 맞지 않았어요."];
      scenario = null;
      continue;
    }
    scenario = got;
    const checked = checkScenario(got, project);
    problems = checked.problems;
    if (checked.ok) break;
  }

  return { scenario, problems, calls };
}
