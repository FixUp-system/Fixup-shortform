// film 이 프롬프트 꼬리에 붙이는 **절들** — 2026-08-27 에 lib/ad/generate.js 에서 옮겨 왔다.
//
// ★★ 왜 옮겼나: 광고가 "Fable 이 영상 프롬프트 한 편을 쓰고 코드는 그대로 넘긴다"로 바뀌어,
//   이야기·무대·외형·인물·색·옷차림·목소리·읽는표기를 꼬리에 덧붙이면 안 되게 됐다. film 은
//   여전히 칸으로 받아 쓰므로 그 조립이 film 쪽으로 갔다(lib/film/pipeline.js 의 filmClauses).
// ★ 절의 내용과 순서는 **글자 그대로 예전과 같다** — 옮기면서 고치지 않았다.
// ★ 테스트도 옮겨 적지 않고 그대로 가져왔다. withSpokenLines 를 부르던 자리만 filmClauses
//   로 바꿨다(그 함수가 하던 일이 둘로 갈렸다: 대사 보강은 광고, 절 조립은 film).
import { describe, it, expect } from "vitest";
import { filmClauses } from "../lib/film/pipeline.js";

// 옛 계약: withSpokenLines(text, shots, voice, scenario) 가 text 뒤에 절을 붙여 돌려줬다.
// 지금은 절만 따로 만들므로, 테스트가 보던 모양(본문 + 절)을 여기서 다시 만든다.
const withSpokenLines = (text, shots, voice, scenario) =>
  [text || "", filmClauses({ ...(scenario || {}), voice, shots })].filter(Boolean).join("\n");

describe("이야기가 지시문에 실린다", () => {
  const out = (extra) => withSpokenLines("장면 설명.", [], undefined, { text: "장면 설명.", shots: [], ...extra });

  it("★ angle 이 실린다", () => {
    expect(out({ angle: "마스코트가 키링으로 변해 함께한다" })).toContain("마스코트가 키링으로 변해 함께한다");
  });

  it("없으면 예전 그대로다", () => {
    expect(out({})).toBe("장면 설명.");
  });
});

describe("음악·색처리·외형이 지시문에 실린다", () => {
  const sc = (extra) => ({ text: "장면 설명.", shots: [], ...extra });
  const out = (extra) => withSpokenLines(sc(extra).text, [], undefined, sc(extra));

  // ★ music 은 2026-08-19 에 지시문에서 걷어냈다(아래 "music 은 지시문에 싣지 않는다").
  //   분할 생성의 문제를 풀려던 절이라 통짜 굽기에는 통제 과잉이었다.

  it("★ tone 이 실리고 '끝까지 같게'를 말한다", () => {
    const t = out({ tone: "warm film grain" });
    expect(t).toContain("warm film grain");
    expect(t).toMatch(/throughout|identical|same/i);
  });

  it("★ look 이 실린다", () => {
    expect(out({ look: "pink plush bunny, palm-sized" })).toContain("pink plush bunny, palm-sized");
  });

  it("셋 다 없으면 예전 그대로다 — 옛 문서·각인 회귀 0", () => {
    expect(out({})).toBe("장면 설명.");
  });
});

describe("music 은 지시문에 싣지 않는다", () => {
  const out = (extra) =>
    withSpokenLines("장면.", [], undefined, { text: "장면.", shots: [], ...extra });

  it("★ music 이 있어도 지시문에 안 실린다", () => {
    const t = out({ music: "upbeat acoustic pop with hand claps" });
    expect(t).not.toContain("upbeat acoustic pop");
    expect(t).not.toMatch(/background music/i);
  });

  it("★ 다른 절은 그대로 실린다 — music 만 뺀 것이다", () => {
    const t = out({ music: "piano", tone: "warm grain", look: "pink bunny" });
    expect(t).toContain("warm grain");
    expect(t).toContain("pink bunny");
  });
});

describe("withSpokenLines — 목소리를 지시문에 싣는다", () => {
  it("★ voice 가 있으면 Voice 절이 붙는다", () => {
    const out = withSpokenLines("장면 설명.", [{ line: "안녕하세요" }], "a warm woman in her twenties");
    expect(out).toContain("a warm woman in her twenties");
    expect(out).toMatch(/Voice:/);
  });

  it("★ 대사가 이미 지시문에 들어 있어도 Voice 절은 붙는다 — 두 판정이 서로 다른 것이다", () => {
    // 실측(2026-08-19): Claude 가 대사를 늘 text 안에 넣어서 대사 보강 절은 거의 안 켜진다.
    // 목소리를 그 절에 얹으면 함께 안 나간다.
    const base = 'the narrator says "안녕하세요".';
    const out = withSpokenLines(base, [{ line: "안녕하세요" }], "a calm man");
    expect(out).toContain("a calm man");
  });

  it("voice 가 없으면 예전 그대로다 — 옛 문서·광고 회귀 0", () => {
    const base = 'the narrator says "안녕하세요".';
    expect(withSpokenLines(base, [{ line: "안녕하세요" }])).toBe(base);
    expect(withSpokenLines(base, [{ line: "안녕하세요" }], "")).toBe(base);
  });

  it("★ 목소리는 소리다 — 화면 글자로 띄우라는 뜻이 아님을 함께 말한다", () => {
    const out = withSpokenLines("장면.", [], "a calm man");
    expect(out).toMatch(/spoken|audio|voice/i);
  });
});

describe("say_as 가 프롬프트에 실린다", () => {
  it("★ say_as 가 있으면 그것을 읽으라고 한다", () => {
    const out = withSpokenLines("장면.", [{ line: "에스더버니 키링", say_as: "에스더 버니 키링" }]);
    expect(out).toContain("에스더 버니 키링");
  });

  it("★ 대사가 지시문에 이미 있어도 읽는 표기는 따로 실린다 — 그 둘은 다른 판정이다", () => {
    const base = 'the narrator says "에스더버니 키링".';
    const out = withSpokenLines(base, [{ line: "에스더버니 키링", say_as: "에스더 버니 키링" }]);
    expect(out).toContain("에스더 버니 키링");
  });

  it("say_as 가 없으면 예전 그대로다 — 회귀 0", () => {
    const base = 'the narrator says "안녕하세요".';
    expect(withSpokenLines(base, [{ line: "안녕하세요" }])).toBe(base);
  });
});
