import { describe, it, expect } from "vitest";
import { MOTION_AXES, isMotionAxis, motionAxisFor, axesOf, motionVariety } from "../lib/motion.js";

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

// ★ 정규화가 **여기** 있는 이유: 프롬프트(buildClipPrompt)·각인(clipKey)·화면이 전부 이
//   함수를 쓴다. 정규화를 프롬프트 쪽에만 두면 "마침표만 고쳐도 프롬프트는 그대로인데
//   각인만 달라져" 픽셀이 같은 mp4 를 다시 사게 된다(Task 3 리뷰 I-1).
describe("axesOf — 축 텍스트 정규화", () => {
  const textOf = (cut) => axesOf(cut).map((a) => a.text);

  it("끝 마침표를 걷어낸다 — 여러 개도 런 전체를 걷는다", () => {
    expect(textOf({ camera: "물러난다." })).toEqual(["물러난다"]);
    expect(textOf({ camera: "물러난다..." })).toEqual(["물러난다"]);
  });

  it("앞뒤 공백을 **먼저** 걷는다 — 그래야 '물러난다. .' 이 '물러난다..' 를 안 만든다", () => {
    expect(textOf({ camera: "물러난다. ." })).toEqual(["물러난다"]);
    expect(textOf({ camera: "  물러난다. .  " })).toEqual(["물러난다"]);
    expect(textOf({ camera: "물러난다.  " })).toEqual(["물러난다"]);
  });

  it("★ 마침표만 고친 값은 같은 텍스트로 수렴한다 — 각인이 흔들리지 않는다", () => {
    expect(textOf({ camera: "천천히 물러난다." })).toEqual(textOf({ camera: "천천히 물러난다" }));
  });

  it("! 와 ? 는 걷어내지 않는다 — 옛 motion 시절과 같아 회귀가 아니다", () => {
    expect(textOf({ camera: "확 다가간다!" })).toEqual(["확 다가간다!"]);
    expect(textOf({ camera: "다가갈까?" })).toEqual(["다가갈까?"]);
  });

  it("걷어내면 아무것도 안 남는 축은 없는 것으로 본다", () => {
    expect(axesOf({ camera: "." })).toEqual([]);
    expect(axesOf({ camera: " . . " })).toEqual([]);
    expect(textOf({ camera: ".", subject: "컵을 든다" })).toEqual(["컵을 든다"]);
  });
});

describe("motionVariety — 축이 한쪽으로 쏠렸는가", () => {
  const cuts = (...specs) => specs.map((s) => s);

  it("전 컷이 카메라 하나만 쓰면 되돌린다", () => {
    const v = motionVariety(cuts(
      { camera: "물러난다" }, { camera: "다가간다" }, { camera: "올려본다" }
    ));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("카메라");
  });

  it("전 컷이 피사체 하나뿐이어도 되돌린다 — 사유가 그 축을 가리킨다", () => {
    const v = motionVariety(cuts({ subject: "컵을 든다" }, { subject: "잔을 내려놓는다" }));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("피사체");
  });

  it("축이 섞이면 통과다", () => {
    expect(motionVariety(cuts(
      { camera: "물러난다" }, { subject: "컵을 든다" }, { ambient: "사람들이 지나간다" }
    )).ok).toBe(true);
  });

  it("한 컷이 여러 축을 쓰면 그것만으로도 다양하다", () => {
    expect(motionVariety(cuts(
      { camera: "물러난다", ambient: "김이 오른다" }, { camera: "다가간다" }
    )).ok).toBe(true);
  });

  it("컷이 둘 미만이면 판정하지 않는다", () => {
    expect(motionVariety([{ camera: "물러난다" }]).ok).toBe(true);
    expect(motionVariety([]).ok).toBe(true);
    expect(motionVariety(undefined).ok).toBe(true);
  });

  it("★ 축이 없는 컷은 셈에서 빠진다 — 옛 프로젝트가 재시도를 유발하면 안 된다", () => {
    expect(motionVariety(cuts({ motion: "회전한다" }, { motion: "흔들린다" })).ok).toBe(true);
  });

  it("축을 적은 컷이 하나뿐이면 판정하지 않는다 — 분포를 요구할 수 없다", () => {
    expect(motionVariety(cuts({ camera: "물러난다" }, { motion: "회전한다" })).ok).toBe(true);
  });

  it("통과할 때는 사유가 없다 — speedContrast·shotBalance 와 같은 반환형이다", () => {
    expect(motionVariety(cuts({ camera: "물러난다" }, { subject: "컵을 든다" })))
      .toEqual({ ok: true, reason: null });
  });
});
