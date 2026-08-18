// 만들기를 누르면 **바로 시나리오**로 간다.
//
// 사장님 지시(2026-08-18): "자료는 준비됐어요 페이지 말고 바로 시나리오 만들기로 이동하게."
//
// ①자료 화면은 2026-08-18 아침에 입력을 전부 잃었다 — 길이·사이즈·모델·화질·컨셉·공통
// 지시가 첫 화면으로 모이면서, 남은 일이 "적은 글을 보여 주고 [시나리오 만들기]를 누르는
// 것" 하나뿐이 됐다. 누를 것이 하나뿐인 화면은 게이트가 아니라 **한 번 더 누르게 하는 자리**다.
//
// ★ 화면 자체는 지우지 않는다. 스테퍼의 ①이 그 화면을 가리키고(lib/steps.js stepHref),
//   사장님이 적은 자료를 다시 보고 싶을 때 돌아갈 자리가 필요하다. 바뀌는 것은 **처음 가는
//   곳**뿐이다.
// ★ 가드가 막지 않는다: currentStepKey 는 자료 글이 있으면 곧바로 "scenario" 를 돌려준다
//   (lib/steps.js). 첫 화면이 그 글을 반드시 받으므로 생성 직후 조건이 이미 참이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { currentStepKey } from "../lib/steps.js";

const first = readFileSync("app/create/page.js", "utf8");

describe("첫 화면 — 만든 뒤 어디로 가나", () => {
  it("★★ 시나리오로 바로 보낸다", () => {
    expect(first, "아직 ①자료 화면을 거친다").not.toMatch(/router\.push\(`\/create\/\$\{data\.id\}\/briefing`\)/);
    expect(first, "시나리오로 안 보낸다").toMatch(/router\.push\(`\/create\/\$\{data\.id\}\/scenario`\)/);
  });

  it("★ 가드가 그 자리를 열어 둔다 — 자료 글이 있으면 곧바로 시나리오다", () => {
    expect(currentStepKey({ material: { text: "동네 세탁소를 합니다" } })).toBe("scenario");
    // 글이 없으면 여전히 ①자료다 — 그 경우가 남아 있어야 화면을 지우지 않은 이유가 선다
    expect(currentStepKey({ material: { text: "  " } })).toBe("material");
  });

  it("★ ①자료 화면은 남아 있다 — 스테퍼의 ①이 그곳을 가리킨다", () => {
    const steps = readFileSync("lib/steps.js", "utf8");
    expect(steps, "①자료가 스테퍼에서 사라졌다").toMatch(/key: "material"/);
  });
});
