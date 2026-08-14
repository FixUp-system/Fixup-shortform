// ★ 화면이 "다 됐다"고 문을 여는 순간과, 서버가 단계를 올리는 순간이 다르면
//   사장님은 **넘어가다가 되돌아온다**(2026-08-13 프로덕션 실측).
//
// 무슨 일이 있었나: 목소리 파이프라인은 컷마다 audio 를 따로 저장하고(lib/pipeline.js),
// status 는 **다 끝난 뒤 한 번 더** 저장한다. 그런데 화면의 폴링은 audio 만 보고 끝내
// 버튼을 열었다 — 그 사이에 누르면 status 가 아직 "cuts" 라 레이아웃 가드가
// isReachable("images") = false 로 판정해 목소리로 되돌린다(app/create/[id]/layout.js).
//
// 로컬에서는 그 창이 밀리초라 거의 안 보이고, Vercel 에서는 저장이 왕복이라 넓게 열린다.
// 그래서 "로컬은 되는데 배포하면 안 되는" 모양이 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { currentStepKey, isReachable } from "../lib/steps.js";

const read = (p) => readFileSync(p, "utf8");
const voice = read("app/create/[id]/voice/page.js");
const images = read("app/create/[id]/images/page.js");

describe("단계 전진 — 화면이 가드보다 앞서가지 않는다", () => {
  it("★ 그 창이 실제로 존재한다 — audio 는 다 있는데 status 는 아직 cuts", () => {
    // 이 판정이 뒤집히면(가드가 그 상태에서 이미지를 열어주면) 이 버그 자체가 사라진다.
    const midFlight = {
      briefing: { confirmed: true },
      status: "cuts",
      cuts: [{ idx: 0, audio: { url: "a" } }, { idx: 1, audio: { url: "b" } }],
    };
    expect(currentStepKey(midFlight)).toBe("voice");
    expect(isReachable("images", midFlight), "가드는 이 상태에서 이미지를 안 연다").toBe(false);
  });

  it("③목소리 폴링이 status 까지 보고 끝낸다 — cuts 만 보면 창이 열린다", () => {
    // ★ 종료 **조건 자체**를 잰다. 주변 몇 줄을 훑으면 위쪽 setProject 의 st.status 가
    // 걸려 우연히 통과한다(처음에 그렇게 썼다가 거짓 초록을 봤다).
    //
    // 폴링이 lib/poll.js 한 벌로 옮겨간 뒤로 종료는 `stop(false)` 호출이 아니라
    // onTick 이 참을 **돌려주는** 것이다(2026-08-14). 재는 것은 그대로 그 한 줄이다.
    const line = voice.split(/\r?\n/).find((l) => l.includes("return !pending"));
    expect(line, "폴링 종료 한 줄을 못 찾겠다").toBeTruthy();
    expect(line, "종료 판정이 status 를 안 본다 — audio 만 보면 창이 열린다")
      .toMatch(/st\.status/);
  });

  it("★ 전진 버튼이 가드와 **같은 판정**을 쓴다 — 가드가 닫을 문을 화면이 열지 않는다", () => {
    expect(voice).toMatch(/from ["'].*lib\/steps["']/);
    expect(voice, "③목소리의 전진 버튼이 isReachable 을 안 본다").toMatch(/isReachable\(["']images["']/);
  });

  it("④이미지의 전진 버튼도 같은 규칙을 쓴다 — 같은 모양의 창이 거기도 있다", () => {
    // 그림도 컷마다 저장되고 status 는 마지막에 한 번이다(runImagesPipeline).
    expect(images, "④이미지의 전진 버튼이 isReachable 을 안 본다").toMatch(/isReachable\(["']video["']/);
  });
});
