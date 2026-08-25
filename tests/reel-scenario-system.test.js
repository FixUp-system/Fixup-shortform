// reel 이 자기 장면 수 규칙을 들고 시나리오를 부른다 — **광고 지시문은 한 글자도 안 바뀐다.**
//
// ★★ 이 파일이 배선을 잰다. 이번 회차에 `output_config` 에 스키마가 하드코딩돼
//   `writeClipPromptBody` 가 늘 빈 body 를 받는 결함이 있었는데 **전 스위트가 그린이었다**
//   — 테스트가 주입한 경로만 지나고 진짜 배선을 안 지났기 때문이다. 그래서 여기서는
//   buildScenarioMessages 가 실제로 내는 system 문자열을 본다.
import { describe, it, expect } from "vitest";
import { buildScenarioMessages, generateScenario } from "../lib/ad/scenario.js";
import { reelSceneCountRule } from "../lib/reel/scenario-rules.js";
import { readFileSync } from "fs";

const project = {
  settings: {
    seconds: 45, aspect_ratio: "9:16", narration_lang: "ko",
    format: "hero", style: "photo", mood: "premium",
  },
  material: { text: "원두 정기배송", photos: [] },
};

describe("장면 수 규칙 주입", () => {
  it("reel 규칙을 넘기면 system 이 그것을 말한다", () => {
    const { system } = buildScenarioMessages(project, { sceneCountRule: reelSceneCountRule(45) });
    expect(system).toContain("쓸 수 있는 장면 수는");
    expect(system).toContain("3 · 4 · 6 · 9 · 10 · 12 · 16");
  });

  it("reel 규칙을 넘기면 광고의 '넷을 넘기지 마라' 가 사라진다", () => {
    const { system } = buildScenarioMessages(project, { sceneCountRule: reelSceneCountRule(45) });
    expect(system).not.toContain("넷을 넘기지 마라");
  });

  // ★★ 다섯 모듈이 이미 받은 그 처방이다 — **안 넘기면 예전과 글자 그대로**.
  //   광고 경로가 조용히 달라지면 이 저장소가 지금까지 지켜 온 회귀 0 이 깨진다.
  it("안 넘기면 광고 지시문이 예전 그대로다", () => {
    const { system } = buildScenarioMessages(project);
    expect(system).toContain("넷을 넘기지 마라");
    expect(system).not.toContain("쓸 수 있는 장면 수는");
  });
});

describe("generateScenario 가 규칙을 실제로 싣는다", () => {
  // ★★ 배선을 여기서 잰다. buildScenarioMessages 가 옳아도 generateScenario 가 그것을
  //   안 넘기면 **진짜 경로만 죽는다** — 이번 회차의 `output_config` 결함과 같은 모양이다.
  it("넘긴 sceneCountRule 이 callJson 의 system 까지 간다", async () => {
    let seen = null;
    await generateScenario({
      project,
      sceneCountRule: reelSceneCountRule(45),
      deps: {
        callJson: async ({ system }) => {
          seen = system;
          return { text: "t", shots: [{ shows: "a", seconds: 5 }] };
        },
      },
    });
    expect(seen).toContain("3 · 4 · 6 · 9 · 10 · 12 · 16");
    expect(seen).not.toContain("넷을 넘기지 마라");
  });
});

describe("reel 시나리오 라우트가 그 규칙을 넘긴다", () => {
  const route = readFileSync("app/api/reel/[id]/scenario/route.js", "utf8");

  // ★ 이 저장소의 라우트 검사 관례를 따른다(tests/reel-routes.test.js) — 소스를 읽는다.
  //   다만 "이름이 나온다"로 그치지 않고 **generateScenario 의 인자로 실려 있는지**까지
  //   본다. 부르기만 하고 안 넘기면 배선이 죽는데 이름만 보는 검사는 그것을 통과시킨다.
  it("reelSceneCountRule 을 generateScenario 인자로 싣는다", () => {
    expect(route).toContain("reelSceneCountRule");
    expect(route).toMatch(/generateScenario\(\{[^}]*sceneCountRule/s);
  });

  // ★★ 길이는 settings.seconds 를 읽는다 — buildScenarioMessages 가 "길이: N초"를 쓸 때
  //   보는 그 값이다(app/api/reel/route.js:85 가 target_seconds 의 별칭으로 둔다).
  //   다른 값을 읽으면 지시문 안에서 "길이: 45초"와 "이 영상은 30초이고"가 어긋난다.
  it("길이를 settings.seconds 에서 읽는다", () => {
    expect(route).toMatch(/reelSceneCountRule\([^)]*settings[?.]*\.seconds/);
  });
});
