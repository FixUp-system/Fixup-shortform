// 내레이션 판독 — **한 곳**이다.
//
// ★★ 2026-08-27 설계(docs/superpowers/specs/2026-08-27-narration-as-one-voice-design.md):
//   내레이션(화면 밖 목소리)을 컷에서 떼어 **영상 전체 한 벌**로 만든다. 뒤의 모든 자리가
//   "이 프로젝트가 새 길인가 옛 길인가"를 묻는데, 그 판정이 두 벌이 되면 지시문은 새 길로
//   자막은 옛 길로 가는 어긋남이 생긴다 — 그래서 판독을 이 파일 하나에 둔다.
// ★ 옛 문서는 `narration` 이 없다 → **null** → 예전 길 그대로다(회귀 0 의 뿌리).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { reelNarration, narrationSentences, narrationLimit, narrationRuleLine } from "../lib/reel/narration.js";

const doc = (narration) => ({ id: "pid", kind: "reel", scenario: { text: "t", ...(narration ? { narration } : {}) } });

describe("판독 — reelNarration", () => {
  it("한 벌이 있으면 그 글과 읽는 표기를 준다", () => {
    const got = reelNarration(doc({ text: "오늘도 수고했어요. 끓이기만 하면 돼요.", say_as: "오늘도 수고했어요" }));
    expect(got).toEqual({ text: "오늘도 수고했어요. 끓이기만 하면 돼요.", sayAs: "오늘도 수고했어요" });
  });

  it("읽는 표기는 없어도 된다 — 빈 문자열이다", () => {
    expect(reelNarration(doc({ text: "오늘도 수고했어요." })).sayAs).toBe("");
  });

  it("앞뒤 공백은 걷는다", () => {
    expect(reelNarration(doc({ text: "  오늘도 수고했어요.  " })).text).toBe("오늘도 수고했어요.");
  });

  it("★옛 문서는 null 이다 — 그 길이 예전 그대로 돈다", () => {
    expect(reelNarration(doc(null))).toBe(null);
    expect(reelNarration({ scenario: {} })).toBe(null);
    expect(reelNarration(null)).toBe(null);
  });

  it("공백만 있는 것은 없는 것이다 — 빈 한 벌로 새 길에 들어가지 않는다", () => {
    expect(reelNarration(doc({ text: "   " }))).toBe(null);
    expect(reelNarration(doc({ text: "" }))).toBe(null);
  });

  it("글이 문자열이 아니면 없는 것으로 본다", () => {
    expect(reelNarration(doc({ text: 42 }))).toBe(null);
  });
});

describe("문장 — narrationSentences", () => {
  it("자막·정렬이 쓸 문장 목록을 준다", () => {
    expect(narrationSentences("오늘도 수고했어요. 끓이기만 하면 돼요."))
      .toEqual(["오늘도 수고했어요.", "끓이기만 하면 돼요."]);
  });

  it("빈 글은 빈 목록이다", () => {
    expect(narrationSentences("")).toEqual([]);
    expect(narrationSentences(null)).toEqual([]);
  });

  it("★쪼개기 규칙을 새로 만들지 않는다 — lib/cuts.js 의 splitSentences 와 같은 값이다", async () => {
    const { splitSentences } = await import("../lib/cuts.js");
    const text = "오늘도 수고했어요. 끓이기만 하면 돼요! 그 맛, 그대로.";
    expect(narrationSentences(text)).toEqual(splitSentences(text));
  });
});

describe("길이 — narrationLimit", () => {
  it("목표 초 × 한국어 계수(5.5)다 — 15초면 82자", () => {
    expect(narrationLimit(15)).toBe(82);
    expect(narrationLimit(30)).toBe(165);
  });

  it("⚠️ 다른 언어는 잰 적이 없다 — 한국어 값으로 떨어진다", () => {
    expect(narrationLimit(15, "en")).toBe(narrationLimit(15, "ko"));
    expect(narrationLimit(15, "ja")).toBe(narrationLimit(15, "ko"));
    expect(narrationLimit(15, "모르는말")).toBe(narrationLimit(15, "ko"));
  });

  it("초를 모르면 0 이다 — 잴 수 없는 것을 지어내지 않는다", () => {
    expect(narrationLimit(0)).toBe(0);
    expect(narrationLimit(-5)).toBe(0);
    expect(narrationLimit(undefined)).toBe(0);
  });

  it("★값이 사는 곳은 lib/script.js 하나다 — 여기 5.5 를 다시 적지 않는다", async () => {
    const { CHARS_PER_SEC } = await import("../lib/script.js");
    expect(narrationLimit(20)).toBe(Math.floor(20 * CHARS_PER_SEC));
  });
});

describe("지시문 줄 — narrationRuleLine", () => {
  it("목표 초와 상한을 함께 말한다 — 모델이 그 자리에서 재게 한다", () => {
    const line = narrationRuleLine(15, "ko");
    expect(line).toContain("15");
    expect(line).toContain("82");
  });

  it("왜 넘으면 안 되는지도 말한다 — 이유 없는 상한은 잘 안 지켜진다", () => {
    expect(narrationRuleLine(15, "ko")).toMatch(/잘린|화면보다 길/);
  });

  it("★초를 모르면 빈 줄이다 — 갈래가 안 켜진다", () => {
    expect(narrationRuleLine(0)).toBe("");
    expect(narrationRuleLine(undefined)).toBe("");
  });
});

describe("순수 규율", () => {
  it("fs·env 로 이어지는 import 가 없다 — 화면이 이 파일을 읽는다", () => {
    const src = readFileSync("lib/reel/narration.js", "utf8");
    const specs = [...src.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["'];?\s*$/gm)].map((m) => m[1]);
    // ★ 둘 다 스스로 순수하다(실측 2026-08-27): lib/cuts.js 는 import 일곱이 전부 순수하고
    //   fs·env 를 직접 안 쓴다 · lib/script.js 는 import 0 건이다.
    const ALLOWED = ["../cuts.js", "../script.js"];
    for (const spec of specs) {
      expect(ALLOWED.includes(spec), `허용 밖의 import: ${spec}`).toBe(true);
    }
  });
});
