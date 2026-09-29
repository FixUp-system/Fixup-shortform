// **잘 알려진 캐릭터·작품을 미리 알려 준다 — 막지는 않는다** (2026-09-28 사장님 결정).
//
// ★★★ 실측 — 백설공주 편 `6ce304aa`(09-28)이 출력 저작권으로 거절됐다
//   (`generated_video` · "Potential copyright violation"). 시나리오 프롬프트에는 저작권
//   규칙이 **한 줄도 없었고**(grep 0건), 화면에도 미리 알려 주는 자리가 없었다.
// ★★ **막지 않는다**(사장님 결정): 캐릭터와 콜라보한 제품 광고처럼 그 이름이 꼭 필요한
//   경우가 있다. 밴드·쿠션을 다른 말로 못 바꾸는 것과 같은 자리다.
// ★ 규칙은 "이름을 빼라"가 아니라 **"겉모습을 원작과 다르게 지어라"** 다 — 이름을 지우고
//   원작을 정확히 묘사하면(검은 단발 + 파란 상의 + 노란 치마) 결과물이 여전히 걸린다.
//   걸리는 것은 이름이 아니라 **만들어진 그림**이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { KNOWN_IP, findKnownIp, ipWarning, IP_SCENARIO_RULE } from "../lib/known-ip.js";

describe("이름 찾기", () => {
  it("★★★ 백설공주를 찾는다 — 09-28 에 실제로 거절된 그 편이다", () => {
    expect(findKnownIp("백설공주 동화 이야기 재밌게 만들어줘")).toContain("백설공주");
  });

  it("★★ 영어 표기도 찾는다", () => {
    expect(findKnownIp("A Snow White inspired fairy tale")).toContain("백설공주");
  });

  it("★★ 여러 개면 여러 개를 준다 — 하나만 고치면 나머지가 남는다", () => {
    const got = findKnownIp("겨울왕국과 포켓몬이 함께 나오는 장면");
    expect(got).toHaveLength(2);
  });

  it("★★★ 같은 이름이 여러 번 나와도 한 번만 센다", () => {
    expect(findKnownIp("백설공주. 백설공주. 백설공주.")).toEqual(["백설공주"]);
  });

  it("★ 없으면 빈 배열 — 멀쩡한 자료에 경고를 띄우지 않는다", () => {
    expect(findKnownIp("보라색 세럼 병이 도는 제품 광고")).toEqual([]);
    expect(findKnownIp("")).toEqual([]);
    expect(findKnownIp(null)).toEqual([]);
  });

  it("★★ 낱말 한가운데는 안 문다 — '마리오네트'가 '마리오'로 잡히면 헛경보다", () => {
    expect(findKnownIp("마리오네트 인형극")).toEqual([]);
  });
});

describe("경고 문구 — 무엇을 바꾸면 되는지 말한다", () => {
  it("★★★ 이름을 짚고, 이야기는 그대로 두라고 말한다", () => {
    const w = ipWarning(["백설공주"]);
    expect(w).toContain("백설공주");
    expect(w).toMatch(/이야기/);
    expect(w).toMatch(/옷 색|머리/);
  });

  it("★★ 막는 말이 아니다 — '만들 수 없어요' 가 아니라 '거절될 수 있어요' 다", () => {
    const w = ipWarning(["포켓몬"]);
    expect(w).toMatch(/수 있어요/);
    expect(w).not.toMatch(/만들 수 없어요|확정할 수 없어요/);
  });

  it("★ 이름이 없으면 문구도 없다", () => {
    expect(ipWarning([])).toBe("");
  });
});

describe("시나리오 규칙 — 세 흐름이 같은 한 줄을 쓴다", () => {
  it("★★★ 규칙이 '이름 빼기'가 아니라 '겉모습 바꾸기'다", () => {
    expect(IP_SCENARIO_RULE).toMatch(/이야기|줄거리/);
    expect(IP_SCENARIO_RULE).toMatch(/겉모습|생김새/);
    expect(IP_SCENARIO_RULE).toMatch(/색|머리/);
  });

  for (const f of ["lib/reel/scenario.js", "lib/ad/scenario.js", "lib/film/scenario.js"]) {
    it(`★★ ${f} 가 그 한 줄을 싣는다 — 손으로 다시 적으면 세 벌이 갈린다`, () => {
      expect(readFileSync(f, "utf8"), f).toMatch(/IP_SCENARIO_RULE/);
    });
  }
});

describe("목록", () => {
  it("★★ 이름마다 한글·영어 표기를 함께 둔다", () => {
    expect(KNOWN_IP.length).toBeGreaterThan(20);
    for (const e of KNOWN_IP) {
      expect(typeof e.name, JSON.stringify(e)).toBe("string");
      expect(Array.isArray(e.terms), e.name).toBe(true);
      expect(e.terms.length, e.name).toBeGreaterThan(0);
    }
  });

  it("★ 목록은 **완전할 필요가 없다** — 사후 그물(rejected_copyright)이 따로 있다", () => {
    const src = readFileSync("lib/known-ip.js", "utf8");
    expect(src).toMatch(/rejected_copyright|사후|완전/);
  });
});

describe("화면 — 단계별 ②시나리오가 경고를 그린다", () => {
  const src = readFileSync("app/reel/[id]/scenario/page.js", "utf8");

  it("★★★ 판정을 화면이 손으로 다시 적지 않는다", () => {
    expect(src).toMatch(/findKnownIp|ipWarning/);
  });

  it("★★ 확정 버튼을 막지 않는다 — 경고일 뿐이다", () => {
    expect(src).not.toMatch(/disabled=\{[^}]*ipNames/);
  });
});
