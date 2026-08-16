import { describe, it, expect } from "vitest";
import { shotsToCuts } from "../lib/cuts.js";

const scenario = {
  angle: "아침의 준비",
  shots: [
    { beat: "문을 연다", line: "오늘도 문을 엽니다.", speaker: "20대 여성 바리스타", seconds: 8 },
    { beat: "원두를 간다", line: "", speaker: "", seconds: 7 },
  ],
};

describe("shotsToCuts", () => {
  it("shot 하나가 컷 하나다 — idx 는 0부터 코드가 매긴다", () => {
    const cuts = shotsToCuts(scenario);
    expect(cuts).toHaveLength(2);
    expect(cuts.map((c) => c.idx)).toEqual([0, 1]);
  });

  it("line 이 sentence 가 된다", () => {
    expect(shotsToCuts(scenario)[0].sentence).toBe("오늘도 문을 엽니다.");
  });

  it("★ 대사가 빈 장면은 silent 다", () => {
    const cuts = shotsToCuts(scenario);
    expect(cuts[0].silent).toBeUndefined();
    expect(cuts[1].silent).toBe(true);
    expect(cuts[1].sentence).toBe("");
  });

  // 자막이 머무는 시간이 spoken_seconds 다 — 무음 컷에 값을 주면 없는 자막이 시간을 먹는다
  it("★ spoken_seconds 는 대사 있는 컷만 seconds 와 같고, 무음 컷은 0 이다", () => {
    const cuts = shotsToCuts(scenario);
    expect(cuts[0].seconds).toBe(8);
    expect(cuts[0].spoken_seconds).toBe(8);
    expect(cuts[1].seconds).toBe(7);
    expect(cuts[1].spoken_seconds).toBe(0);
  });

  it("출처를 남긴다 — 어디서 나온 컷인지 나중에 구분해야 한다", () => {
    expect(shotsToCuts(scenario)[0].source).toBe("scenario");
    expect(shotsToCuts(scenario)[0].regen_count).toBe(0);
  });

  it("shots 가 없으면 빈 배열이다", () => {
    expect(shotsToCuts(null)).toEqual([]);
    expect(shotsToCuts({ shots: [] })).toEqual([]);
  });

  // ★ 화면 설계·캐스팅이 읽는 값이라 컷에 저장하지 않는다 — 컷 각인(clipKey)이 부풀면
  //   beat 만 고쳐도 값을 치른 클립이 낡는다
  it("★ beat·speaker 를 컷에 저장하지 않는다", () => {
    const cut = shotsToCuts(scenario)[0];
    expect(cut.beat).toBeUndefined();
    expect(cut.speaker).toBeUndefined();
  });
});
