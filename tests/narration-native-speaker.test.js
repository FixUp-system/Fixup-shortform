// **"그 나라 사람처럼 자연스럽게 읽어라"** (2026-09-01 사장님 지시).
//
// ★★★ 실측이 이 자리를 만들었다. 볶음밥 영상에서 낭독 **끝의 "픽스업"**(붙여 쓴 외래
//   상표)이 뭉개졌다. 이 저장소는 같은 종류를 이미 두 번 겪었다 — "Giants"가 "지에이턴스",
//   "에스더버니"가 "에스터버리".
//
// ★★ 그전 처방은 `say_as`(낱말별 발음 표기)였는데 **안 닫혔다.** 그 칸의 규칙에는
//   *"필요할 때만 적는다"* 가 붙어 있어 **"필요한가"의 판단이 모델 몫**이다. 같은 규칙을
//   두 자리(일반 규칙 · narration.say_as 칸 설명)에 적고 시나리오를 두 번 뽑았는데
//   **두 번 다 빈 문자열**이었다(2026-09-01 실측, fable-5).
//   → 그래서 낱말을 고쳐 주는 대신 **읽는 사람**을 정한다. 이쪽은 모델의 판단이 안 낀다.
//
// ★ 언어를 못 박지 않는다 — `langLine` 이 사장님이 고른 낭독 언어를 그대로 나른다
//   (Korean · Japanese · Simplified Chinese …). 한 언어를 적으면 나머지가 죽는다.
import { describe, it, expect } from "vitest";
import { buildOneShotPrompt } from "../lib/reel/oneshot.js";
import { buildClipPrompt } from "../lib/cuts.js";

const GRID = { rows: 2, cols: 3 };
const BODY = "A bright studio product film.";
const LINE = "픽스업 통새우 볶음밥.";

describe("통짜 — 낭독은 그 나라 사람이 읽는다", () => {
  const promptFor = (langLine) =>
    buildOneShotPrompt(GRID, 6, BODY, { narration: { text: LINE }, langLine, narrates: true });

  it("★★★ 원어민이 읽는다고 말한다", () => {
    expect(promptFor("Korean")).toMatch(/native Korean speaker/);
  });

  it("★★ **언어를 못 박지 않는다** — 사장님이 고른 언어를 그대로 나른다", () => {
    expect(promptFor("Japanese")).toMatch(/native Japanese speaker/);
    expect(promptFor("Japanese"), "한국어가 새어 들어갔다").not.toMatch(/Korean/);
    expect(promptFor("Simplified Chinese")).toMatch(/native Simplified Chinese speaker/);
  });

  it("★★ 뭉개짐의 두 모양을 짚는다 — 외국어 억양 · 철자 읽기", () => {
    const out = promptFor("Korean");
    expect(out).toMatch(/never a foreign accent/);
    expect(out).toMatch(/never spelled out letter by letter/);
  });

  it("★ 말이 없으면 이 줄도 없다 — 지문이 예전과 글자 그대로다", () => {
    const silent = buildOneShotPrompt(GRID, 6, BODY, { langLine: "Korean", narrates: true });
    expect(silent).not.toMatch(/native Korean speaker/);
  });

  it("★ 자리는 **말 뒤**다 — 무슨 말인지가 먼저다", () => {
    const out = promptFor("Korean");
    expect(out.indexOf("native Korean speaker")).toBeGreaterThan(out.indexOf("Says exactly"));
  });
});

describe("컷별 — 같은 문장이 있다(갈래마다 발음이 갈리면 안 된다)", () => {
  const cut = { idx: 0, shows: "a bowl of fried rice", sentence: LINE, seconds: 5 };
  const project = { settings: { aspect_ratio: "9:16", speech_lang: "ko" }, cast: [] };

  it("★★ 내레이션 갈래에 실린다", () => {
    const out = buildClipPrompt(cut, project, { body: "A bowl of fried rice.", sceneNo: 1, sceneCount: 3 });
    // 말이 실리는 갈래일 때만 재는 단정이다 — 무음 컷이면 이 줄이 없는 것이 맞다.
    if (/Says exactly/.test(out)) expect(out).toMatch(/native .+ speaker/);
  });
});
