import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = (p) => readFileSync(p, "utf8");

describe("1 입력 · /film/new", () => {
  it("★ 만들기는 사이즈·컨셉·분위기·화풍·언어를 함께 보낸다 — 안 보내면 기본값이 조용히 톤을 정한다", () => {
    const s = src("app/film/new/page.js");
    for (const k of ["aspect_ratio", "format", "mood", "style", "narration_lang"]) {
      expect(s).toContain(k);
    }
  });

  it("★ 길이·화질·모델은 안 보낸다 — 서버가 박는다(두 방식의 조건을 같게 둔다)", () => {
    const s = src("app/film/new/page.js");
    expect(s).not.toMatch(/seconds:/);
    expect(s).not.toMatch(/resolution:/);
  });

  // ⚠️ 계획서는 이 자리를 `/\/scenario/`(주소 문자열)로 적었다. 그런데 주소를 화면이 손으로
  //   적으면 lib/film/steps.js 의 표와 **두 벌**이 된다 — 세그먼트를 바꿔도 이 화면만 옛
  //   주소로 남고, 시험은 그 사실을 못 잰다(문자열은 여전히 맞으니까). 그래서 "주소를
  //   만드는 자리가 한 벌인가"를 잰다.
  it("★ 만든 뒤 시나리오 단계로 보낸다 — 주소는 단계 표가 만든다", () => {
    const s = src("app/film/new/page.js");
    expect(s).toMatch(/filmStepHref/);
    expect(s).toMatch(/key === "scenario"/);
  });

  it("★ 사진 업로드 중에는 만들기가 잠긴다 — 2026-08-18 에 사진 0장으로 $3.63 이 나갔다", () => {
    expect(src("app/film/new/page.js")).toMatch(/uploading/);
  });
});

describe("2 시나리오", () => {
  it("★ 잠금 판정은 lib/film/doc 의 scenarioLock 하나다 — 손으로 다시 적지 않는다", () => {
    expect(src("app/film/[id]/scenario/page.js")).toMatch(/scenarioLock/);
  });

  it("★ 방식을 안 보낸다 — 시나리오는 두 방식이 공유하는 하나다", () => {
    const s = src("app/film/[id]/scenario/page.js");
    expect(s).toMatch(/\/scenario`, \{ method: "POST" \}/);
  });

  it("★ setInterval 을 직접 돌리지 않는다", () => {
    for (const p of ["app/film/[id]/briefing/page.js", "app/film/[id]/scenario/page.js"]) {
      expect(src(p)).not.toMatch(/setInterval/);
    }
  });
});
