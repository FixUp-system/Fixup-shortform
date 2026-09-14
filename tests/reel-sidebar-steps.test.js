// **단계별도 사이드바에서 단계가 보이고, 도는 단계가 깜박인다** (2026-09-01 사장님 지시).
//
// ⚠️ **2026-09-14 — 아래 서사는 앞쪽 절(순수 함수 판)에만 아직 맞는다.** 사이드바 쪽은
//   뒤집혔다: reel 단계 목록이 작업대(components/reel/StepStack.jsx)로 갔고 사이드바에서
//   걷혔다. 이 머리말을 지우지 않는 이유는, 그때 무엇을 왜 만들었는지가 여기밖에 없어서다
//   — 되살릴 일이 생기면 **작업대에** 붙인다. 자세한 것은 아래 describe 위 주석에 있다.
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

// ★★★ 2026-09-14 — 이 아래 셋은 **뒤집혔다.** 위의 순수 함수 판(runningReelStepKey)은
//   그대로다 — 판정은 여전히 lib/reel/steps.js 하나가 안다.
//   바뀐 것은 **그것을 누가 화면에 그리는가**다: reel 화면이 설정 패널 + 누적 작업대로
//   바뀌면서 사이드바의 reel 단계 목록이 같은 말을 두 번 하는 자리가 됐고, 그래서 걷었다.
//
// ⚠️⚠️ **잃은 신호 둘을 여기 적어 둔다**(고치라는 요구가 아직 없어 판으로는 안 건다):
//   ① `/reel/new` 에서 단계가 안 보인다. 그 화면은 단계 레이아웃 **밖**이라 작업대가 없고,
//      사이드바 목록이 있던 자리였다(2026-09-01 사장님 지시가 그것이었다).
//   ② "만드는 중…" 깜박임이 reel 에서 사라졌다. 작업대에는 그 표시가 없어
//      `runningReelStepKey` 는 지금 **앱 코드 소비자가 0** 이다(순수 함수와 판만 남았다).
//   되살릴 자리는 사이드바가 아니라 작업대다 — 되돌리려면 거기에 붙인다.
describe("사이드바는 그 둘을 더 쓰지 않는다 — 작업대가 말할 자리다", () => {
  const src = readFileSync("components/Sidebar.jsx", "utf8");

  it("★★★ reel 단계 목록을 그리던 부품이 없다", () => {
    // 날 것에서 잰다 — 주석에 남은 이름도 위반이다(없는 것을 grep 하게 만든다).
    expect(src, "ReelStepList 가 남아 있다").not.toMatch(/ReelStepList/);
  });

  it("★★★ 도는 단계 판정을 사이드바가 부르지 않는다 — 부르면 그릴 자리가 또 생긴다", () => {
    expect(src, "runningReelStepKey 가 남아 있다").not.toMatch(/runningReelStepKey/);
  });

  it("★ 그 모양의 CSS 는 **지우지 않는다** — 광고·film·옛 단계별 스테퍼가 아직 쓴다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.side-step\.running/);
    expect(css).toMatch(/\.side-step\.running \.running-tag/);
    // 소비자를 세고 지운다 — 지금 광고 스테퍼가 이 클래스를 실제로 붙인다.
    expect(src, "이 CSS 의 소비자가 0 이 됐다면 그때 지워라").toMatch(/running-tag/);
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
