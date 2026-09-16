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
});
