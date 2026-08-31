// **캐스팅이 정한 생김새를 영상 지문에 싣는다** (2026-08-31 사장님 지시).
//
// ★★★ 실측으로 잡은 구멍이다. `cast[0].look` 에
//   *"shoulder-length dark brown hair loosely tucked behind one ear, slim build,
//   cream knit sweater with sleeves pushed up"* 가 적혀 있는데, 통짜 영상 지문
//   **1,080자 안에 그 낱말이 한 개도 없었다.** 영상 모델이 받은 인물 정보는 본문의
//   *"a cheerful young woman"* 한 마디뿐이었다 — 아바타를 안 닮는 것이 당연했다.
//
// ★★ 왜 이제 결정적인가 — 2.5 는 **얼굴 사진을 참조로 못 받는다**(같은 날 실측 5건:
//   큰 얼굴 · 얼굴 작게+시선 내림 · 단독 인물 카드 · 배경에 작게(프레임의 2%) · 전부 거절.
//   얼굴 없는 판만 통과). 그래서 판에서 얼굴을 뺐고, **그 순간부터 생김새를 정하는 것은
//   이 글뿐이다.** 아바타 사진은 판 그리기까지만 가고 영상에는 못 간다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reelCastLine, buildOneShotPrompt } from "../lib/reel/oneshot.js";

const GRID = { rows: 2, cols: 3 };
const LOOK = "shoulder-length dark brown hair loosely tucked behind one ear, slim build, "
  + "cream knit sweater with sleeves pushed up";
const CAST = [{ id: "c1", who: "Korean woman in her 20s, cheerful home cook", look: LOOK }];

describe("캐스팅 한 줄", () => {
  it("★★★ 누구인지와 생김새를 함께 싣는다", () => {
    const line = reelCastLine({ cast: CAST });
    expect(line).toContain("Korean woman in her 20s");
    expect(line).toContain("cream knit sweater");
  });

  it("★★ 한 편 내내 같은 사람이어야 한다고 못 박는다", () => {
    expect(reelCastLine({ cast: CAST })).toMatch(/identical from the first shot to the last/);
  });

  it("★★ 캐스팅이 없으면 **빈 문자열**이다 — 지문이 예전과 글자 그대로다(회귀 0)", () => {
    for (const p of [{}, { cast: [] }, { cast: [{}] }, { cast: null }]) {
      expect(reelCastLine(p)).toBe("");
    }
  });

  it("★ 여럿이면 둘 다 싣는다 — 한 명만 실으면 나머지가 매번 다른 사람이 된다", () => {
    const line = reelCastLine({ cast: [...CAST, { who: "her father in his 60s", look: "grey cardigan" }] });
    expect(line).toContain("cream knit sweater");
    expect(line).toContain("grey cardigan");
  });

  it("★ look 만 있고 who 가 없어도 버리지 않는다", () => {
    expect(reelCastLine({ cast: [{ look: "grey cardigan" }] })).toContain("grey cardigan");
  });
});

describe("통짜 지문에 실린다", () => {
  const body = "A cheerful young woman takes a delicious bite and lights up with a smile.";

  it("★★★ 생김새가 지문에 들어간다 — 이게 없어서 아바타를 안 닮았다", () => {
    const out = buildOneShotPrompt(GRID, 6, body, { cast: reelCastLine({ cast: CAST }) });
    expect(out).toContain("cream knit sweater");
  });

  it("★★ 자리는 **본문 뒤·말 앞**이다", () => {
    const out = buildOneShotPrompt(GRID, 6, body, {
      cast: reelCastLine({ cast: CAST }),
      narration: { text: "오늘은 통새우 볶음밥!" },
      langLine: "Korean",
    });
    const iBody = out.indexOf("takes a delicious bite");
    const iCast = out.indexOf("cream knit sweater");
    const iSaid = out.indexOf("Says exactly");
    expect(iBody).toBeGreaterThan(-1);
    expect(iCast, "생김새가 본문 앞에 있다 — 사람이 장면을 앞선다").toBeGreaterThan(iBody);
    expect(iSaid, "생김새가 말보다 뒤에 있다 — 말이 밀린다").toBeGreaterThan(iCast);
  });

  it("★★ 안 넘기면 지문이 예전과 글자 그대로다", () => {
    const withCast = buildOneShotPrompt(GRID, 6, body, { cast: "" });
    const plain = buildOneShotPrompt(GRID, 6, body, {});
    expect(withCast).toBe(plain);
  });
});

describe("배선 · 각인", () => {
  const src = readFileSync("lib/reel/pipeline.js", "utf8");

  it("★★ 굽기가 실제로 넘긴다 — 함수만 있고 안 부르면 아무 일도 안 일어난다", () => {
    expect(src).toMatch(/cast:\s*reelCastLine\(project\)/);
  });

  it("★★★ **각인은 안 바뀐다** — 이 줄이 늘어도 이미 구운 편이 낡으면 안 된다", () => {
    // 각인은 본문 하나를 문다(`of: body`). 목소리·내레이션과 같은 규약이다 —
    // 그 규약이 깨지면 문구 한 줄 고칠 때마다 전 편이 재구매 대상이 된다.
    expect(src).toMatch(/of:\s*body/);
  });
});
