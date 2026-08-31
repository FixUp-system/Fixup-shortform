// **모델이 못 받는 격자가 나오는 컷 수는 애초에 권하지 않는다** (2026-08-31 사장님 결정 A).
//
// ★★ 앞선 회차에서 5컷 H3 프로젝트가 통짜로 못 가고 **컷별로 떨어지고 있었다.**
//   스토리보드가 1행×5열(3600×1280 · 비율 **2.81**)이라 H3 의 참조 이미지 한계
//   (0.4~2.5)를 넘어서다. 그때는 **굽기 직전에** 떨어뜨렸다(실패는 막았지만 통짜를 잃었다).
//   이제 **시나리오 단계에서** 그 수를 아예 안 권한다 — 뿌리가 거기다.
//
// ★ 5 는 **소수**라 1×5 밖에 없다. 다른 수는 세로로도 쌓여 통과한다
//   (4=2×2 0.56 · 6=2×3 0.84 · 9=3×3 0.56). 7·11 은 너무 넓어 격자 자체가 안 생기는데,
//   5 만 상한(3840) 안쪽인 3600 이라 **혼자 빠져나왔다.**
//
// ★★ **모델을 아는 자리에서만 좁힌다.** Seedance 에는 이 거절이 없으므로 5 가 그대로
//   남아야 한다 — 한계를 안 넘기면 예전과 글자 그대로 같다(회귀 0).
//
// ★ `lib/reel/scenario-rules.js` 는 **import 0 건의 순수 모듈**이다(화면이 읽는 사슬에
//   들어 있다). 그래서 모델을 넘기지 않고 **한계 자체**를 인자로 받는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  reelCutChoicesFor, reelSceneCountRule, reelGridFor, sheetAspectFor,
} from "../lib/reel/scenario-rules.js";
import { sheetAspectFor as sheetAspectFromOneshot } from "../lib/reel/oneshot.js";
import { refAspectFor, clipProfileForProject } from "../lib/clip-limits.js";

const H3 = refAspectFor(clipProfileForProject({ settings: { i2v_model: "minimax-h3" } }));

describe("한계를 안 주면 예전 그대로다", () => {
  it("★ 5 가 후보에 남는다 — Seedance 는 이 거절이 없다", () => {
    expect(reelCutChoicesFor("720p", "9:16")).toContain(5);
  });

  it("지시문도 예전 그대로 5 를 권한다", () => {
    expect(reelSceneCountRule(15, "720p", "9:16")).toMatch(/\b5\b/);
  });
});

describe("모델 한계를 주면 그 수를 뺀다", () => {
  const choices = () => reelCutChoicesFor("720p", "9:16", H3);

  it("★★ 5 가 빠진다 — 1행×5열은 비율 2.81 이라 H3 가 거절한다", () => {
    expect(choices(), "5 가 아직 후보에 있다").not.toContain(5);
  });

  it("★ 다른 수는 그대로 남는다 — 문을 너무 좁히지 않았는지 함께 본다", () => {
    const c = choices();
    for (const n of [3, 4, 6, 9]) expect(c, `${n}컷이 사라졌다`).toContain(n);
  });

  it("★ 남은 수는 **전부** 그 한계 안이다 — 하나라도 새면 또 컷별로 떨어진다", () => {
    for (const n of choices()) {
      const r = sheetAspectFor(reelGridFor(n, { resolution: "720p", aspect: "9:16" }), "9:16");
      expect(r, `${n}컷의 판 비율 ${r.toFixed(2)} 가 한계 밖이다`).toBeGreaterThanOrEqual(H3.min);
      expect(r, `${n}컷의 판 비율 ${r.toFixed(2)} 가 한계 밖이다`).toBeLessThanOrEqual(H3.max);
    }
  });

  it("★ 지시문이 5 를 안 권한다", () => {
    const rule = reelSceneCountRule(15, "720p", "9:16", H3);
    // ★ **목록 줄만** 본다 — 머리말에 "이 영상은 15초이고"가 있어 거기서 5 가 잡힌다.
    //   목록 줄은 `**3 · 4 · 6 …**` 로 시작한다.
    const line = rule.split("\n").find((l) => l.trimStart().startsWith("**"));
    expect(line).toBeTruthy();
    expect(line, "목록에 5 가 남아 있다").not.toMatch(/(^|\D)5(\D|$)/);
    expect(line).toMatch(/(^|\D)4(\D|$)/);
  });

  it("고를 것이 하나도 안 남으면 null 이다 — 빈 목록을 권하지 않는다", () => {
    // 아무 격자도 통과 못 하는 좁은 한계를 준다.
    expect(reelSceneCountRule(15, "720p", "9:16", { min: 9, max: 10 })).toBeNull();
  });
});

describe("판 비율 계산의 집은 하나다", () => {
  it("★ oneshot 이 다시 내보내되 계산은 scenario-rules 한 곳이다", () => {
    expect(sheetAspectFromOneshot).toBe(sheetAspectFor);
  });

  it("1행×5열 · 9:16 → 2.8125 (실제 판 3600×1280 과 같다)", () => {
    expect(sheetAspectFor({ rows: 1, cols: 5 }, "9:16")).toBeCloseTo(2.8125, 4);
  });
});

describe("순수 규율 · 배선", () => {
  it("★ scenario-rules 는 import 0 건이다 — 화면이 읽는 사슬이라 모델을 못 문다", () => {
    const src = readFileSync("lib/reel/scenario-rules.js", "utf8");
    expect([...src.matchAll(/^import\s/gm)].length, "import 가 생겼다").toBe(0);
  });

  it("★ 시나리오 라우트가 **그 프로젝트 모델의** 한계를 넘긴다", () => {
    const src = readFileSync("app/api/reel/[id]/scenario/route.js", "utf8");
    expect(src, "refAspectFor 를 안 쓴다").toMatch(/refAspectFor/);
    expect(src, "reelSceneCountRule 에 안 넘긴다")
      .toMatch(/reelSceneCountRule\([\s\S]{0,200}refAspectFor/);
  });
});
