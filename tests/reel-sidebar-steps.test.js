// **단계별도 사이드바에서 단계가 보이고, 도는 단계가 깜박인다** (2026-09-01 사장님 지시).
//
// ★★★ 실측(로컬 브라우저): `/ads/new` 는 사이드바에 ①입력~④완성이 잠긴 채로 보이는데,
//   `/reel/new` 는 **아무것도 안 보였다**. 코드가 그렇게 적혀 있었다 —
//   `if (!project || project.id !== id) return null;`
//   즉 프로젝트가 없으면 통째로 안 그렸다. 그래서 사이드바에서 [단계별 영상] 을 눌러
//   들어온 사람은 이 흐름이 몇 단계인지조차 볼 수 없었다.
//
// ★★ **로딩 중 깜빡임과는 구별한다.** 옛 주석이 그 걱정을 적어 두었다("빈 목록이
//   깜빡이는 것보다 없는 편이 낫다"). 그 걱정은 `/reel/<id>` 를 여는 동안의 이야기이고,
//   `/reel/new` 는 **영영 프로젝트가 없는 자리**라 깜빡일 것이 없다. 그래서 새로 만드는
//   자리에서만 잠긴 목록을 보여 준다.
//
// ★★★ 그리고 **도는 단계에 표시가 없었다**(원클릭에는 있다: 번호가 깜박이고 "만드는 중…"
//   이 붙는다). 그런데 신호를 찾다 보니 ⑥완성이 **자기 진행 표식을 아예 안 남기고**
//   있었다 — /clips 도 /render 도 status 를 똑같이 "rendering" 으로 바꾸는데, 진행
//   단계(phase)는 /clips 만 찍는다. 그래서 ⑤영상과 ⑥완성을 가를 근거가 없었다.
//   ⚠️ 그 탓에 `STALL_EXEMPT_PHASES = ["render"]` 도 reel 에서는 **한 번도 안 걸리는
//     죽은 코드**였다. 표식을 찍으면 그 면제도 비로소 뜻을 갖는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runningReelStepKey, REEL_STEPS } from "../lib/reel/steps.js";
import { REEL_IMAGE_LOCK_MS } from "../lib/reel/doc.js";

const NOW = 1_700_000_000_000;
const doc = (reel, progress) => ({ kind: "reel", reel, ...(progress ? { progress } : {}) });

describe("지금 도는 단계는 어디인가", () => {
  it("★★★ 그림을 그리는 중이면 ③이미지 생성이다", () => {
    expect(runningReelStepKey(doc({ status: "images", imagesDrawing: true, imagesAt: NOW }), NOW))
      .toBe("images");
  });

  it("★★ 그림 잠금이 풀렸으면 아니다 — 판정은 isImagesLocked 하나다", () => {
    const stale = NOW - REEL_IMAGE_LOCK_MS - 1;
    expect(runningReelStepKey(doc({ status: "images", imagesDrawing: true, imagesAt: stale }), NOW))
      .toBeNull();
  });

  it("★★★ 굽는 중이면 ⑤영상이다", () => {
    expect(runningReelStepKey(doc({ status: "rendering" }, { phase: "video", at: NOW }), NOW))
      .toBe("video");
  });

  it("★★★ 합성 중이면 ⑥완성이다 — 같은 status 라 phase 로만 갈린다", () => {
    expect(runningReelStepKey(doc({ status: "rendering" }, { phase: "render", at: NOW }), NOW))
      .toBe("done");
  });

  it("★★ 표식이 없으면 ⑤영상으로 읽는다 — 옛 문서는 /clips 만 찍었다", () => {
    expect(runningReelStepKey(doc({ status: "rendering" }), NOW)).toBe("video");
  });

  it("★ 안 도는 상태에서는 null 이다 — 아무 데도 안 깜박인다", () => {
    for (const st of ["draft", "scenario", "images", "clips", "done", "error"]) {
      expect(runningReelStepKey(doc({ status: st }), NOW), st).toBeNull();
    }
    expect(runningReelStepKey(null, NOW)).toBeNull();
    expect(runningReelStepKey({}, NOW)).toBeNull();
  });

  it("★ 돌려주는 값은 **표에 있는 단계**다 — 없는 키를 주면 아무 줄도 안 깜박인다", () => {
    const keys = REEL_STEPS.map((s) => s.key);
    for (const d of [
      doc({ status: "rendering" }, { phase: "video", at: NOW }),
      doc({ status: "rendering" }, { phase: "render", at: NOW }),
      doc({ status: "images", imagesDrawing: true, imagesAt: NOW }),
    ]) {
      expect(keys).toContain(runningReelStepKey(d, NOW));
    }
  });
});

describe("사이드바가 그 둘을 쓴다", () => {
  const src = readFileSync("components/Sidebar.jsx", "utf8");
  const at = src.indexOf("function ReelStepList");
  const block = src.slice(at, src.indexOf("\n}", src.indexOf("side-steps", at)) + 2);

  it("★★★ 새로 만드는 자리에서도 단계를 보여 준다", () => {
    expect(at, "ReelStepList 가 없다 — 이 판이 낡았다").toBeGreaterThan(-1);
    expect(block, "프로젝트가 없으면 무조건 안 그린다 — /reel/new 에서 아무것도 안 보인다")
      .toMatch(/"new"/);
  });

  it("★★★ 도는 단계에 표시를 붙인다 — 원클릭과 같은 모양", () => {
    expect(block).toMatch(/runningReelStepKey\(/);
    expect(block, "깜박임 클래스가 없다").toMatch(/" running"/);
    expect(block, '"만드는 중…" 글자가 없다 — 색·모션만으로는 못 읽는 사람이 있다')
      .toMatch(/running-tag/);
  });

  it("★ 그 모양의 CSS 는 이미 있다 — 새로 만들지 않는다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.side-step\.running/);
    expect(css).toMatch(/\.side-step\.running \.running-tag/);
  });
});

describe("⑥완성이 자기 진행 표식을 남긴다", () => {
  const route = readFileSync("app/api/reel/[id]/render/route.js", "utf8");

  it("★★★ 합성을 시작하면 phase 를 'render' 로 찍는다 — 안 찍으면 ⑤와 구별이 안 된다", () => {
    expect(route).toMatch(/reelProgress\(/);
    expect(route).toMatch(/"render"/);
  });

  it("★ status 는 그대로 'rendering' 이다 — 상태 기계를 안 건드린다", () => {
    expect(route).toMatch(/status: "rendering"/);
  });
});
