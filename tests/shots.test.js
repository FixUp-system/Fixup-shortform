import { describe, it, expect } from "vitest";
import { SHOT_SIZES, TIGHT_LIMIT, shotSizeOf, shotBalance } from "../lib/shots.js";
import { readFileSync } from "node:fs";

describe("shotSizeOf — 닫힌 목록에서 읽는다", () => {
  it("샷 크기를 알아본다", () => {
    expect(shotSizeOf("신발 클로즈업, 로우 앵글").id).toBe("close");
    expect(shotSizeOf("선수의 발 미디엄 샷").id).toBe("medium");
    expect(shotSizeOf("코트 풀 샷").id).toBe("full");
    expect(shotSizeOf("거리 광각").id).toBe("wide");
  });

  // "극단적 클로즈업"이 "클로즈업"보다 먼저 걸려야 한다 — 목록 순서가 곧 로직이다
  it("극단적 클로즈업을 클로즈업과 가른다", () => {
    expect(shotSizeOf("아웃솔 극단적 클로즈업").id).toBe("extreme_close");
  });

  // 2026-08-17 언어 정책으로 shows 가 영어로 나온다. 한국어 낱말만 보던 목록은 그 순간
  // 눈이 멀어 shotBalance 가 카탈로그 컷 구성을 못 막았다(실측: 4컷 중 3컷 클로즈업인데 ok).
  it("영어 낱말도 알아본다 — 화면 설계가 영어로 나온다", () => {
    expect(shotSizeOf("close-up of the shoe, low angle").id).toBe("close");
    expect(shotSizeOf("medium shot of the player's feet").id).toBe("medium");
    expect(shotSizeOf("full shot of the court").id).toBe("full");
    expect(shotSizeOf("wide shot of the street at dusk").id).toBe("wide");
    expect(shotSizeOf("establishing shot of the alley").id).toBe("wide");
    expect(shotSizeOf("extreme close-up of the outsole").id).toBe("extreme_close");
  });

  it("영어 낱말의 흔한 변형도 본다 — 하이픈·붙여쓰기·대문자", () => {
    expect(shotSizeOf("Close-Up of the shoe").id).toBe("close");
    expect(shotSizeOf("closeup of the laces").id).toBe("close");
    expect(shotSizeOf("close up of the ankle").id).toBe("close");
    expect(shotSizeOf("Extreme Close-Up of the outsole").id).toBe("extreme_close");
    expect(shotSizeOf("wide-angle of the court").id).toBe("wide");
  });

  // 목록 순서가 곧 로직이다 — 영어에서도 긴 것이 먼저 걸려야 한다
  it("extreme close-up 을 close-up 과 가른다", () => {
    expect(shotSizeOf("extreme closeup of the midsole").id).toBe("extreme_close");
  });

  // ★ 한국어 낱말은 그대로 본다 — 저장된 옛 프로젝트의 shows 가 한국어다.
  //   넓힌 것은 더한 것뿐이라 한국어 판정은 한 글자도 달라지지 않는다.
  it("한국어 낱말도 그대로 본다 — 옛 프로젝트가 살아 있다", () => {
    expect(shotSizeOf("신발 클로즈업").id).toBe("close");
    expect(shotSizeOf("아웃솔 극단적 클로즈업").id).toBe("extreme_close");
    expect(shotSizeOf("설정 샷, 간판").id).toBe("wide");
  });

  it("적혀 있지 않으면 null 이다", () => {
    expect(shotSizeOf("점프슛 정점에서 공중에 뜬 선수의 역광 실루엣, 로우 앵글")).toBeNull();
    expect(shotSizeOf("")).toBeNull();
    expect(shotSizeOf(undefined)).toBeNull();
  });

  it("클로즈업 계열만 tight 다", () => {
    const tight = SHOT_SIZES.filter((s) => s.tight).map((s) => s.id);
    expect(tight).toEqual(["extreme_close", "close"]);
  });
});

describe("shotBalance — 제품에 붙어 있지 않은가", () => {
  const cuts = (...shows) => shows.map((s) => ({ shows: s }));

  // ★ 실측(2026-07-30 농구화 광고): 5컷 중 3컷이 클로즈업이고 사람이 무엇을 하는지 보이는
  //   넓은 샷은 하나뿐이었다. 광고는 그렇게 만들지 않는다 — 제품은 사람이 쓰는 장면 안에 있고,
  //   제품만 크게 잡는 컷은 여는 한 방과 닫는 한 방으로 아낀다.
  it("클로즈업이 절반을 넘으면 잡는다", () => {
    const v = shotBalance(cuts(
      "신발 클로즈업",
      "발목 클로즈업",
      "아웃솔 극단적 클로즈업",
      "선수 미디엄 샷",
    ));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("클로즈업");
  });

  it("넓은 샷이 대부분이면 통과한다", () => {
    expect(shotBalance(cuts(
      "코트에서 뛰는 선수 풀 샷",
      "방향을 트는 선수 미디엄 샷",
      "거리에서 걷는 사람들 광각",
      "신발 클로즈업",
    )).ok).toBe(true);
  });

  // 안 고른 컷 하나 때문에 화면 설계를 다시 부르면 사소한 누락에 LLM 호출을 치른다.
  // 누락된 컷은 분포 셈에서 빠지고 그 컷의 화면은 그대로 쓴다 — 샷 크기가 없어도 그림은 나온다.
  // ★ 이것이 이번에 닫은 구멍이다 — 영어 shows 에서 같은 구성이 { ok: true } 로 통과했다
  it("영어 shows 에서도 클로즈업 쏠림을 잡는다", () => {
    const v = shotBalance(cuts(
      "close-up of the shoe",
      "close-up of the ankle",
      "extreme close-up of the outsole",
      "medium shot of the player",
    ));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("클로즈업");
  });

  it("영어 shows 도 넓은 샷이 대부분이면 통과한다", () => {
    expect(shotBalance(cuts(
      "full shot of a player running on the court",
      "medium shot of the player cutting sideways",
      "wide shot of people walking down the street",
      "close-up of the shoe",
    )).ok).toBe(true);
  });

  it("샷 크기 누락은 재시도 사유가 아니다", () => {
    expect(shotBalance(cuts("선수 풀 샷", "공중에 뜬 선수의 역광 실루엣")).ok).toBe(true);
  });

  it("누락된 컷은 분포 셈에서 빠진다", () => {
    // 크기가 적힌 둘 중 하나만 클로즈업이면 절반이라 통과한다
    expect(shotBalance(cuts("신발 클로즈업", "선수 풀 샷", "역광 실루엣만 적힌 컷")).ok).toBe(true);
  });

  it("컷이 하나면 판정하지 않는다 — 분포를 요구할 수 없다", () => {
    expect(shotBalance(cuts("신발 클로즈업")).ok).toBe(true);
    expect(shotBalance([]).ok).toBe(true);
    expect(shotBalance(undefined).ok).toBe(true);
  });

  // 화면 설계가 실패해 shows 가 아예 없는 컷은 판정 대상이 아니다 — 그림은 문장으로 폴백한다
  it("shows 가 없는 컷은 세지 않는다", () => {
    expect(shotBalance([{ sentence: "가." }, { sentence: "나." }]).ok).toBe(true);
  });

  it("절반이 딱 맞으면 통과한다 — 선은 초과에서 걸린다", () => {
    expect(TIGHT_LIMIT).toBe(0.5);
    expect(shotBalance(cuts("신발 클로즈업", "선수 풀 샷")).ok).toBe(true);
  });
});

describe("lib/shots.js 는 fs 를 끌고 오지 않는다", () => {
  it("import 가 없다", () => {
    const src = readFileSync("lib/shots.js", "utf8");
    expect([...src.matchAll(/^\s*import\s.+$/gm)].map((m) => m[0])).toEqual([]);
  });
});

describe("목록의 낱말이 화면 설계 지시와 같다", () => {
  // 지문이 "그 말 그대로 적는다"고 지시한 낱말과 어긋나면 판정이 늘 실패한다
  it("SHOWS_SYSTEM 이 같은 낱말을 준다", () => {
    const src = readFileSync("lib/cuts.js", "utf8");
    for (const s of SHOT_SIZES) {
      expect(src, `${s.label} 가 지문에 없다`).toContain(s.words[0]);
    }
  });
});
