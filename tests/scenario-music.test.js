// 음악은 **영상 하나에 하나**다 — 시나리오가 정하고 전 컷이 같은 값을 받는다.
//
// 왜(2026-08-18 사장님 지적): 지금 배경음은 모델이 **컷마다 따로** 만든다. 그래서 첫 컷은
// 아예 조용하고 둘째 컷에만 음악이 나오고, 나와도 서로 다른 곡이었다. 사장님이 원한 것은
// "시나리오에서 전체 BGM 을 정하고 그것이 끝까지 이어지는 것"이다.
//
// ★ 모델이 만든 소리는 **목소리와 음악이 한 트랙에 섞여** 나온다 — 첫 컷의 음악만 떼어
//   다음 컷에 넘기는 길은 음원 분리가 필요해 닫혀 있다(오디오를 입력으로 받는 자리도 없다).
//   그래서 방향을 뒤집는다: **같은 음악 지시를 전 컷에 똑같이 실어** 모델이 만드는 음악을
//   한 성격으로 모은다. 톤(색 처리)이 이미 같은 방식으로 전 컷 일관성을 만든다.
//
// ★★ **있을 때만 붙인다.** 음악 칸이 없는 옛 프로젝트의 프롬프트가 한 글자도 안 바뀌어야
//    한다 — 바뀌면 각인이 어긋나 **이미 값을 치른 클립이 통째로 낡는다**(컷당 $0.674).
//    이 저장소가 style_of·해상도·tone_of 에서 세 번 쓴 그 규칙이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildClipPrompt, buildImagePrompt } from "../lib/cuts.js";
import { clipKey } from "../lib/steps.js";
import { buildScenarioMessages } from "../lib/scenario.js";
import { checkScenario } from "../lib/scenario-rules.js";

const CUT = { idx: 0, sentence: "가", seconds: 5, image: { url: "https://x/i.png" }, motion: "천천히 다가간다" };
const base = (extra = {}) => ({
  settings: { target_seconds: 30, aspect_ratio: "9:16", i2v_model: "kling-v3" },
  cuts: [CUT],
  ...extra,
});

describe("시나리오가 음악을 정한다", () => {
  it("★ 시나리오 지시문이 음악 칸을 요구한다 — 영어로", () => {
    const src = readFileSync("lib/scenario.js", "utf8");
    expect(src, "JSON 스키마에 music 칸이 없다").toMatch(/"music"/);
    // 이 값은 모델에 그대로 실린다 — 언어 규칙 절에 함께 적혀 있어야 한다
    // (narrator_voice·subject·look 과 같은 대우다).
    expect(src, "음악 칸의 언어를 안 정했다 — 한국어로 적히면 그대로 모델에 나간다")
      .toMatch(/music[^\n]*영어|영어[^\n]*music/);
  });

  it("★ 음악을 정하면 전 컷 프롬프트에 **같은 글자**로 실린다", () => {
    const p = base({ scenario: { music: "slow piano, sparse and calm" } });
    const one = buildClipPrompt({ ...CUT, idx: 0 }, p);
    const two = buildClipPrompt({ ...CUT, idx: 1 }, p);
    expect(one, "음악 절이 안 실렸다").toMatch(/slow piano, sparse and calm/);
    expect(two, "둘째 컷에 음악 절이 없다 — 컷마다 다른 음악이 된다").toMatch(/slow piano, sparse and calm/);
    // "전 컷 동일"을 모델에게 말해 준다 — 톤이 쓰는 것과 같은 문형이다
    expect(one, "전 컷 동일이라는 말이 없다").toMatch(/identical|same/i);
  });

  it("★★ 음악이 없으면 프롬프트가 한 글자도 안 바뀐다 — 산 클립을 낡게 하지 않는다", () => {
    const withNone = base();
    const withEmpty = base({ scenario: { music: "   " } });
    const plain = buildClipPrompt(CUT, withNone);
    expect(buildClipPrompt(CUT, withEmpty), "빈 값이 절을 만들었다").toBe(plain);
    expect(plain, "음악이 없는데 음악 절이 붙었다").not.toMatch(/[Mm]usic/);
  });

  it("★★ 각인도 같은 규칙이다 — 없으면 안 붙고, 있으면 붙는다", () => {
    const none = clipKey(CUT, base());
    expect(clipKey(CUT, base({ scenario: { music: "" } })), "빈 값이 각인을 흔들었다").toBe(none);
    expect(clipKey(CUT, base({ scenario: { music: "slow piano" } })), "음악을 바꿔도 각인이 그대로다")
      .not.toBe(none);
  });

  it("★ 그림에는 음악을 싣지 않는다 — 정지 화면에 소리가 없다", () => {
    const p = base({ scenario: { music: "slow piano, sparse and calm" } });
    expect(buildImagePrompt(CUT, p, []), "그림 프롬프트에 음악이 실렸다").not.toMatch(/slow piano/);
  });

  it("★ 음악이 비어도 시나리오를 확정할 수 있다 — 음악 없는 영상도 정상이다", () => {
    const scenario = {
      topic: "가", angle: "나", narrator_voice: "",
      shots: [{ beat: "가", line: "말", speaker: "40대 남성", seconds: 30 }],
    };
    const got = checkScenario(scenario, { settings: { target_seconds: 30 } });
    expect(got.problems.join(" "), "음악이 없다고 확정을 막는다").not.toMatch(/음악/);
  });

  // ★★ 2026-08-18 (둘째 판) — **모델이 정한다. 사장님은 안 적는다**(사용자 지시:
  //    "사용자한테 입력 받는 게 아닌 모델이 선정하는 걸로").
  //    아침에 칸을 뒀다가 같은 날 걷은 것은, 이 값이 사장님이 판단할 것이 아니라 우리가
  //    영상 모델에 주는 지시이기 때문이다 — 전달 방식(angle)·내레이터 목소리와 같은 부류다.
  //    값은 그대로 만들어지고 그대로 저장되고 전 컷에 실린다. 화면에서만 사라진다.
  it("★ ②시나리오가 음악을 되묻지 않는다 — 모델이 정한다", () => {
    const page = readFileSync("app/create/[id]/scenario/page.js", "utf8");
    expect(page, "음악 칸이 남아 있다").not.toMatch(/edit\(\{\s*music:/);
    expect(page, "음악 값을 화면이 읽는다 — 고칠 수 없는데 보여 주면 거짓말이다")
      .not.toMatch(/scenario\.music/);
  });

  it("★ 시나리오를 다시 만들 때 옛 음악을 참고로 넘기지 않는다 — 사장님이 고친 값이 씨앗이 되면 안 된다", () => {
    // buildScenarioMessages 는 자료에서 시나리오를 만든다. 음악은 그 결과이고 입력이 아니다.
    const msgs = buildScenarioMessages({ settings: { target_seconds: 30 }, material: { text: "자료" } });
    expect(JSON.stringify(msgs), "요청에 music 이 입력으로 섞였다").not.toMatch(/"music":\s*"[^"]/);
  });
});
