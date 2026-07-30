import { describe, it, expect } from "vitest";
import { buildCues, toAss, cutSeconds, subtitleStyle, lineWidthUnits, textUnits, MAX_SUBTITLE_LINES, splitSubtitleText, breakTwoLines } from "../lib/subtitles";

describe("자막을 절 경계에서 고르게 나눈다", () => {
  // 한 줄 11.21 · 두 줄 22.42 (1080×1920). 숫자를 박지 않고 같은 식에서 뽑는다.
  const MAX = lineWidthUnits({ width: 1080, height: 1920 }) * MAX_SUBTITLE_LINES;

  // 2026-07-30 완성본에서 눈으로 본 결함이다. ASS 에 "속당김이 심한 날, VT" 로 끝나고
  // 다음 자막이 "PDRN 시카 엑소좀" 으로 시작했다 — 제품명이 갈렸다.
  it("제품명을 가르지 않는다", () => {
    const s = "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 됩니다.";
    const pieces = splitSubtitleText(s, MAX);
    expect(pieces.join("")).toBe(s);                       // 원문 보존
    expect(pieces.some((p) => p.includes("VT PDRN"))).toBe(true);
    // "VT" 로 끝나는 조각이 있으면 제품명이 갈린 것이다
    expect(pieces.some((p) => p.trim().endsWith("VT"))).toBe(false);
  });

  it("관형어와 명사를 가르지 않는다 — 다음 날", () => {
    const s = "자기 전, 토너 후 2~3방울 얼굴에 펴 바르면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";
    const pieces = splitSubtitleText(s, MAX);
    expect(pieces.join("")).toBe(s);
    expect(pieces.some((p) => p.includes("다음 날"))).toBe(true);
    expect(pieces.some((p) => p.trim().endsWith("다음"))).toBe(false);
  });

  it("모든 조각이 두 줄 폭 안에 들어간다 — 세 줄이 되살아나지 않는다", () => {
    const samples = [
      "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 됩니다.",
      "자기 전, 토너 후 2~3방울 얼굴에 펴 바르면 다음 날 아침 당김이 덜하다는 후기가 많습니다.",
      "특히 20대 후반에서 30대 초반 여성들이 많이 찾고 재구매도 잦습니다.",
      "30ml에 39,000원으로, 환절기 피부 고민을 덜어줍니다.",
    ];
    for (const s of samples) {
      for (const p of splitSubtitleText(s, MAX)) {
        expect(textUnits(p.trim()), `조각이 두 줄을 넘는다: ${p}`).toBeLessThanOrEqual(MAX);
      }
    }
  });

  it("조각 수는 최소다 — 자막이 산만해지지 않게", () => {
    const s = "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 됩니다.";
    const need = Math.ceil(textUnits(s.trim()) / MAX);
    expect(splitSubtitleText(s, MAX).length).toBe(need);
  });

  // 절 경계가 없는 문장은 어절 경계로 떨어진다 — 그때도 원문과 두 줄 규칙은 지킨다.
  it("절 경계가 없으면 어절 경계로 나눈다", () => {
    const s = "환절기 아침 거울 속 얼굴이 조금씩 달라지는 것을 느끼는 사람들이 부쩍 늘었습니다";
    const pieces = splitSubtitleText(s, MAX);
    expect(pieces.join("")).toBe(s);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(textUnits(p.trim())).toBeLessThanOrEqual(MAX);
  });

  it("낱말 하나가 두 줄을 넘으면 그대로 둔다 — 글자 중간에서 자르지 않는다", () => {
    const s = "가".repeat(40);
    expect(splitSubtitleText(s, MAX)).toEqual([s]);
  });

  // 손으로 지어낸 동거리 사례다 — 실제 소재 문장에서 부동소수점이 정확히 같은 자리로
  // 떨어지는 경우를 자연히 만나기는 어렵다. 그래도 이 문자열은 실제 lib/subtitles.js 코드로
  // 재현된다: "하면" 뒤(절 경계)와 그 앞 어절 경계가 목표 폭에서 정확히 같은 거리다.
  // 절 우선 규칙을 되돌리면(diff < bestDiff 만 보고 절 여부를 안 보면) 이 테스트가 빨개진다
  // — 되돌려서 실제로 확인했다(task-2-report.md 참고).
  it("절 경계와 어절 경계가 목표 폭에 동거리이면 절 경계를 고른다", () => {
    const s = "a   aaa  하면 bbbbb bbbbbbbb";
    const pieces = splitSubtitleText(s, 5.6);
    expect(pieces.join("")).toBe(s);
    expect(pieces[0]).toBe("a   aaa  하면 ");
  });
});

describe("buildCues", () => {
  it("컷 길이를 누적해 시작·끝을 만든다", () => {
    const cues = buildCues([
      { sentence: "첫 문장", seconds: 4 },
      { sentence: "둘째 문장", seconds: 3.5 },
      { sentence: "셋째 문장", seconds: 2 },
    ]);
    expect(cues).toEqual([
      { start: 0, end: 4, text: "첫 문장" },
      { start: 4, end: 7.5, text: "둘째 문장" },
      { start: 7.5, end: 9.5, text: "셋째 문장" },
    ]);
  });

  it("빈 문장은 건너뛰되 시간은 흐른다", () => {
    // 자막은 없어도 그 컷의 영상은 재생된다 — 시간을 건너뛰면 뒤가 전부 밀린다
    const cues = buildCues([
      { sentence: "", seconds: 2 },
      { sentence: "둘째", seconds: 3 },
    ]);
    expect(cues).toEqual([{ start: 2, end: 5, text: "둘째" }]);
  });

  it("클립이 낭독보다 길어도 낭독만 누적한다 — 합성이 남는 클립을 잘라낸다", () => {
    // 눈금 올림(6·8·10…초)은 항상 클립을 낭독보다 길게 만든다. 예전에는 합성이 그
    // 차이를 무음으로 채워 클립 경계에서 다음 말이 시작됐지만, 이제 합성이 남는
    // 클립을 잘라내므로(lib/compose.js) 자막도 낭독 길이로만 누적하면 맞는다.
    const cues = buildCues([
      { sentence: "첫", seconds: 9, video: { seconds: 10 } },
      { sentence: "둘", seconds: 5, video: { seconds: 6 } },
      { sentence: "셋", seconds: 9, video: { seconds: 10 } },
    ]);
    expect(cues).toEqual([
      { start: 0, end: 9, text: "첫" },
      { start: 9, end: 14, text: "둘" },
      { start: 14, end: 23, text: "셋" },
    ]);
  });

  it("클립이 낭독보다 짧으면 낭독을 따른다 — 그 자리는 마지막 프레임을 늘려 메운다", () => {
    const cues = buildCues([
      { sentence: "첫", seconds: 13, video: { seconds: 10 } },
      { sentence: "둘", seconds: 4, video: { seconds: 6 } },
    ]);
    expect(cues).toEqual([
      { start: 0, end: 13, text: "첫" },
      { start: 13, end: 17, text: "둘" },
    ]);
  });

  it("컷이 없으면 빈 배열", () => {
    expect(buildCues([])).toEqual([]);
    expect(buildCues(null)).toEqual([]);
  });

  it("소수점이 쌓여도 두 자리로 유지한다", () => {
    const cues = buildCues([
      { sentence: "가", seconds: 1.1 },
      { sentence: "나", seconds: 2.2 },
      { sentence: "다", seconds: 3.3 },
    ]);
    expect(cues[2]).toEqual({ start: 3.3, end: 6.6, text: "다" });
  });
});

describe("toAss", () => {
  it("세이프존을 아래에서 18% 위에 둔다", () => {
    // 틱톡·릴스의 하단 UI(버튼·캡션)에 가리지 않게
    const ass = toAss([{ start: 0, end: 2, text: "가" }], { width: 1080, height: 1920 });
    expect(ass).toContain(",346,"); // 1920 * 0.18 = 345.6 → 346
    expect(ass).toContain("가");
  });

  it("시간을 ASS 형식으로 쓴다", () => {
    const ass = toAss([{ start: 4, end: 7.5, text: "나" }], { width: 1080, height: 1920 });
    expect(ass).toContain("0:00:04.00");
    expect(ass).toContain("0:00:07.50");
  });

  it("분·시를 넘어가도 형식이 맞는다", () => {
    const ass = toAss([{ start: 65, end: 3725, text: "다" }], { width: 1080, height: 1920 });
    expect(ass).toContain("0:01:05.00");
    expect(ass).toContain("1:02:05.00");
  });

  it("줄바꿈을 ASS 개행으로 바꾼다", () => {
    const ass = toAss([{ start: 0, end: 1, text: "첫 줄\n둘째 줄" }], { width: 1080, height: 1920 });
    expect(ass).toContain("첫 줄\\N둘째 줄");
    // 진짜 줄바꿈이 남으면 그 뒤가 다른 이벤트로 읽힌다
    expect(ass.split("Dialogue:").length).toBe(2);
  });

  it("비율이 다르면 여백도 그에 맞춰 바뀐다", () => {
    const ass = toAss([{ start: 0, end: 1, text: "가" }], { width: 1920, height: 1080 });
    expect(ass).toContain(",194,"); // 1080 * 0.18 = 194.4 → 194
    expect(ass).toContain("PlayResX: 1920");
  });
});

describe("cutSeconds — 한 컷이 완성본에서 차지하는 시간", () => {
  it("낭독이 있으면 낭독 길이다 — 클립이 길어도 잘라 쓴다", () => {
    // 눈금 올림 때문에 클립이 낭독보다 긴 것이 보통이다(낭독 3초 → 클립 6초).
    // 예전에는 긴 쪽을 써서 3초가 무음이 됐다.
    expect(cutSeconds({ seconds: 3, video: { seconds: 6 } })).toBe(3);
  });

  it("낭독이 클립보다 길면 낭독이다 — 상한을 넘어 잘린 클립은 늘려서 맞춘다", () => {
    expect(cutSeconds({ seconds: 25, video: { seconds: 20 } })).toBe(25);
  });

  it("낭독이 없으면 클립 길이로 떨어진다 — 목소리가 실패해도 합성은 돌아야 한다", () => {
    expect(cutSeconds({ video: { seconds: 6 } })).toBe(6);
    expect(cutSeconds({ seconds: 0, video: { seconds: 6 } })).toBe(6);
  });

  it("둘 다 없으면 0", () => {
    expect(cutSeconds({})).toBe(0);
    expect(cutSeconds(null)).toBe(0);
  });
});

describe("buildCues — 자막 자리가 낭독 합과 맞는다", () => {
  it("무음이 사라져 자막 누적이 낭독 합과 같다", () => {
    // 예전에는 뜨는 자리를 max(낭독,클립)로 누적해 자막이 갈수록 밀렸다.
    const cuts = [
      { seconds: 3, video: { seconds: 6 }, sentence: "첫 문장." },
      { seconds: 4, video: { seconds: 6 }, sentence: "둘째 문장." },
    ];
    const cues = buildCues(cuts);
    expect(cues[0]).toEqual({ start: 0, end: 3, text: "첫 문장." });
    expect(cues[1]).toEqual({ start: 3, end: 7, text: "둘째 문장." });
  });
});

describe("폭 재기 — 자막이 몇 자에서 넘치는가", () => {
  const V = { width: 1080, height: 1920 };   // 9:16
  const H = { width: 1920, height: 1080 };   // 16:9

  it("스타일 값이 지금 toAss 가 쓰던 것과 같다", () => {
    // 이 함수는 새 규칙이 아니라 toAss 안에 있던 셈을 꺼낸 것이다 — 값이 달라지면 안 된다
    expect(subtitleStyle(V)).toEqual({ fontSize: 81, marginH: 86, marginV: 346 });
    expect(subtitleStyle(H)).toEqual({ fontSize: 45, marginH: 154, marginV: 194 });
  });

  it("한 줄에 들어가는 한글은 9:16 에서 열한 자 남짓이다", () => {
    // (1080 - 86*2) / 81 = 11.2
    expect(lineWidthUnits(V)).toBeCloseTo(11.2, 1);
  });

  it("가로 영상은 한 줄이 훨씬 길다 — 한계가 비율을 따라간다", () => {
    // (1920 - 154*2) / 45 = 35.8
    expect(lineWidthUnits(H)).toBeCloseTo(35.8, 1);
    expect(lineWidthUnits(H)).toBeGreaterThan(lineWidthUnits(V));
  });

  it("한글은 한 칸, 숫자·영문은 반 칸, 공백은 그보다 좁게 센다", () => {
    expect(textUnits("가나다")).toBeCloseTo(3.0, 2);
    expect(textUnits("abc")).toBeCloseTo(1.5, 2);
    expect(textUnits("가 나")).toBeCloseTo(2.3, 2);
  });

  it("숫자가 섞이면 글자 수보다 좁다 — 글자 수로 재면 쓸데없이 나눈다", () => {
    const s = "바지 밑단은 3,000원";
    expect(s.length).toBe(13);
    expect(textUnits(s)).toBeLessThan(13);
  });

  it("두 줄이 한계다", () => {
    expect(MAX_SUBTITLE_LINES).toBe(2);
  });

  it("이모지는 한글만큼 넓게 센다 — 좁게 잡으면 세 줄로 넘친다", () => {
    expect(textUnits("✨")).toBeCloseTo(1.0, 2);
    expect(textUnits("🔥")).toBeCloseTo(1.0, 2);
    expect(textUnits("가🔥")).toBeCloseTo(2.0, 2);
  });
});

describe("splitSubtitleText — 두 줄을 넘으면 나눈다", () => {
  const MAX = 22.4;   // 9:16 두 줄

  it("한계 이하면 통째로 둔다", () => {
    const s = "화요일은 쉽니다.";
    expect(splitSubtitleText(s, MAX)).toEqual([s]);
  });

  it("한 컷에 문장이 둘이면 문장 경계에서 갈린다", () => {
    const s = "운동화를 세탁소에 맡기는 일이 많아졌습니다. 집에서 관리하기 번거롭고, 세탁 후 변형되기 쉬운 탓입니다.";
    const out = splitSubtitleText(s, MAX);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].trim().endsWith("많아졌습니다.")).toBe(true);
  });

  it("한 문장이 길면 어절 경계에서 갈리고 어느 조각도 한계를 넘지 않는다", () => {
    const s = "세탁소에서는 전문적인 장비와 세제를 사용하여 운동화를 새것처럼 만들어줍니다.";
    const out = splitSubtitleText(s, MAX);
    expect(out.length).toBeGreaterThan(1);
    for (const p of out) expect(textUnits(p.trim())).toBeLessThanOrEqual(MAX);
  });

  it("이어붙이면 원문과 글자 그대로 같다 — 이것이 보장이다", () => {
    const s = "세탁소에서는 전문적인 장비와 세제를 사용하여 운동화를 새것처럼 만들어줍니다. 그래서 많은 분들이 맡기러 오십니다.";
    expect(splitSubtitleText(s, MAX).join("")).toBe(s);
  });

  it("어절 경계가 없는 덩어리는 한계를 넘어도 그대로 둔다 — 글자 중간을 자르지 않는다", () => {
    const s = "아주아주아주긴한덩어리로이어져서끊을자리가전혀없는말입니다";
    expect(splitSubtitleText(s, MAX)).toEqual([s]);
  });

  it("빈 글은 빈 배열", () => {
    expect(splitSubtitleText("", MAX)).toEqual([]);
    expect(splitSubtitleText(null, MAX)).toEqual([]);
  });

  it("공백만 있는 글도 이어붙이면 원문과 같다 — 보장에 예외를 두지 않는다", () => {
    expect(splitSubtitleText("   ", MAX).join("")).toBe("   ");
    expect(splitSubtitleText("", MAX)).toEqual([]);
    expect(splitSubtitleText(null, MAX)).toEqual([]);
  });
});

describe("breakTwoLines — 줄바꿈을 코드가 넣는다", () => {
  const LINE = 11.2;   // 9:16 한 줄

  it("한 줄에 들면 그대로 둔다", () => {
    expect(breakTwoLines("화요일은 쉽니다.", LINE)).toBe("화요일은 쉽니다.");
  });

  it("넘치면 어절 경계에 줄바꿈 하나를 넣는다", () => {
    const out = breakTwoLines("전문적인 장비와 세제를 사용하여", LINE);
    expect(out.split("\n")).toHaveLength(2);
    // 낱말 중간에서 끊기지 않는다
    for (const line of out.split("\n")) expect(line.trim()).toBe(line);
    expect(out.replace("\n", " ")).toBe("전문적인 장비와 세제를 사용하여");
  });

  it("두 줄 길이가 비슷해진다 — 자동 줄바꿈이 만드는 한 줄짜리 꼬리를 피한다", () => {
    const out = breakTwoLines("전문적인 장비와 세제를 사용하여", LINE);
    const [a, b] = out.split("\n").map(textUnits);
    expect(Math.abs(a - b)).toBeLessThan(LINE);
  });

  it("낱말이 하나면 넘쳐도 자르지 않는다", () => {
    const s = "아주아주아주긴한덩어리로이어져서";
    expect(breakTwoLines(s, LINE)).toBe(s);
  });
});

describe("buildCues — 컷 하나가 자막 여러 개를 낸다", () => {
  const V = { width: 1080, height: 1920 };
  const LONG = "세탁소에서는 전문적인 장비와 세제를 사용하여 운동화를 새것처럼 만들어줍니다.";

  it("치수를 주지 않으면 나누지 않는다 — 옛 호출을 그대로 받는다", () => {
    expect(buildCues([{ sentence: LONG, seconds: 6 }])).toEqual([
      { start: 0, end: 6, text: LONG },
    ]);
  });

  it("치수를 주면 한 컷이 여러 자막이 된다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }], V);
    expect(cues.length).toBeGreaterThan(1);
  });

  it("마지막 자막의 끝이 컷의 끝과 정확히 같다 — 오차가 다음 컷으로 안 넘어간다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }, { sentence: "화요일은 쉽니다.", seconds: 2 }], V);
    const first = cues.filter((c) => c.end <= 6);
    expect(first[first.length - 1].end).toBe(6);
    expect(cues[cues.length - 1].end).toBe(8);
  });

  it("자막끼리 겹치지 않고 시간이 뒤로만 간다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }, { sentence: LONG, seconds: 6 }], V);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end);
      expect(cues[i].end).toBeGreaterThan(cues[i].start);
    }
  });

  it("자막을 이어붙이면 컷 문장과 같다 — 줄바꿈과 공백만 다르다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }], V);
    const joined = cues.map((c) => c.text.replace(/\n/g, " ")).join(" ").replace(/\s+/g, "");
    expect(joined).toBe(LONG.replace(/\s+/g, ""));
  });

  it("긴 조각에는 줄바꿈이 들어간다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }], V);
    expect(cues.some((c) => c.text.includes("\n"))).toBe(true);
  });

  it("빈 문장은 큐를 안 만들되 시간은 흐른다 — 치수를 줘도 그대로다", () => {
    const cues = buildCues([{ sentence: "", seconds: 2 }, { sentence: "둘째", seconds: 3 }], V);
    expect(cues).toEqual([{ start: 2, end: 5, text: "둘째" }]);
  });

  it("낭독이 없으면 클립 길이를 나눠 쓴다 — 목소리가 실패해도 자막은 나온다", () => {
    const cues = buildCues([{ sentence: LONG, video: { seconds: 6 } }], V);
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[cues.length - 1].end).toBe(6);
  });
});
