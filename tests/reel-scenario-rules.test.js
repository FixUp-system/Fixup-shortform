// 길이 → 쓸 수 있는 컷 수. reel 은 컷을 따로 굽고 ffmpeg 로 잇는다 — 그림은 스토리보드
// 한 장이라 **컷 수가 곧 격자 칸 수**이고, 격자는 nano-banana 2 가 받는 프리셋 비율로만
// 그릴 수 있다(36:16 은 422 로 거절됐다). 그래서 아무 수나 못 쓴다.
import { describe, it, expect } from "vitest";
import { reelCutChoicesFor, reelGridFor, reelSceneCountRule, STORYBOARD_MAX_SIDE, bakeCellLong } from "../lib/reel/scenario-rules.js";
import { readFileSync } from "fs";

describe("reelCutChoicesFor — 그 화질이 담을 수 있는 칸 수만 준다", () => {
  // ★★ 2026-08-25 — 표를 계산으로 바꿨다. 옛 목록(3·4·6·9·10·12·16)은 **화질을 몰랐고**,
  //   프리셋 비율 제약(nano-banana 2)에 묶여 있었다. 지금 기본 이미지 모델(GPT Image 2)은
  //   임의 치수를 받으므로 그 제약이 사라졌다.
  // ★ 목록은 **길이가 아니라 화질**이 정한다 — 옛 reelCutChoices(45) 는 길이를 받았고,
  //   그 이름을 남겨 두면 같은 자리에 뜻이 둘이 된다(그래서 지웠다).
  it("★ 화질이 담을 수 있는 만큼만 연다", () => {
    expect(reelCutChoicesFor("720p")).toEqual([3, 4, 5, 6, 8, 9, 10, 12, 15]);
    expect(reelCutChoicesFor("1080p")).toEqual([3, 4, 6]);
  });

  it("480p 는 훨씬 넓다 — 칸이 작아도 되기 때문이다", () => {
    const list = reelCutChoicesFor("480p");
    expect(list).toContain(16);
    expect(list.length).toBeGreaterThan(reelCutChoicesFor("720p").length);
  });

  it("★ 720p 는 16컷을 안 연다 — 어떻게 배치해도 상한을 넘는다", () => {
    expect(reelCutChoicesFor("720p")).not.toContain(16);
    expect(reelGridFor(16, { resolution: "720p" })).toBeNull();
  });

  it("모르는 화질은 720p 로 본다 — 던지지 않는다", () => {
    expect(reelCutChoicesFor("없는화질")).toEqual(reelCutChoicesFor("720p"));
    expect(reelCutChoicesFor()).toEqual(reelCutChoicesFor("720p"));
  });

  it("★★ 여는 칸 수는 전부 **빈 칸이 0** 이다 — 사장님 결정(빈칸 없는 것만)", () => {
    for (const res of ["480p", "720p", "1080p"]) {
      for (const n of reelCutChoicesFor(res)) {
        const g = reelGridFor(n, { resolution: res });
        expect(g.rows * g.cols, `${res} ${n}컷: ${g.rows}x${g.cols}`).toBe(n);
      }
    }
  });

  it("★★ 여는 칸 수는 전부 **칸이 굽기 해상도 이상**이고 캔버스가 상한 안이다", () => {
    for (const res of ["480p", "720p", "1080p"]) {
      const need = bakeCellLong(res);
      for (const n of reelCutChoicesFor(res)) {
        const g = reelGridFor(n, { resolution: res });
        const cellLong = need;              // 계산이 칸을 줄이지 않으므로 그대로다
        const h = g.rows * cellLong, w = g.cols * Math.round(cellLong * 9 / 16);
        expect(Math.max(w, h), `${res} ${n}컷이 상한을 넘는다`).toBeLessThanOrEqual(STORYBOARD_MAX_SIDE);
        expect(cellLong).toBeGreaterThanOrEqual(need);
      }
    }
  });

  it("담을 수 없으면 null 이다 — 던지지 않는다(부르는 쪽이 컷별로 떨어진다)", () => {
    expect(reelGridFor(999, { resolution: "720p" })).toBeNull();
    expect(reelGridFor(0)).toBeNull();
    expect(reelGridFor("셋")).toBeNull();
  });
});

describe("reelSceneCountRule — LLM 이 그 안에서 고르게 하는 두 줄", () => {
  // ★ 이 문자열이 광고 SYSTEM 의 "장면 수" 대목 자리에 그대로 들어간다. 코드가 컷 수를
  //   못 박는 것이 아니라 **고를 수 있는 목록을 주고 LLM 이 소재를 보고 고른다** —
  //   그것이 이 설계의 요점이다(2026-08-24 사장님 결정).
  it("고를 수 있는 컷 수와 전체 길이를 함께 말한다", () => {
    const rule = reelSceneCountRule(45, "720p");
    expect(rule).toContain("45");
    expect(rule).toContain(reelCutChoicesFor("720p").join(" · "));
  });

  // ★★ 2026-08-25 — **화질마다 다른 목록을 말한다.** 그전에는 화질과 무관하게 같은
  //   목록을 줘서 1080p 프로젝트에 담기지도 않는 16컷을 권했다.
  it("★ 화질이 목록을 바꾼다 — 1080p 는 6컷까지다", () => {
    expect(reelSceneCountRule(15, "1080p")).toContain("3 · 4 · 6");
    expect(reelSceneCountRule(15, "1080p")).not.toContain("16");
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
  it("길이가 무엇이든 목록은 **화질**이 정한다", () => {
    expect(reelSceneCountRule(5, "720p")).toContain(reelCutChoicesFor("720p").join(" · "));
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

  // ★★ 2026-08-25 — 옛 단정 셋(격자 표의 행×열 · 대안 격자 · 대안이 목록에 있는가)을
  //   지웠다. 표 자체가 사라졌기 때문이다 — 이제 격자는 계산이고, "행×열 = 칸 수"는
  //   위 reelGridFor 블록이 **모든 화질에서** 잰다(손으로 적은 표를 대조하던 것보다 넓다).
  //   대안 격자(REEL_GRID_ALTERNATES)는 "표를 손으로 고를 때의 후보"였으므로 계산이
  //   들어온 지금 존재 이유가 없다.
});
