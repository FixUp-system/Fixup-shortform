import { describe, it, expect } from "vitest";
import { SPEEDS, DEFAULT_SPEED_ID, isSpeed, speedFor, speedContrast } from "../lib/speeds.js";
import { readFileSync } from "node:fs";

describe("SPEEDS — 속도 표", () => {
  it("id 가 중복되지 않고 라벨·클립 문구를 갖는다", () => {
    const ids = SPEEDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SPEEDS) {
      expect(s.label, `${s.id} 에 라벨이 없다`).toBeTruthy();
      expect(s.clip, `${s.id} 에 클립 문구가 없다`).toBeTruthy();
    }
  });

  it("기본은 느리게다 — 지금까지의 동작이 그것이었다", () => {
    expect(DEFAULT_SPEED_ID).toBe("slow");
    expect(speedFor(undefined).id).toBe("slow");
    expect(speedFor("없는값").id).toBe("slow");
  });

  it("닫힌 목록을 판정한다", () => {
    expect(isSpeed("extreme_slowmo")).toBe(true);
    expect(isSpeed("아주느리게")).toBe(false);
    expect(isSpeed(undefined)).toBe(false);
  });
});

describe("speedContrast — 대비가 있는가", () => {
  const cuts = (...speeds) => speeds.map((speed) => ({ speed }));

  // 실측(2026-07-30 농구화 광고): motion 이 자유 서술이던 동안 전 컷이 "천천히"로 수렴했다.
  it("전 컷이 같은 속도면 대비가 없다", () => {
    const v = speedContrast(cuts("slow", "slow", "slow"));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("느리게");
  });

  // 눈에는 같은 속도다 — 고유값만 세면 이것이 통과한다
  it("정지와 느리게만 섞인 것도 대비가 아니다", () => {
    const v = speedContrast(cuts("static", "slow", "static"));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("빠른 컷");
  });

  it("빠른 컷이 하나라도 있으면 통과한다", () => {
    expect(speedContrast(cuts("slow", "fast", "slow")).ok).toBe(true);
    expect(speedContrast(cuts("static", "realtime")).ok).toBe(true);
  });

  it("극단적 슬로모션 앞이 느리면 절정이 죽는다", () => {
    const v = speedContrast(cuts("fast", "slow", "extreme_slowmo", "realtime"));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("3번 컷");
  });

  it("극단적 슬로모션 앞이 빠르면 통과한다", () => {
    expect(speedContrast(cuts("realtime", "fast", "extreme_slowmo", "realtime")).ok).toBe(true);
  });

  it("첫 컷이 극단적 슬로모션인 것은 잡지 않는다 — 앞이 없다", () => {
    expect(speedContrast(cuts("extreme_slowmo", "fast")).ok).toBe(true);
  });

  // 속도를 안 받은 옛 프로젝트를 결함으로 만들면, 고칠 방법이 없는 경고가 뜬다
  it("속도가 없거나 컷이 하나면 판정하지 않는다", () => {
    expect(speedContrast([{ motion: "천천히" }, { motion: "빠르게" }]).ok).toBe(true);
    expect(speedContrast(cuts("slow")).ok).toBe(true);
    expect(speedContrast([]).ok).toBe(true);
    expect(speedContrast(undefined).ok).toBe(true);
  });
});

describe("lib/speeds.js 는 fs 를 끌고 오지 않는다", () => {
  it("import 가 없다", () => {
    const src = readFileSync("lib/speeds.js", "utf8");
    expect([...src.matchAll(/^\s*import\s.+$/gm)].map((m) => m[0])).toEqual([]);
  });
});
