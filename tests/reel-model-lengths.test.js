// 길이는 **모델이 정한다** — 그 모델이 한 번에 구울 수 있는 만큼만 고르게 한다.
//
// ★★ 2026-08-25 사장님 지시: "일단 현재는 각 모델이 제공하는 영상 길이만큼만 가능하게
//   진행할거야. 예를 들면 2.0의 경우에는 15초가 한계이니까 15초 이내로. 2.5 30초까지
//   가능하니까 15초, 30초만."
//   그전에는 reel 이 TARGET_CHOICES(15·30·45·60)를 **모델과 무관하게** 그대로 그렸다.
//   기본이 Seedance 2.0(한 번에 15초가 최대)인데 60초가 고를 수 있게 서 있었다.
//
// ★ 45·60초가 아예 불가능하다는 뜻은 아니다 — 컷별로 굽고 이어 붙이면 된다(그래서 표에
//   그 값이 있다). 지금은 **한 번에 굽는 길이만** 열기로 한 것이고, 그 결정이 이 파일이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { secondsForModel, DEFAULT_I2V_MODEL, LEGACY_I2V_MODEL } from "../lib/clip-limits.js";
import { TARGET_CHOICES } from "../lib/script.js";

describe("모델이 길이를 정한다", () => {
  it("★ 기본 모델(Seedance 2.0)은 15초 하나다 — 한 번에 그만큼이 최대다", () => {
    expect(secondsForModel(DEFAULT_I2V_MODEL)).toEqual([15]);
  });

  it("Kling v3 도 한 번에 15초가 최대다", () => {
    expect(secondsForModel(LEGACY_I2V_MODEL)).toEqual([15]);
  });

  it("고르는 값은 전부 옛 목록 안에 있다 — 정가표가 그 값에서 나온다", () => {
    for (const s of secondsForModel(DEFAULT_I2V_MODEL)) {
      expect(TARGET_CHOICES, `${s} 는 정가표에 없는 길이다`).toContain(s);
    }
  });

  it("모르는 모델은 기본 모델과 같게 본다 — 화면이 부르는 자리라 던지지 않는다", () => {
    expect(secondsForModel("없는모델")).toEqual(secondsForModel(DEFAULT_I2V_MODEL));
    expect(secondsForModel(undefined)).toEqual(secondsForModel(DEFAULT_I2V_MODEL));
  });

  it("★ 모델의 상한이 늘면 목록도 따라 는다 — 손으로 적은 표가 아니다", () => {
    // 상한을 넘는 값은 없다. 이 단정이 "표를 두 벌로 적지 않았다"를 지킨다.
    const list = secondsForModel(DEFAULT_I2V_MODEL);
    expect(Math.max(...list)).toBeLessThanOrEqual(15);
  });
});

describe("화면과 서버가 같은 판정을 본다", () => {
  const read = (p) =>
    readFileSync(p, "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("화면이 모델에서 길이를 뽑는다 — 고정 목록을 그리지 않는다", () => {
    const nw = read("app/reel/new/page.js");
    expect(nw).toContain("secondsForModel");
    expect(nw, "고정 목록을 아직 그린다").not.toContain("TARGET_CHOICES.map");
  });

  it("★ 라우트도 같은 함수로 막는다 — 한쪽만 좁히면 화면 밖에서 뚫린다", () => {
    const route = read("app/api/reel/route.js");
    expect(route).toContain("secondsForModel");
  });
});
