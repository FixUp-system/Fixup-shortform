// 설정은 **돈을 치른 순간** 잠긴다 — 값이 컷마다 각인돼 있어서, 바꾸면 이미 만든 것이 낡는다.
// ★ 새 상태를 만들지 않는다: 여기서 보는 신호는 lib/reel/steps.js 의 도달 판정이 쓰는 것과 같다.
import { describe, it, expect } from "vitest";
import { lockedAxes } from "../lib/reel/locks.js";

const p = (extra = {}) => ({ id: "p1", settings: {}, ...extra });
const cut = (extra = {}) => ({ idx: 0, shows: "장면", ...extra });

describe("lockedAxes — 축마다 잠기는 때가 다르다", () => {
  it("아무것도 안 만들었으면 다 열려 있다", () => {
    const l = lockedAxes(p());
    for (const k of ["aspect_ratio", "target_seconds", "style", "i2v_model", "resolution"]) {
      expect(l[k].locked, `${k} 가 잠겨 있다`).toBe(false);
      expect(l[k].reason).toBe("");
    }
  });

  it("★ 시나리오를 확정하면 비율·길이가 잠긴다 — 컷 구조가 그 값에서 나왔다", () => {
    const l = lockedAxes(p({ scenario: { text: "A 15-second commercial." } }));
    expect(l.aspect_ratio.locked).toBe(true);
    expect(l.aspect_ratio.reason).toBe("시나리오를 확정해서 잠겼어요");
    expect(l.target_seconds.locked).toBe(true);
    // 그림·클립은 아직 없으므로 나머지는 열려 있다
    expect(l.style.locked).toBe(false);
    expect(l.i2v_model.locked).toBe(false);
  });

  it("★ 첫 그림을 그리면 화풍이 잠긴다", () => {
    const l = lockedAxes(p({
      scenario: { text: "t" },
      cuts: [cut({ image: { url: "/api/uploads/a.jpg" } }), cut({ idx: 1 })],
    }));
    expect(l.style.locked).toBe(true);
    expect(l.style.reason).toBe("첫 그림을 그려서 잠겼어요");
    expect(l.i2v_model.locked, "클립이 없는데 모델이 잠겼다").toBe(false);
  });

  it("★★ 첫 클립을 구우면 모델·화질이 잠긴다 — 여기서부터 돈이 크게 나간다", () => {
    const l = lockedAxes(p({
      scenario: { text: "t" },
      cuts: [cut({ image: { url: "a" }, video: { url: "v" } })],
    }));
    expect(l.i2v_model.locked).toBe(true);
    expect(l.i2v_model.reason).toBe("첫 컷을 만들어 잠겼어요");
    expect(l.resolution.locked).toBe(true);
  });

  it("문서가 없거나 이상해도 던지지 않는다 — 화면이 죽으면 안 된다", () => {
    for (const bad of [null, undefined, {}, { cuts: null }]) {
      expect(() => lockedAxes(bad)).not.toThrow();
      expect(lockedAxes(bad).style.locked).toBe(false);
    }
  });
});
