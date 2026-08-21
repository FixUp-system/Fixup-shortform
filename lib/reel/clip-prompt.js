// 컷 하나를 영상 모델이 알아듣는 말로 옮긴다 — **본문만** 쓴다.
//
// ★★ 대사·컷순번 문장·립싱크·금지문은 여기서 안 쓴다. 그것들은 lib/cuts.js 의
//   buildClipPrompt 가 꼬리로 붙인다(꼬리는 한 벌이다). 특히 **대사를 LLM 에 보여 주지
//   않는다** — 보면 본문에 섞어 써서 같은 말이 두 번 실리거나 다듬어지고, 다듬어지는
//   순간 들리는 말과 ffmpeg 자막이 갈린다.
// ★ 모델은 lib/ad/llm.js 의 claude-fable-5 다. 그 모듈을 부르는 것은 아래 Task 6 이고,
//   이 파일의 위쪽 절반(system·메시지)은 **순수 함수**라 값이 안 든다.
import { callJson } from "../ad/llm.js";

// ★★ 짧게 유지한다. fable 은 지시가 과하게 박히면 오히려 품질이 떨어지고, 이 저장소도
//   08-19~21 실측으로 같은 결론에 닿았다(걷어내자 "훨씬 자연스럽다"). 규칙은 둘뿐이다.
// ★ 예시를 넣지 않는다 — 이 저장소는 모델이 예시를 어절 단위로 베끼는 것을 두 번 겪었다.
export const CLIP_PROMPT_SYSTEM = `너는 영상 생성 모델에게 줄 지시문을 쓰는 사람이다.

컷 하나의 재료를 받아 **영어 한 문단**으로 옮긴다. 담을 것은 넷이다:
누가/무엇이 있는가 · 무엇이 일어나는가 · 어떤 배경과 빛인가 · 무엇이 들리는가.

지켜야 할 것:
- 화면 안에서 읽히는 글자·숫자가 보이는 장면은 적지 않는다. 지금 기술로는 글자가 무늬로
  그려져 틀린 값이 나온다.
- 희귀하거나 모호한 단어, 복잡한 특수 기호는 쓰지 않는다.
- 대사는 쓰지 않는다. 인물이 말한다는 사실도 적지 않는다 — 그 자리는 따로 있다.

JSON 하나만 출력한다: {"body":"영어 한 문단"}`;

const one = (v) => (typeof v === "string" ? v.trim() : "");

// 값이 있는 줄만 담는다 — 빈 줄을 남기면 모델이 그 자리를 지어내 채운다.
function line(label, value) {
  const v = one(value);
  return v ? `${label}: ${v}` : null;
}

export function buildClipPromptMessages(cut, project, opts = {}) {
  const sc = project?.scenario || {};
  const parts = [
    Number.isFinite(opts.sceneNo) && Number.isFinite(opts.sceneCount)
      ? `이 컷은 전체에서 ${opts.sceneNo} / ${opts.sceneCount} 번째다.`
      : null,
    line("앞 컷", opts.prevShows),
    "",
    line("보이는 것", cut?.shows),
    line("카메라", cut?.camera),
    line("빛", cut?.lighting),
    line("움직임", cut?.action),
    line("소리", cut?.sound),
    "",
    line("무대", sc.environment),
    line("색 처리", sc.tone),
    line("화풍", sc.look),
  ].filter((p) => p !== null);

  return [{ role: "user", content: parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() }];
}

// 가짜 모드가 줄 것 — **이 단계의 모양**이다. 안 넘기면 lib/ad/llm.js 가 광고 시나리오를
// 주고, 그러면 SHOTFORM_FAKE=all 0원 관통이 그 자리에서 깨진다.
// ★ 실제 프롬프트처럼 읽히되 테스트 자료와 소재가 겹치지 않게 고른다.
function fakeClipPromptResponse() {
  return { body: "A quiet workshop bench; the camera drifts left as dust settles in a shaft of light." };
}

export async function writeClipPromptBody(cut, project, opts = {}) {
  const call = opts.callJsonImpl || callJson;
  const data = await call({
    system: CLIP_PROMPT_SYSTEM,
    messages: buildClipPromptMessages(cut, project, opts),
    stage: "영상프롬프트",
    projectId: opts.projectId,
    fake: fakeClipPromptResponse,
  });
  const body = one(data?.body);
  // ★ 빈 본문으로 굽지 않는다. 꼬리만 남은 프롬프트로도 fal 은 영상을 만들어 주고,
  //   그러면 값은 다 치른 채 "왜 이렇게 나왔는지" 알 길이 없는 클립이 남는다.
  if (!body) throw new Error("영상 프롬프트가 비어 있어요 — 다시 시도해 주세요");
  return body;
}
