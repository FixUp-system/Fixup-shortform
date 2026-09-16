import { describe, it, expect } from "vitest";
import { speechMismatch } from "../lib/reel/doc.js";

describe("speechMismatch — 말과 원고가 크게 다른가", () => {
  const said = { cuts: [{ video: { url: "u", whole: true, said: "가나다라마.\n바사아자차." } }] };

  it("문장 하나가 통째로 안 들렸으면 알린다", () => {
    const p = { ...said, reel: { speech: { units: [{ ok: true, start: 0, seconds: 2 }, { ok: false, start: null, seconds: null }], heard: { chars: 5, text: "가나다라마" } } } };
    expect(speechMismatch(p)?.reason).toBe("missing-sentence");
  });

  it("들은 양이 원고의 0.75 배 미만이면 알린다", () => {
    const p = { ...said, reel: { speech: { units: [{ ok: true, start: 0, seconds: 2 }, { ok: true, start: 3, seconds: 1 }], heard: { chars: 3, text: "가나다" } } } };
    expect(speechMismatch(p)?.reason).toBe("short");
  });

  it("정상이면 null 이다", () => {
    const p = { ...said, reel: { speech: { units: [{ ok: true, start: 0, seconds: 2 }, { ok: true, start: 3, seconds: 2 }], heard: { chars: 10, text: "가나다라마 바사아자차" } } } };
    expect(speechMismatch(p)).toBeNull();
  });

  it("측정이 없으면 null 이다 — 모르는 것을 경고하지 않는다", () => {
    expect(speechMismatch({ ...said, reel: {} })).toBeNull();
  });

  // ★★ 2026-09-16 리뷰 I4 — ok:false 는 순서·범위·이상치·들은 양 네 판정 어디에 걸려도
  //   붙는다. 이상치는 "말하지 않았다"가 아니라 "재기가 흔들렸다"다 — 근거 없는 경고는
  //   무시하게 된다(설계 §4.8). reason 이 "empty"가 아니면 missing-sentence 를 안 띄운다.
  it("이상치·순서·범위로 버려졌으면(reason이 empty가 아니면) 알리지 않는다", () => {
    const p = { ...said, reel: { speech: { units: [
      { ok: true, start: 0, seconds: 2 },
      { ok: false, start: null, seconds: null, reason: "outlier" },
    ], heard: { chars: 10, text: "가나다라마 바사아자차" } } } };
    expect(speechMismatch(p)).toBeNull();
  });

  it("낱말이 하나도 안 묶였으면(reason: empty) 알린다", () => {
    const p = { ...said, reel: { speech: { units: [
      { ok: true, start: 0, seconds: 2 },
      { ok: false, start: null, seconds: null, reason: "empty" },
    ], heard: { chars: 5, text: "가나다라마" } } } };
    expect(speechMismatch(p)?.reason).toBe("missing-sentence");
  });
});
