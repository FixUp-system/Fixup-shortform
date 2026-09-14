// 설정은 **돈을 치른 순간** 잠긴다 — 값이 컷마다 각인돼 있어서, 바꾸면 이미 만든 것이 낡는다.
// ★ 새 상태를 만들지 않는다: 여기서 보는 신호는 lib/reel/steps.js 의 도달 판정이 쓰는 것과 같다.
import { describe, it, expect } from "vitest";
import { lockedAxes } from "../lib/reel/locks.js";

const p = (extra = {}) => ({ id: "p1", settings: {}, ...extra });
const cut = (extra = {}) => ({ idx: 0, shows: "장면", ...extra });

describe("lockedAxes — 축마다 잠기는 때가 다르다", () => {
  it("아무것도 안 만들었으면 다 열려 있다", () => {
    // ★ 시나리오 확정 **전**이면 네 축(비율·길이·모델·화질)이 전부 열려 있다 —
    //   여기가 사장님이 값을 자유롭게 고칠 수 있는 유일한 구간이다.
    const l = lockedAxes(p());
    for (const k of ["aspect_ratio", "target_seconds", "style", "i2v_model", "resolution"]) {
      expect(l[k].locked, `${k} 가 잠겨 있다`).toBe(false);
      expect(l[k].reason).toBe("");
    }
  });

  it("★★ 시나리오를 확정하면 네 축(비율·길이·모델·화질)이 함께 잠긴다", () => {
    // 왜 모델·화질까지 여기서 잠그나 — 둘 다 **클립을 굽기 한참 전에** 이미 쓰인 값이라서다:
    //  ① 컷 수가 그 값에서 나온다 — scenario 라우트의 reelSceneCountRule(seconds, resolution,
    //     aspect_ratio, refAspectFor(모델)) 이 화질이 담는 칸 수와 모델의 참조 비율을 컷 수에
    //     먹인다. 확정 뒤에 바꾸면 이미 만든 컷 구조와 어긋난다.
    //  ② 정가가 그 값으로 걷히고 다시 안 센다 — ④이미지의 requireVideoCharge({seconds, model,
    //     resolution}) 뒤로는 chargeVideo 가 `if (active) return 0` 이라 값을 재비교하지 않는다.
    //     즉 **돈이 걷히는 자리보다 먼저** 잠가야 비싼 클립을 싼 값에 받는 창이 안 생긴다.
    const l = lockedAxes(p({ scenario: { text: "A 15-second commercial." } }));
    for (const k of ["aspect_ratio", "target_seconds", "i2v_model", "resolution"]) {
      expect(l[k].locked, `${k} 가 열려 있다`).toBe(true);
      expect(l[k].reason).toBe("시나리오를 확정해서 잠겼어요");
    }
    // ★ 화풍만 아직 열려 있다 — 그림을 한 장도 안 그렸다(이 갈림이 아래 판의 요지다).
    expect(l.style.locked).toBe(false);
    expect(l.style.reason).toBe("");
  });

  it("★ 첫 그림을 그리면 화풍이 잠긴다 — 화풍은 컷 수가 아니라 그림에만 들어간다", () => {
    const l = lockedAxes(p({
      scenario: { text: "t" },
      cuts: [cut({ image: { url: "/api/uploads/a.jpg" } }), cut({ idx: 1 })],
    }));
    expect(l.style.locked).toBe(true);
    expect(l.style.reason).toBe("첫 그림을 그려서 잠겼어요");
  });

  it("★★ 클립을 구워도 잠금이 더 늘지 않는다 — 네 축은 시나리오에서 이미 잠겼다", () => {
    // 한때 모델·화질을 여기서야(첫 클립) 잠갔다. 그 사이 구간이 돈 구멍이었다 —
    // 되돌리면 이 판이 "첫 컷을 만들어 잠겼어요" 같은 **늦은 사유**에서 깨진다.
    const l = lockedAxes(p({
      scenario: { text: "t" },
      cuts: [cut({ image: { url: "a" }, video: { url: "v" } })],
    }));
    expect(l.i2v_model.locked).toBe(true);
    expect(l.i2v_model.reason).toBe("시나리오를 확정해서 잠겼어요");
    expect(l.resolution.locked).toBe(true);
    expect(l.resolution.reason).toBe("시나리오를 확정해서 잠겼어요");
  });

  it("문서가 없거나 이상해도 던지지 않는다 — 화면이 죽으면 안 된다", () => {
    for (const bad of [null, undefined, {}, { cuts: null }]) {
      expect(() => lockedAxes(bad)).not.toThrow();
      expect(lockedAxes(bad).style.locked).toBe(false);
    }
  });
});
