// 길이 → 쓸 수 있는 컷 수. reel 은 컷을 따로 굽고 ffmpeg 로 잇는다 — 그림은 스토리보드
// 한 장이라 **컷 수가 곧 격자 칸 수**이고, 격자는 nano-banana 2 가 받는 프리셋 비율로만
// 그릴 수 있다(36:16 은 422 로 거절됐다). 그래서 아무 수나 못 쓴다.
import { describe, it, expect } from "vitest";
import { reelCutChoices, reelSceneCountRule, REEL_GRIDS, REEL_GRID_ALTERNATES } from "../lib/reel/scenario-rules.js";
import { readFileSync } from "fs";

describe("reelCutChoices — 격자로 그릴 수 있는 컷 수만 준다", () => {
  it("45초에도 격자로 떨어지는 칸 수가 전부 열린다", () => {
    expect(reelCutChoices(45)).toEqual([3, 4, 6, 9, 10, 12, 16]);
  });

  // ↓ 아래 셋은 RED 를 따로 보지 않았다 — 위 케이스를 통과시킨 구현(격자 표 + 컷당 초
  //   범위)이 이미 이것들을 덮는다. 회귀 방어로 못 박아 둔다: 표를 손대면 여기가 운다.
  it("15초에도 마찬가지다 — 짧다고 좁히지 않는다", () => {
    expect(reelCutChoices(15)).toEqual([3, 4, 6, 9, 10, 12, 16]);
  });

  it("30초도 같다", () => {
    expect(reelCutChoices(30)).toEqual([3, 4, 6, 9, 10, 12, 16]);
  });

  // ★ 60초는 선택지가 하나뿐이다 — 컷당 3~6초를 지키면서 격자로 떨어지는 수가 12 밖에
  //   없다(9칸이면 컷당 6.67초로 상한을 넘는다). 값도 12컷치로 고정된다.
  it("60초도 같다 — 길이는 목록을 좁히지 않는다", () => {
    expect(reelCutChoices(60)).toEqual([3, 4, 6, 9, 10, 12, 16]);
  });
});

describe("reelSceneCountRule — LLM 이 그 안에서 고르게 하는 두 줄", () => {
  // ★ 이 문자열이 광고 SYSTEM 의 "장면 수" 대목 자리에 그대로 들어간다. 코드가 컷 수를
  //   못 박는 것이 아니라 **고를 수 있는 목록을 주고 LLM 이 소재를 보고 고른다** —
  //   그것이 이 설계의 요점이다(2026-08-24 사장님 결정).
  it("고를 수 있는 컷 수와 컷당 초, 전체 길이를 함께 말한다", () => {
    const rule = reelSceneCountRule(45);
    expect(rule).toContain("9");
    expect(rule).toContain("12");
    expect(rule).toContain("3 · 4 · 6 · 9 · 10 · 12 · 16");
    expect(rule).toContain("45");
  });

  // ★★ 광고 지시문의 그 대목이 따라오면 안 된다 — 근거("한 번에 통째로 만들어진다")가
  //   reel 에서는 거짓이고, 45초를 넷 이하로 자르면 컷당 11초가 넘는다.
  it("광고의 '넷을 넘기지 마라' 를 물고 오지 않는다", () => {
    expect(reelSceneCountRule(45)).not.toContain("넷을 넘기지 마라");
    expect(reelSceneCountRule(45)).not.toContain("통째로");
  });
});

describe("목록 밖 길이 — 지시문을 깨뜨리지 않는다", () => {
  // ★★ TARGET_CHOICES(15·30·45·60)만 화면에서 고를 수 있지만, 옛 문서나 잘못된 값이
  //   들어올 수 있다. 그때 choices 가 비면 "쓸 수 있는 장면 수는 ****" 같은 빈 지시문이
  //   모델에게 나간다 — 값을 치르고 쓰레기를 받는다.
  //   **null 을 준다**: 부르는 쪽(buildScenarioMessages)이 이미 `|| AD_SCENE_COUNT_RULE`
  //   로 떨어지므로, 그러면 광고 규칙으로 조용히 되돌아간다. 이 저장소의 "모르는 값에
  //   던지지 않는다"(pickFocus) 와 같은 처방이다.
  it("길이가 무엇이든 목록은 격자가 정한다", () => {
    expect(reelCutChoices(5)).toEqual([3, 4, 6, 9, 10, 12, 16]);
  });

  it("길이를 모르면 규칙이 null 이다 — 부르는 쪽이 광고 규칙으로 떨어진다", () => {
    expect(reelSceneCountRule(undefined)).toBeNull();
    expect(reelSceneCountRule(0)).toBeNull();
  });
});

describe("순수 규율", () => {
  // ★ lib/reel/steps.js·doc.js 와 같은 규율이다(Ruling 18 이 목적에 맞게 좁힌 그것) —
  //   목적은 "사슬 끝에 fs·env 가 안 닿는 것"이다. 이 모듈은 화면이 값을 미리 보여 줄 때도
  //   쓸 수 있어야 하므로 번들에 fs 가 들어오면 안 된다.
  it("import 가 없다 — 어떤 사슬도 fs 를 물지 않는다", () => {
    expect(readFileSync("lib/reel/scenario-rules.js", "utf8")).not.toMatch(/^import /m);
  });

  // ★★ 표와 범위가 서로 모순되지 않는가 — 격자에 칸 수와 행×열이 어긋나면
  //   그림을 잘러 컷에 나눠 담을 때 칸이 밀린다. 표를 손대는 사람이 여기서 운다.
  it("격자 표의 행×열이 칸 수와 맞는다", () => {
    for (const [cells, g] of Object.entries(REEL_GRIDS)) {
      expect(g.rows * g.cols, `${cells}칸: ${g.rows}×${g.cols}`).toBe(Number(cells));
    }
  });

  // ★ 대안 격자도 같은 규율을 받는다 — 게이트 D 뒤에 갈아 끼울 후보라,
  //   그때 행×열이 칸 수와 어긋나면 그대로 칸이 밀린다.
  it("대안 격자도 행×열이 칸 수와 맞는다", () => {
    for (const [cells, alts] of Object.entries(REEL_GRID_ALTERNATES)) {
      for (const g of alts) {
        expect(g.rows * g.cols, `${cells}칸 대안: ${g.rows}×${g.cols}`).toBe(Number(cells));
      }
    }
  });

  // ★★ 대안은 **목록에 있는 칸 수**에만 달릴 수 있다. 없는 칸 수의 대안을 적어 두면
  //   아무도 그것을 안 쓰면서 표만 늘어난다(다음 사람은 그게 쓰이는 줄 알고 읽는다).
  it("대안은 목록에 있는 칸 수에만 달린다", () => {
    for (const cells of Object.keys(REEL_GRID_ALTERNATES)) {
      expect(REEL_GRIDS, `${cells}칸`).toHaveProperty(cells);
    }
  });
});
