// reel 이 부르는 Claude Fable 호출 — **가짜 응답을 부르는 쪽이 정한다.**
//
// ★★ 2026-08-28 머지(feat/scenario-prompt)로 생긴 자리다. 그 브랜치가 lib/ad/llm.js 를
//   **광고 전용**으로 되돌리면서 `fake` 인자를 걷어냈다 — 이제 그 모듈은 가짜 모드에서
//   무조건 광고 시나리오(text·angle·shots)를 돌려준다:
//
//     if (fakeLlm()) return fakeAdResponse();
//
//   reel 은 그 모듈을 **세 자리**에서 빌려 쓴다(시나리오·컷 프롬프트·통짜 프롬프트 다시
//   쓰기). 그대로 두면 컷 프롬프트 자리에 광고 시나리오가 와서 `data.body` 가 없고,
//   그 자리는 빈 본문을 거부하므로 **던진다** — SHOTFORM_FAKE=all 관통(0원 검증)이 통째로
//   막힌다.
//
// ★ **받아온 파일은 한 글자도 안 고친다**(사장님 지시 2026-08-28). 그래서 reel 쪽에
//   얇은 겹을 하나 둔다 — 하는 일은 "가짜일 때만 가로채기" 하나뿐이고, 진짜 호출은
//   그대로 그 모듈로 흘려보낸다(원장·예산·재시도가 전부 거기 있다).
import { callJson as adCallJson } from "../ad/llm.js";
import { fakeLlm } from "../fake.js";

// ★ `fake` 가 없으면 예전과 같다 — 그 자리는 그대로 lib/ad/llm.js 의 판단을 따른다.
// ★ 진짜 경로에서는 이 함수가 아무것도 안 한다(인자를 그대로 넘긴다) — 값·원장·재시도의
//   유일한 자리는 여전히 lib/ad/llm.js 다.
export async function callJson({ fake, ...rest }) {
  if (fakeLlm() && typeof fake === "function") return fake();
  return adCallJson(rest);
}
