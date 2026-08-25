// 통짜 갈래의 **전체 프롬프트를 다시 쓴다** — 사장님이 한국어로 적은 말을 반영해서.
//
// ★★ 왜 이 파일이 생겼나(2026-08-25 사장님 지적: "붙고 나면 위 글에 그대로 보여요. 삭제").
//   예전에는 적은 말을 전체 프롬프트 **끝에 글자 그대로 붙였다**. 값은 0원이었지만 대가가
//   둘이었다: ① 붙인 한국어가 위 글(.script-src)에 그대로 보여 프롬프트가 지저분해지고,
//   ② 영어 지시문 끝에 한국어 한 줄이 매달린 채 fal 로 나갔다.
//   이제는 LLM 이 **같은 한 문단으로 다시 써서** 돌려준다 — 붙는 자리가 없다.
//
// ★ 시나리오 `text` 는 안 건드린다. 그 값은 컷·그림의 원천이라(scenarioLock 이 지키는 그
//   값) 고치면 그림까지 낡는다. 결과는 `reel.prompt` 에 산다(lib/reel/oneshot.js 의
//   reelWholePrompt 가 그것을 먼저 읽는다).
// ★ 위쪽 절반(system·메시지)은 **순수 함수**라 값이 안 든다. 값이 드는 것은 아래 하나다.
import { callJson } from "../ad/llm.js";

// ★★ 짧게 유지한다 — 이 저장소는 지시를 과하게 박으면 품질이 떨어지는 것을 08-19~21 에
//   실측했다(lib/reel/clip-prompt.js 의 같은 머리말). 규칙은 셋뿐이다.
// ★★ **모양을 지키라고 말한다.** 이 글은 통짜 굽기로 그대로 나가는 지시문이라, 모델이
//   "고쳤습니다" 같은 말을 앞에 붙이거나 목록으로 흩어 놓으면 그것이 영상에 실린다.
export const WHOLE_PROMPT_SYSTEM = `너는 영상 생성 모델에게 줄 지시문을 고쳐 쓰는 사람이다.

지금 쓰고 있는 지시문과, 사장님이 한국어로 적은 고쳐 달라는 말을 받는다.
그 말을 반영해 **같은 모양의 지시문 하나**로 다시 쓴다.

지켜야 할 것:
- 요청과 상관없는 대목은 **글자 그대로 둔다.** 다듬지 마라 — 이미 통과한 글이다.
- 원문이 영어면 영어로, 한국어면 한국어로 돌려준다. 언어를 바꾸지 마라.
- 고쳤다는 말·머리말·목록·따옴표를 덧붙이지 않는다. **지시문 본문만** 돌려준다.

JSON 하나만 출력한다: {"body":"고쳐 쓴 지시문 한 벌"}`;

const one = (v) => (typeof v === "string" ? v.trim() : "");

export function buildWholePromptMessages(whole, note) {
  return [
    {
      role: "user",
      content: [
        "지금 지시문:",
        one(whole),
        "",
        // ★ 요청을 **마지막에** 둔다 — 뒤에 올수록 모델이 강하게 받는다(이 저장소의 규약).
        "고쳐 달라고 한 것:",
        one(note),
      ].join("\n"),
    },
  ];
}

const WHOLE_PROMPT_SCHEMA = {
  type: "object",
  properties: { body: { type: "string" } },
  required: ["body"],
  additionalProperties: false,
};

// 전체 프롬프트를 다시 써서 돌려준다. 저장은 부르는 쪽이 한다.
//
// ★ 가짜 모드에서는 **원문이 그대로 돌아온다**(값이 안 나가는 자리라 그것이 정직하다).
//   그래서 fake 를 부르는 쪽 값에 물려 둔다 — 안 물리면 lib/ad/llm.js 가 광고 시나리오를
//   주고 SHOTFORM_FAKE=all 0원 관통이 그 자리에서 깨진다.
export async function rewriteWholePrompt(whole, note, opts = {}) {
  const body0 = one(whole);
  const ask = one(note);
  // 부를 이유가 없으면 안 부른다 — 빈 요청에 값을 치르지 않는다.
  if (!ask) return body0;
  if (!body0) throw new Error("고쳐 쓸 프롬프트가 없어요");

  const call = opts.callJsonImpl || callJson;
  const data = await call({
    system: WHOLE_PROMPT_SYSTEM,
    messages: buildWholePromptMessages(body0, ask),
    stage: "영상프롬프트",
    projectId: opts.projectId,
    fake: () => ({ body: body0 }),
    schema: WHOLE_PROMPT_SCHEMA,
  });
  const body = one(data?.body);
  // ★ 빈 본문으로 덮지 않는다 — 덮으면 굽기가 꼬리만 남은 지문으로 나가고, 값은 다 치른
  //   채 "무엇을 보냈는지" 알 길이 없는 영상이 남는다(clip-prompt.js 와 같은 규율).
  if (!body) throw new Error("프롬프트를 다시 쓰지 못했어요 — 다시 시도해 주세요");
  return body;
}
