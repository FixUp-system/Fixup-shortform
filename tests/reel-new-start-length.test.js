// ①입력 [시작하기]가 **안 눌렸다** (2026-09-15 사장님 지적 · 라이브 회귀).
//
// ★★★ 두 결정이 겹쳐 생긴 막힘이다:
//   ① 길이는 **안 고르면 시작 못 한다**(`disabled={… || !target}`) — 기본값을 박으면 사장님이 못 보고 지나가서.
//   ② 같은 날 11:42(1c5f547) — **고를 게 하나뿐인 줄은 숨긴다**(누를 수 없는 칩 하나가 줄을 먹어서).
//   기본 모델 Seedance 2.0 의 길이는 **15초 하나**라 ②로 줄이 사라졌고, ①은 여전히 고르기를 기다렸다 —
//   사장님이 누를 칸이 **아예 없는** 채로 버튼이 영원히 잠겼다. 15:39·15:48 배포로 라이브에 나갔다.
// ★ 처방: 선택지가 하나면 그 값이 곧 고른 값이다(pickedSeconds). "못 보고 지나간다"는 걱정은 고를 게
//   둘 이상일 때의 이야기다 — 하나뿐이면 지나칠 선택 자체가 없다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pickedSeconds, secondsForModel, DEFAULT_I2V_MODEL } from "../lib/clip-limits.js";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync("app/reel/new/page.js", "utf8"));

describe("pickedSeconds — 시작에 실을 길이", () => {
  it("★★★ 선택지가 하나면 안 골라도 그 값이다 — 줄이 숨겨져 고를 수 없다", () => {
    const only = secondsForModel(DEFAULT_I2V_MODEL);
    expect(only, "기본 모델의 길이가 하나라는 전제가 바뀌었다 — 이 판을 다시 보라").toHaveLength(1);
    expect(pickedSeconds(DEFAULT_I2V_MODEL, null)).toBe(only[0]);
  });

  it("★★ 선택지가 둘 이상이면 고른 값만 — 안 골랐으면 null(기본값을 몰래 박지 않는다)", () => {
    const many = ["seedance-2.5"].find((m) => secondsForModel(m).length > 1);
    expect(many).toBeTruthy();
    expect(pickedSeconds(many, null)).toBeNull();
    expect(pickedSeconds(many, secondsForModel(many)[1])).toBe(secondsForModel(many)[1]);
  });

  it("★ 모델이 안 받는 값을 쥐고 있으면 고르지 않은 것이다", () => {
    const many = "seedance-2.5";
    expect(pickedSeconds(many, 999)).toBeNull();
  });
});

describe("①입력 화면 — 버튼과 보내는 값이 같은 판정을 쓴다", () => {
  it("★★★ [시작하기] 잠금이 날 target 이 아니라 pickedSeconds 를 본다", () => {
    expect(page).toMatch(/const seconds = pickedSeconds\(model, target\)/);
    expect(page, "아직 날 target 으로 잠근다 — 줄이 숨으면 영원히 잠긴다").not.toMatch(/disabled=\{locked \|\| !text\.trim\(\) \|\| !target\}/);
    expect(page).toMatch(/disabled=\{locked \|\| !text\.trim\(\) \|\| !seconds\}/);
  });

  it("★★ 서버로도 같은 값을 보낸다 — 버튼은 열렸는데 target_seconds:null 로 400 이 나면 안 된다", () => {
    expect(page).toMatch(/target_seconds: seconds/);
  });
});
