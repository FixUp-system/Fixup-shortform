// ★ 대본이 **무엇을 위한 영상인지** 를 받은 적이 없었다(2026-08-13 사용자 지적).
//
// 증상: 완성본이 "정보를 읽는 느낌"이었다. 실제 대본이 이랬다 —
//   "주머니에 넣고 다니기 딱 좋은 가벼움입니다. 무게가 가벼워 손목에 부담이 없습니다."
// 같은 사실(가벼움)을 두 문장으로 늘렸고, 브리핑이 1번으로 뽑은 **카메라 강점은 빠졌다.**
//
// 원인은 둘이었다:
//   ① 브리핑의 takeaway(목적)가 "자료에 없으면 빈 문자열" 이라 대개 비어 있었다.
//   ② 비어 있든 아니든 **대본이 그것을 안 봤다** — buildScriptMessages 가 넘기는 것은
//      자료 원문·사실 목록·분량뿐이다. 목적은 한 글자도 안 갔다.
//
// 그래서 대본 작가는 "무엇을 위해 고르는지" 없이 사실 중에서 고르게 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildScriptMessages } from "../lib/script.js";
import { purposeOf } from "../lib/briefing.js";

const briefingSrc = readFileSync("lib/briefing.js", "utf8");
const scriptSrc = readFileSync("lib/script.js", "utf8");

const project = (briefing) => ({
  id: "p1",
  material: { text: "핸드폰 광고를 만들고 싶어. 카메라에 강점이 있고 가벼운 무게 그리고 깔끔한 디자인이 장점이야", photos: [] },
  settings: { target_seconds: 15 },
  briefing: { topic: "핸드폰 광고", key_points: ["카메라에 강점", "가벼운 무게", "깔끔한 디자인"], ...briefing },
});

describe("목적 — 브리핑이 비워 두지 않는다", () => {
  it("takeaway 를 자료에서 읽어내 채우라고 시킨다 — '없으면 빈 문자열'이 아니다", () => {
    // 목적은 사실이 아니라 의도다. 자료에 대놓고 안 적혀 있어도 읽어낼 수 있다
    // ("핸드폰 광고를 만들고 싶어" 안에 이미 들어 있다).
    expect(briefingSrc, "takeaway 를 여전히 비우라고 시킨다")
      .not.toMatch(/"takeaway":"[^"]*없으면 빈 문자열/);
    expect(briefingSrc).toMatch(/takeaway/);
  });

  it("★ 목적이 낭독으로 새지 않게 막는다 — 이 저장소가 같은 실수를 겪었다", () => {
    // 연출 문구가 key_points 에 섞여 그대로 낭독된 적이 있다(SYSTEM 주석에 그 기록이 있다).
    // 목적도 같은 성질이라 같은 방어가 필요하다.
    expect(briefingSrc, "목적이 읽는 말이 아니라는 규칙이 없다").toMatch(/목적[\s\S]{0,80}(낭독|읽는 말)/);
  });
});

describe("목적 — 비면 코드가 정한다", () => {
  it("takeaway 가 있으면 그것을 쓴다", () => {
    expect(purposeOf(project({ takeaway: "사고 싶어지게" }))).toBe("사고 싶어지게");
  });

  it("★ 비면 focus 갈래로 떨어진다 — 빈 채로 흘러가지 않는다", () => {
    const forObject = purposeOf(project({ focus: { mode: "물건", subject: "핸드폰" } }));
    const forPerson = purposeOf(project({ focus: { mode: "사람", subject: "가게 주인" } }));
    const forInfo = purposeOf(project({ focus: { mode: "정보", subject: "가격표" } }));
    for (const v of [forObject, forPerson, forInfo]) {
      expect(typeof v).toBe("string");
      expect(v.length, "빈 목적이 나왔다").toBeGreaterThan(0);
    }
    // 갈래마다 달라야 의미가 있다 — 하나로 뭉뚱그리면 안 넣은 것과 같다
    expect(new Set([forObject, forPerson, forInfo]).size).toBe(3);
  });

  it("focus 도 없는 옛 프로젝트도 값을 받는다 — 던지지 않는다", () => {
    expect(typeof purposeOf(project({}))).toBe("string");
    expect(purposeOf({}).length).toBeGreaterThan(0);
    expect(purposeOf(null).length).toBeGreaterThan(0);
  });
});

describe("목적 — 대본이 실제로 받는다", () => {
  it("★ 프롬프트에 목적이 실린다 — 이 배선이 끊겨 있었다", () => {
    const { messages } = buildScriptMessages(project({ takeaway: "이 핸드폰을 사고 싶어지게" }));
    const user = messages[0].content;
    expect(user, "목적이 프롬프트에 없다").toContain("이 핸드폰을 사고 싶어지게");
    expect(user).toMatch(/목적/);
  });

  it("목적이 없던 옛 프로젝트도 프롬프트가 깨지지 않는다 — 기본값이 실린다", () => {
    const { messages } = buildScriptMessages(project({ focus: { mode: "물건", subject: "핸드폰" } }));
    expect(messages[0].content).toMatch(/목적/);
  });

  it("고르는 기준을 목적으로 준다 — 가장 센 것이 빠지지 않게", () => {
    // 이번 실패의 핵심: 브리핑이 1번으로 뽑은 '카메라'가 대본에서 통째로 빠졌다.
    // "이 중에서 고른다"만 있고 **무엇을 기준으로 고르는지**가 없었다.
    expect(scriptSrc, "고르는 기준이 목적이라는 지시가 없다").toMatch(/목적[\s\S]{0,120}(닿|고른)/);
  });
});
