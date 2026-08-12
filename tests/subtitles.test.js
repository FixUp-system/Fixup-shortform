import { describe, it, expect } from "vitest";
import { buildCues, toAss, cutSeconds, subtitleStyle, lineWidthUnits, textUnits, MAX_SUBTITLE_LINES, splitSubtitleText, breakTwoLines } from "../lib/subtitles";
import {
  SUBTITLE_FONTS, DEFAULT_SUBTITLE, normalizeSubtitle, outlineFor, clampPos, SIZE_MIN, SIZE_MAX,
} from "../lib/subtitles.js";

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

  // 절 경계가 n-1개 이상이라 절 경계만으로 시도하지만, 그 경계가 나쁜 자리에 있어
  // (끝 조각이 두 줄을 넘는다) 실패한다. 이때 바로 그리디(packWords)로 던지면
  // 절 경계 사이에 있던, 목표 폭에 더 가까운 어절 경계를 한 번도 못 본 채 진다.
  // 폭을 넓혀 재시도해야 이 어절 경계가 후보에 든다.
  // 재시도를 없애면(firstPool 실패 시 바로 packWords) 이 테스트가 빨개진다 — 직접
  // 확인했다: greedy 결과는 "…늘어지는 문장을 좀 " / "더 이어서…" 로 갈린다.
  it("절 경계 시도가 넘치면 어절 경계까지 넓혀 재시도한다 — 그리디로 바로 안 던진다", () => {
    const s = "아침저녁으로 춥고 매우 길게 늘어지는 문장을 좀 더 이어서 자리를 찾아야 합니다";
    const pieces = splitSubtitleText(s, MAX);
    expect(pieces.join("")).toBe(s);
    // 재시도가 고르는 자리(목표 폭에 더 가깝다): "…늘어지는 " 뒤에서 갈린다
    expect(pieces[0]).toBe("아침저녁으로 춥고 매우 길게 늘어지는 ");
    // 그리디였다면 "문장을 좀 " 까지 채웠을 것이다 — 그 자리에서 안 갈린다
    expect(pieces.some((p) => p.trim().endsWith("문장을 좀"))).toBe(false);
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
      { sentence: "첫", seconds: 9, audio: { url: "a0" }, video: { seconds: 10 } },
      { sentence: "둘", seconds: 5, audio: { url: "a1" }, video: { seconds: 6 } },
      { sentence: "셋", seconds: 9, audio: { url: "a2" }, video: { seconds: 10 } },
    ]);
    expect(cues).toEqual([
      { start: 0, end: 9, text: "첫" },
      { start: 9, end: 14, text: "둘" },
      { start: 14, end: 23, text: "셋" },
    ]);
  });

  it("클립이 낭독보다 짧으면 낭독을 따른다 — 그 자리는 마지막 프레임을 늘려 메운다", () => {
    const cues = buildCues([
      { sentence: "첫", seconds: 13, audio: { url: "a0" }, video: { seconds: 10 } },
      { sentence: "둘", seconds: 4, audio: { url: "a1" }, video: { seconds: 6 } },
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
    expect(cutSeconds({ seconds: 3, audio: { url: "a0" }, video: { seconds: 6 } })).toBe(3);
  });

  it("낭독이 클립보다 길면 낭독이다 — 상한을 넘어 잘린 클립은 늘려서 맞춘다", () => {
    expect(cutSeconds({ seconds: 25, audio: { url: "a0" }, video: { seconds: 20 } })).toBe(25);
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

describe("cutSeconds — 말하는 컷은 받은 클립 길이가 기준이다", () => {
  it("소리 파일이 있으면 낭독이 기준이다 — 합성이 클립을 거기 맞춰 자른다", () => {
    expect(cutSeconds({ seconds: 3, audio: { url: "a0" }, video: { seconds: 5 } })).toBe(3);
  });

  // ★ 주문한 초(3)가 아니라 받은 초(4)가 기준이다 — Seedance 하한이 4초라 반드시 벌어진다.
  //   주문한 초로 자막을 깔면 컷마다 1초씩 밀린다.
  it("소리 파일이 없으면 받은 클립 길이가 기준이다 — 자를 수 없다", () => {
    expect(cutSeconds({ idx: 0, seconds: 3, video: { seconds: 4 } })).toBe(4);
  });

  it("클립이 아직 없으면 추정으로 떨어진다 — 화면이 그래도 뭔가 보여야 한다", () => {
    expect(cutSeconds({ idx: 0, seconds: 3 })).toBe(3);
  });

  // ★★ 판정이 **컷마다** 따로여야 한다. 모델만 Seedance 로 바꿔도 옛 Kling 클립은 남는다
  //    (clipKey 에 모델 id 가 없다). 프로젝트 한 번으로 정하면 합성(buildFfmpegArgs 의 fit)
  //    과 자를 달리 써서 그 컷들이 통째로 어긋난다.
  it("한 프로젝트 안에서도 컷마다 기준이 갈린다", () => {
    const 옛컷 = { idx: 0, seconds: 3, audio: { url: "a0" }, video: { seconds: 4 } };
    const 말하는컷 = { idx: 1, seconds: 3, video: { seconds: 4 } };
    expect(cutSeconds(옛컷)).toBe(3);       // 합성이 3초로 자른다
    expect(cutSeconds(말하는컷)).toBe(4);   // 합성이 안 자른다
  });
});

describe("buildCues — 자막 자리가 낭독 합과 맞는다", () => {
  it("무음이 사라져 자막 누적이 낭독 합과 같다", () => {
    // 예전에는 뜨는 자리를 max(낭독,클립)로 누적해 자막이 갈수록 밀렸다.
    const cuts = [
      { seconds: 3, audio: { url: "a0" }, video: { seconds: 6 }, sentence: "첫 문장." },
      { seconds: 4, audio: { url: "a1" }, video: { seconds: 6 }, sentence: "둘째 문장." },
    ];
    const cues = buildCues(cuts);
    expect(cues[0]).toEqual({ start: 0, end: 3, text: "첫 문장." });
    expect(cues[1]).toEqual({ start: 3, end: 7, text: "둘째 문장." });
  });

  // ★ 말하는 컷에서는 자막이 **받은 클립 길이**로 흘러야 한다.
  // 합성이 말하는 클립을 자르지 않으므로(소리가 그 안에 있다) 컷 하나가 실제로 차지하는
  // 시간은 클립 길이다. 낭독 추정으로 누적하면 컷마다 그 차이만큼 자막이 앞선다 —
  // Seedance 하한이 4초라 3초짜리 컷에서 반드시 1초씩 벌어지고, 컷 8개면 마지막에 7초다.
  describe("말하는 컷 — 자막도 받은 클립 길이로 흐른다", () => {
    it("소리 파일이 없는 컷은 컷 길이도 자막 길이도 클립 길이다", () => {
      const cues = buildCues([
        { idx: 0, seconds: 3, video: { seconds: 4 }, sentence: "첫 문장." },
        { idx: 1, seconds: 3, video: { seconds: 4 }, sentence: "둘째 문장." },
      ]);
      // ★ 뜨는 자리(start)만이 아니라 머무는 시간(end)도 클립 길이여야 한다 —
      //   span 이 낭독이면 컷 안에서 자막이 1초 일찍 사라진다.
      expect(cues[0]).toEqual({ start: 0, end: 4, text: "첫 문장." });
      expect(cues[1]).toEqual({ start: 4, end: 8, text: "둘째 문장." });
    });

    // ★★ 혼합 프로젝트 — 소리 파일이 있는 옛 컷은 합성이 낭독(3초)으로 자른다.
    //    자막이 클립 길이(4초)로 흐르면 둘째 컷부터 1초씩 **뒤로** 밀린다.
    it("소리 파일이 있는 옛 컷이 섞이면 그 컷만 낭독으로 흐른다", () => {
      const cues = buildCues([
        { idx: 0, seconds: 3, audio: { url: "a0" }, video: { seconds: 4 }, sentence: "첫 문장." },
        { idx: 1, seconds: 3, video: { seconds: 4 }, sentence: "둘째 문장." },
      ]);
      expect(cues[0]).toEqual({ start: 0, end: 3, text: "첫 문장." });
      // 둘째 컷은 첫 컷의 **실제 점유**(3초)에서 시작한다 — 4초에서 시작하면 밀린 것이다
      expect(cues[1]).toEqual({ start: 3, end: 7, text: "둘째 문장." });
    });
  });
});

describe("폭 재기 — 자막이 몇 자에서 넘치는가", () => {
  const V = { width: 1080, height: 1920 };   // 9:16
  const H = { width: 1920, height: 1080 };   // 16:9

  it("스타일 값이 지금 toAss 가 쓰던 것과 같다", () => {
    // 이 함수는 새 규칙이 아니라 toAss 안에 있던 셈을 꺼낸 것이다 — 값이 달라지면 안 된다
    // (alignment 는 나중에 붙은 위치 키다 — 기본값 2 = 하단 중앙이라 그림은 그대로다)
    expect(subtitleStyle(V)).toEqual({ fontSize: 81, marginH: 86, marginV: 346, alignment: 2 });
    expect(subtitleStyle(H)).toEqual({ fontSize: 45, marginH: 154, marginV: 194, alignment: 2 });
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

describe("자막 위치", () => {
  const size = { width: 1080, height: 1920 };

  it("기본은 아래다 — 지금 동작과 픽셀 단위로 같다", () => {
    const s = subtitleStyle(size);
    expect(s.alignment).toBe(2);              // ASS 숫자패드: 2 = 하단 중앙
    expect(s.marginV).toBe(Math.round(1920 * 0.18));
    // position 을 명시해도 같아야 한다
    expect(subtitleStyle({ ...size, position: "bottom" })).toEqual(s);
  });

  it("중간은 세로 여백이 0 이다 — 중앙 정렬이라 무의미하다", () => {
    const s = subtitleStyle({ ...size, position: "middle" });
    expect(s.alignment).toBe(5);              // 5 = 중간 중앙
    expect(s.marginV).toBe(0);
  });

  it("위는 상단 UI 를 피한다", () => {
    const s = subtitleStyle({ ...size, position: "top" });
    expect(s.alignment).toBe(8);              // 8 = 상단 중앙
    expect(s.marginV).toBe(Math.round(1920 * 0.12));
  });

  it("모르는 값은 조용히 아래로 떨어진다 — 자막이 안 나오는 것보다 낫다", () => {
    expect(subtitleStyle({ ...size, position: "뒤죽박죽" }).alignment).toBe(2);
    // 프로토타입에서 물려받은 이름도 "모르는 값"이다 — 표에 없으면 아래다
    expect(subtitleStyle({ ...size, position: "constructor" }).alignment).toBe(2);
  });

  it("글자 크기와 가로 여백은 위치와 무관하다", () => {
    const b = subtitleStyle({ ...size, position: "bottom" });
    for (const p of ["middle", "top"]) {
      const s = subtitleStyle({ ...size, position: p });
      expect(s.fontSize).toBe(b.fontSize);
      expect(s.marginH).toBe(b.marginH);
    }
  });

  it("ASS 스타일 줄에 고른 정렬과 여백이 실린다", () => {
    const ass = toAss([{ start: 0, end: 1, text: "가" }], { ...size, position: "top" });
    const style = ass.split("\n").find((l) => l.startsWith("Style: Main"));
    const f = style.split(",");
    // Format: Name,Fontname,Fontsize,Primary,Outline,Back,Bold,BorderStyle,Outline,Shadow,
    //         Alignment,MarginL,MarginR,MarginV,Encoding
    expect(f[10]).toBe("8");                                    // Alignment
    expect(f[13]).toBe(String(Math.round(1920 * 0.12)));        // MarginV
  });

  it("position 을 안 주면 ASS 도 지금과 같다", () => {
    const ass = toAss([{ start: 0, end: 1, text: "가" }], size);
    const f = ass.split("\n").find((l) => l.startsWith("Style: Main")).split(",");
    expect(f[10]).toBe("2");
    expect(f[13]).toBe(String(Math.round(1920 * 0.18)));
  });
});

describe("자막 설정 — 자유롭되 코드가 막는다", () => {
  it("기본값이 있다", () => {
    expect(DEFAULT_SUBTITLE).toEqual({ pos: [0.5, 0.82], font: "basic", color: "#FFFFFF", size: 1 });
  });

  it("폰트는 셋이고 basic 이 기본이다", () => {
    expect(SUBTITLE_FONTS.map((f) => f.id)).toEqual(["basic", "impact", "soft"]);
    expect(SUBTITLE_FONTS.every((f) => f.label && f.family)).toBe(true);
  });

  // ★ 목록 밖 값은 조용히 기본으로 — 자막 하나 때문에 합성이 죽으면 안 된다
  it("모르는 폰트·잘못된 색은 기본으로 떨어진다", () => {
    expect(normalizeSubtitle({ font: "코믹산스" }).font).toBe("basic");
    expect(normalizeSubtitle({ color: "빨강" }).color).toBe("#FFFFFF");
    expect(normalizeSubtitle({ color: "#GGG" }).color).toBe("#FFFFFF");
    expect(normalizeSubtitle(null)).toEqual(DEFAULT_SUBTITLE);
    expect(normalizeSubtitle("문자열")).toEqual(DEFAULT_SUBTITLE);
  });

  it("색은 대소문자를 가리지 않고 #RRGGBB 로 정규화한다", () => {
    expect(normalizeSubtitle({ color: "#ffcc00" }).color).toBe("#FFCC00");
  });

  it("크기는 0.7~1.6 안으로 되돌린다", () => {
    expect(normalizeSubtitle({ size: 0.1 }).size).toBe(SIZE_MIN);
    expect(normalizeSubtitle({ size: 9 }).size).toBe(SIZE_MAX);
    expect(normalizeSubtitle({ size: 1.2 }).size).toBe(1.2);
    expect(normalizeSubtitle({ size: "크게" }).size).toBe(1);
  });

  // 화면 슬라이더가 이 상수를 그대로 쓴다 — 두 벌로 적히면 슬라이더 끝과 저장값이 갈린다
  it("크기 한계를 화면이 쓸 수 있게 내놓는다", () => {
    expect([SIZE_MIN, SIZE_MAX]).toEqual([0.7, 1.6]);
  });

  // 빈칸은 "안 골랐다"지 0 이 아니다 — Number("") 가 0 이라 최소 크기로 튀던 자리
  it("빈칸·null 은 최소가 아니라 기본 크기다", () => {
    expect(normalizeSubtitle({ size: "" }).size).toBe(1);
    expect(normalizeSubtitle({ size: null }).size).toBe(1);
  });

  // ★ 이 저장소는 프로토타입 이름으로 두 번 데었다(subtitleStyle 의 hasOwn). 단정으로 잠근다 —
  // 누가 SUBTITLE_FONTS 를 객체 맵으로 바꾸는 순간 조용히 되살아난다.
  it("프로토타입에서 물려받은 이름은 폰트가 아니다", () => {
    for (const k of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(normalizeSubtitle({ font: k }).font).toBe("basic");
    }
  });

  // 드래그가 만든 0.5000001 이 그대로 저장되면 각인이 달라져 눈에 안 보이는 재굽기가 뜬다
  it("위치·크기를 양자화한다 — 보이지 않는 재굽기를 막는다", () => {
    expect(normalizeSubtitle({ pos: [0.5000001, 0.8199999] }).pos).toEqual([0.5, 0.82]);
    expect(normalizeSubtitle({ size: 1.2000001 }).size).toBe(1.2);
  });

  // ★ 화면 밖으로 나가면 자막이 안 보인다 — 안전 여백 6%
  it("위치는 안전 여백 안으로 되돌린다", () => {
    expect(clampPos([0.5, 0.82])).toEqual([0.5, 0.82]);
    expect(clampPos([-1, 2])).toEqual([0.06, 0.94]);
    expect(clampPos([0.02, 0.01])).toEqual([0.06, 0.06]);
    expect(clampPos(["가", null])).toEqual([0.5, 0.82]);
    expect(clampPos(undefined)).toEqual([0.5, 0.82]);
  });

  // ★ 배경을 분석하지 않는다 — 글자색의 반대 명도로 외곽선을 정하면 어디서든 읽힌다
  it("밝은 글자는 검정 외곽, 어두운 글자는 흰 외곽", () => {
    expect(outlineFor("#FFFFFF")).toBe("#000000");
    expect(outlineFor("#FFCC00")).toBe("#000000");
    expect(outlineFor("#000000")).toBe("#FFFFFF");
    expect(outlineFor("#203040")).toBe("#FFFFFF");
  });

  it("normalizeSubtitle 은 위치도 함께 되돌린다", () => {
    expect(normalizeSubtitle({ pos: [5, 5] }).pos).toEqual([0.94, 0.94]);
  });
});

describe("toAss — 자막 설정을 싣는다", () => {
  const cues = [{ start: 0, end: 2, text: "안녕하세요" }];
  const size = { width: 1080, height: 1920 };

  const styleOf = (ass) => ass.split("\n").find((l) => l.startsWith("Style: Main")).split(",");

  it("설정을 안 주면 지금과 같다 — 옛 완성본이 낡지 않는다", () => {
    const f = styleOf(toAss(cues, { ...size }));
    expect(f[1]).toBe("Pretendard");
    expect(f[2]).toBe("81");            // 1920 * 0.042
    expect(f[3]).toBe("&H00FFFFFF");    // 흰 글자
    expect(f[4]).toBe("&H00000000");    // 검정 외곽
    expect(f[10]).toBe("2");            // 하단 중앙 — 값을 잰다("Alignment" 낱말은 헤더에 늘 있다)
    expect(f[13]).toBe("346");          // 1920 * 0.18
  });

  // ★★ 정작 위험한 건 undefined 가 아니라 **기본값을 명시로 넘긴 경우**다.
  // 뒤 태스크가 subtitle 을 항상 넘기기 시작하면, 여기가 어긋난 순간 모든 기본 프로젝트의
  // 자막이 조용히 이동한다 — 각인은 기본값이면 머리를 안 붙이니 "안 낡음"이라 아무도 못 본다.
  it("기본값을 명시로 넘겨도 오늘과 같은 자리다 — 픽셀 동일", () => {
    const old = styleOf(toAss(cues, { ...size }));
    const now = styleOf(toAss(cues, { ...size, subtitle: DEFAULT_SUBTITLE }));
    expect(now[1]).toBe(old[1]);        // 폰트
    expect(now[2]).toBe(old[2]);        // 글자 크기
    expect(now[3]).toBe(old[3]);        // 글자색
    expect(now[4]).toBe(old[4]);        // 외곽선
    // \pos 를 쓰면 Alignment 는 기준점이다. 2(하단)여야 pos.y 가 **글자 블록의 아랫변**이 된다 —
    // 5(가운데)면 같은 좌표라도 블록 중심이 와서 줄 수만큼 아래로 내려간다.
    expect(now[10]).toBe("2");
    // 아랫변이 오늘의 세이프존과 같은 자리다: 1920 - 346 = 1574 = 0.82 * 1920
    expect(toAss(cues, { ...size, subtitle: DEFAULT_SUBTITLE })).toContain("\\pos(540,1574)");
    expect(1920 - Number(old[13])).toBe(Math.round(1920 * 0.82));
  });

  it("폰트를 실는다", () => {
    const ass = toAss(cues, { ...size, subtitle: { font: "impact" } });
    expect(ass).toContain("Black Han Sans");
  });

  // ★ ASS 색은 &HAABBGGRR — RGB 가 아니라 **BGR 역순**이다. 뒤집으면 빨강이 파랑이 된다.
  it("색을 BGR 로 뒤집어 싣는다", () => {
    const ass = toAss(cues, { ...size, subtitle: { color: "#FF0000" } });
    expect(ass).toContain("&H000000FF");   // 빨강 = BGR 00 00 FF
  });

  it("외곽선은 코드가 정한다 — 밝은 글자면 검정", () => {
    const ass = toAss(cues, { ...size, subtitle: { color: "#FFCC00" } });
    expect(ass).toContain("&H00000000");   // 검정 외곽
  });

  it("어두운 글자면 흰 외곽", () => {
    const ass = toAss(cues, { ...size, subtitle: { color: "#101010" } });
    expect(ass).toContain("&H00FFFFFF");
  });

  it("크기 배율이 글자 크기에 곱해진다", () => {
    const base = toAss(cues, { ...size });
    const big = toAss(cues, { ...size, subtitle: { size: 1.5 } });
    const num = (s) => Number(s.match(/Style: Main,[^,]+,(\d+)/)[1]);
    expect(num(big)).toBe(Math.round(num(base) * 1.5));
  });

  // ★ 자유 위치는 \pos 로 절대 좌표를 준다 — Alignment 만으로는 아홉 칸뿐이다.
  // 그 좌표의 뜻은 **글자 블록의 아랫변**이고, 그래서 기준점(Alignment)은 2(하단)다.
  it("위치를 \\pos 로 싣고 기준점을 하단으로 잡는다", () => {
    const ass = toAss(cues, { ...size, subtitle: { pos: [0.5, 0.5] } });
    expect(ass).toContain("\\pos(540,960)");
    expect(styleOf(ass)[10]).toBe("2");
  });

  // 옛 position 은 subtitle 을 주는 순간 자리를 내준다 — 기준점이 둘이면 좌표의 뜻이 갈린다
  it("설정을 주면 옛 position 이 기준점을 흔들지 못한다", () => {
    const ass = toAss(cues, { ...size, position: "top", subtitle: DEFAULT_SUBTITLE });
    expect(styleOf(ass)[10]).toBe("2");
  });

  it("화면 밖 위치는 되돌아온 자리에 실린다", () => {
    const ass = toAss(cues, { ...size, subtitle: { pos: [9, 9] } });
    expect(ass).toContain(`\\pos(${Math.round(1080 * 0.94)},${Math.round(1920 * 0.94)})`);
  });
});

// ★★ 크기 배율이 글자를 키우면 한 줄에 들어가는 칸도 그만큼 줄어야 한다.
// 안 그러면 buildCues 가 11칸 기준으로 끊어 놓고 실제로는 7칸만 들어가, libass 가 마진에서
// 다시 접어 세 줄이 된다 — 실측으로 세운 두 줄 한계(MAX_SUBTITLE_LINES)가 조용히 무너진다.
describe("줄바꿈이 크기 배율을 안다", () => {
  const size = { width: 1080, height: 1920 };

  it("크기를 키우면 한 줄 칸 수가 그만큼 준다", () => {
    const base = lineWidthUnits(size);
    const big = lineWidthUnits({ ...size, subtitle: { size: 1.6 } });
    // 글자 크기가 반올림되므로 정확히 1/1.6 은 아니다 — 한 칸 안쪽이면 같은 값이다
    expect(big).toBeCloseTo(base / 1.6, 1);
    expect(big).toBeLessThan(base);
  });

  it("설정을 안 주면 지금 그대로다", () => {
    expect(lineWidthUnits({ ...size, subtitle: DEFAULT_SUBTITLE })).toBe(lineWidthUnits(size));
  });

  it("큰 글자면 자막이 더 잘게 나뉜다", () => {
    const cut = [{ sentence: "전문적인 장비와 세제를 써서 묵은 때까지 말끔하게 지워 드립니다.", seconds: 6 }];
    const base = buildCues(cut, size);
    const big = buildCues(cut, { ...size, subtitle: { size: 1.6 } });
    expect(big.length).toBeGreaterThan(base.length);
    // 나뉘어도 원고는 글자 그대로다
    expect(big.map((c) => c.text.replace(/\n/g, " ")).join(" ").replace(/\s+/g, ""))
      .toBe(cut[0].sentence.replace(/\s+/g, ""));
  });
});
