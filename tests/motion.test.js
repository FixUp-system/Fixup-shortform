import { describe, it, expect } from "vitest";
import { MOTION_AXES, isMotionAxis, motionAxisFor, axesOf } from "../lib/motion.js";

describe("MOTION_AXES — 축 목록", () => {
  it("셋이고 순서가 카메라·피사체·배경이다", () => {
    expect(MOTION_AXES.map((a) => a.id)).toEqual(["camera", "subject", "ambient"]);
  });
  it("모든 축이 id·label·hint 를 갖는다", () => {
    for (const a of MOTION_AXES) {
      expect(typeof a.id).toBe("string");
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.hint.length).toBeGreaterThan(0);
    }
  });
  it("isMotionAxis 는 목록 밖을 거절한다", () => {
    expect(isMotionAxis("camera")).toBe(true);
    expect(isMotionAxis("lighting")).toBe(false);
    expect(isMotionAxis(null)).toBe(false);
  });
  it("motionAxisFor 는 목록의 항목을 돌려주고 밖은 null 이다", () => {
    expect(motionAxisFor("ambient")).toBe(MOTION_AXES[2]);
    expect(motionAxisFor("lighting")).toBe(null);
  });
});

describe("axesOf — 컷이 실제로 가진 축", () => {
  it("적힌 축만, 목록 순서로 돌려준다", () => {
    const cut = { ambient: "창밖으로 사람들이 지나간다", camera: "천천히 뒤로 물러난다" };
    expect(axesOf(cut)).toEqual([
      { id: "camera", text: "천천히 뒤로 물러난다" },
      { id: "ambient", text: "창밖으로 사람들이 지나간다" },
    ]);
  });
  it("빈 문자열·공백은 없는 것으로 본다", () => {
    expect(axesOf({ camera: "   ", subject: "" })).toEqual([]);
  });
  it("컷이 없어도 던지지 않는다", () => {
    expect(axesOf(null)).toEqual([]);
    expect(axesOf(undefined)).toEqual([]);
  });
});
