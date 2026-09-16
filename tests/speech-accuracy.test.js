// 발음 정확도 — 표기 차이는 오독으로 세지 않고, 진짜 오독만 짚는다.
//
// ★ 근거: 2026-09-16 실측(표본 2편). 낱말 단위로는 70% 로 보이던 두 편이, 읽는 꼴로
//   바꾸고 공백·문장부호를 지운 뒤 글자 단위로 재니 93% · 100% 였다. 남은 어긋남만이
//   진짜 오독(`밴드`→"벤트")이다.
import { describe, it, expect } from "vitest";
import { readingForm, speechAccuracy } from "../lib/speech-accuracy.js";

describe("readingForm — 읽는 꼴", () => {
  it("숫자를 한자수로 읽는다", () => {
    expect(readingForm("3분")).toBe("삼분");
    expect(readingForm("15초")).toBe("십오초");
    expect(readingForm("10명")).toBe("십명");
    expect(readingForm("20개")).toBe("이십개");
  });

  it("라틴 낱자를 한글 음으로 옮긴다", () => {
    expect(readingForm("V라인")).toBe("브이라인");
    expect(readingForm("MBTI")).toBe("엠비티아이");
  });

  it("흔한 단위를 옮긴다 — 숫자 뒤일 때만", () => {
    expect(readingForm("30%")).toBe("삼십퍼센트");
    expect(readingForm("500mg")).toBe("오영영밀리그램");
    expect(readingForm("2ml")).toBe("이밀리리터");
    expect(readingForm("5g")).toBe("오그램");
    // 낱말 속 g 는 단위가 아니다 — 낱자 음으로만 간다.
    expect(readingForm("green")).toBe("지알이이엔");
  });

  it("빈 입력은 빈 문자열", () => {
    expect(readingForm("")).toBe("");
    expect(readingForm(null)).toBe("");
  });
});

describe("speechAccuracy — 표기 차이는 오독이 아니다", () => {
  it("V라인 ↔ 브이라인 은 어긋남이 없다", () => {
    const r = speechAccuracy("V라인 리프팅 디바이스", "브이라인 리프팅 디바이스");
    expect(r.ratio).toBe(1);
    expect(r.spans).toEqual([]);
  });

  it("3분 ↔ 삼분 은 어긋남이 없다", () => {
    const r = speechAccuracy("하루 3분이면 돼요.", "하루 삼 분이면 돼요");
    expect(r.ratio).toBe(1);
    expect(r.spans).toEqual([]);
  });

  it("띄어쓰기 분절은 어긋남이 아니다", () => {
    const r = speechAccuracy("턱선을 당겨 주는 밴드", "턱선을 당겨주는 밴드");
    expect(r.ratio).toBe(1);
    expect(r.spans).toEqual([]);
  });

  it("문장부호가 달라도 어긋남이 아니다", () => {
    const r = speechAccuracy("정말, 쉽죠?", "정말 쉽죠");
    expect(r.ratio).toBe(1);
  });
});

describe("speechAccuracy — 진짜 오독은 잡는다", () => {
  it("밴드 → 벤트 를 덩어리로 짚는다", () => {
    const r = speechAccuracy("밴드를 붙여요", "벤트를 붙여요");
    expect(r.ratio).toBeLessThan(1);
    expect(r.chars).toBe(6);
    expect(r.spans).toEqual([{ said: "밴드", heard: "벤트", at: 0 }]);
  });

  it("떨어져 있는 오독은 덩어리가 둘이다", () => {
    const r = speechAccuracy("갸름한 턱선과 쿠션이", "갸늘한 턱선과 쿠션아");
    expect(r.spans.length).toBe(2);
    expect(r.spans[0]).toMatchObject({ said: "름", heard: "늘" });
    expect(r.spans[1]).toMatchObject({ said: "이", heard: "아" });
    // at 은 보낸 글자(공백 제거 후)에서의 자리다.
    expect(r.spans[0].at).toBe(1);
  });

  it("들은 말이 짧으면 비율이 떨어진다", () => {
    const r = speechAccuracy("하나 둘 셋 넷", "하나 둘");
    expect(r.chars).toBe(5);
    expect(r.ratio).toBeCloseTo(3 / 5, 5);
  });
});

describe("speechAccuracy — 가장자리", () => {
  it("보낸 글자가 없으면 정확도 1, 잴 것이 없다", () => {
    expect(speechAccuracy("", "무슨 말이든")).toEqual({ ratio: 1, chars: 0, spans: [] });
    expect(speechAccuracy("   ", "무슨 말이든")).toEqual({ ratio: 1, chars: 0, spans: [] });
    expect(speechAccuracy(null, null)).toEqual({ ratio: 1, chars: 0, spans: [] });
  });

  it("들은 말이 비었으면 정확도 0 — 덩어리는 담지 않는다", () => {
    const r = speechAccuracy("밴드를 붙여요", "");
    expect(r).toEqual({ ratio: 0, chars: 6, spans: [] });
    expect(speechAccuracy("밴드를 붙여요", null).ratio).toBe(0);
  });

  it("덩어리는 10개까지만 담는다 — 문서가 커지면 안 된다", () => {
    const heads = ["가", "나", "다", "라", "바", "사", "자", "차", "카", "타", "파", "하"];
    const said = heads.map((c) => `${c}마`).join("");
    const heard = heads.map(() => "응마").join("");
    const r = speechAccuracy(said, heard);
    expect(r.chars).toBe(24);
    expect(r.ratio).toBeCloseTo(12 / 24, 5);
    expect(r.spans.length).toBe(10); // 실제 어긋남은 12곳이지만 10개에서 끊는다
  });
});
