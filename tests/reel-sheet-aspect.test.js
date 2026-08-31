// **스토리보드 한 장이 모델이 받는 비율 안인가** — 통짜 게이트의 넷째 조건.
//
// 2026-08-31 프로덕션 실측(문서에 저장된 원문 그대로):
//
//   영상 생성 실패 (422) {"detail":[{"loc":["body","reference_image_urls",0],
//   "msg":"The aspect ratio of the image should be between 0.4 and 2.5.",
//   "type":"image_aspect_ratio_error"}]}
//
// ★★ **컷이 다섯일 때만 걸린다.** 격자가 1행×5열이 되어 판이 3600×1280(비율 **2.81**)이
//   되는데, H3 는 참조 이미지 비율을 **0.4~2.5** 로 제한한다. 다른 칸 수는 전부 통과한다:
//     3(1×3)=1.69 · 4(2×2)=0.56 · **5(1×5)=2.81 ✗** · 6(2×3)=0.84 · 8(2×4)=1.13 ·
//     9(3×3)=0.56 · 10(2×5)=1.41 · 12(3×4)=0.75 · 15(3×5)=0.94
//
// ★ **스키마에는 없는 제약이다.** duration·resolution·필드 이름은 OpenAPI 가 말해 주지만
//   이것은 **런타임 검사**라, 배선할 때 스키마만 읽어서는 못 본다(2026-08-31 교훈).
// ★ Seedance 에는 이 제한이 없다 — 기본 모델이 H3 로 옮겨 가면서 처음 드러났다.
//
// ★★ 고치는 방향은 **막는 것이 아니라 떨어뜨리는 것**이다. `planReelBake` 의 계약이
//   이미 그렇다: *"하나라도 어긋나면 던지지 않고 컷별로 떨어진다. 그 길은 그대로 살아
//   있다."* 그래서 5컷 H3 는 조용히 컷별로 구워진다 — 실패가 아예 안 난다.
import { describe, it, expect } from "vitest";
import { planReelBake, storyboardGridFor, sheetAspectFor } from "../lib/reel/oneshot.js";
import { clipProfileForProject, refAspectFor } from "../lib/clip-limits.js";
import { classifyFailure, FAILURE_CODES } from "../lib/failure.js";

const cut = (idx) => ({
  idx, shows: `panel ${idx}`, seconds: 3,
  image: { url: `https://x/c${idx}.jpg`, sheet: "https://fal/sheet.png", cell: idx },
});

const doc = (count, model) => ({
  id: "pid", kind: "reel",
  settings: { target_seconds: 15, aspect_ratio: "9:16", i2v_model: model, resolution: model === "minimax-h3" ? "768P" : "720p" },
  scenario: { text: "A quiet workshop bench; the camera drifts left." },
  cuts: Array.from({ length: count }, (_, i) => cut(i)),
});

describe("모델 표 — 참조 이미지 비율 한계", () => {
  it("★ H3 는 0.4~2.5 다 — fal 이 런타임에 그렇게 답했다", () => {
    expect(refAspectFor(clipProfileForProject({ settings: { i2v_model: "minimax-h3" } })))
      .toEqual({ min: 0.4, max: 2.5 });
  });

  it("★ Seedance 는 한계가 없다 — 확인된 적이 없으니 적지 않는다", () => {
    // 모르는 것을 좁게 적으면 멀쩡히 되던 길이 막힌다. 여기서는 **모르면 안 막는다** —
    // 값이 걸린 자리가 아니라 갈래 판정이라, 틀려도 컷별로 떨어질 뿐이다.
    expect(refAspectFor(clipProfileForProject({ settings: { i2v_model: "seedance-2.0" } }))).toBeNull();
    expect(refAspectFor(clipProfileForProject({ settings: { i2v_model: "seedance-2.5" } }))).toBeNull();
  });
});

describe("스토리보드 한 장의 비율", () => {
  it("★ 격자와 화면 비율에서 나온다 — 픽셀을 구하지 않고도 같은 값이다", () => {
    // 1행×5열 · 9:16 → (5×9)/(1×16) = 2.8125. 실제 판은 3600×1280 = 2.8125 다.
    expect(sheetAspectFor({ rows: 1, cols: 5 }, "9:16")).toBeCloseTo(2.8125, 4);
    expect(sheetAspectFor({ rows: 2, cols: 3 }, "9:16")).toBeCloseTo(0.84375, 4);
    expect(sheetAspectFor({ rows: 3, cols: 3 }, "9:16")).toBeCloseTo(0.5625, 4);
  });

  it("격자가 없으면 0 이다 — 판이 없다는 뜻이라 판정이 통과로 새면 안 된다", () => {
    expect(sheetAspectFor(null, "9:16")).toBe(0);
  });
});

describe("통짜 게이트 — 넷째 조건", () => {
  it("★★ 5컷 + 기본(H3)은 **컷별로 떨어진다** — 판이 2.81 이라 H3 가 거절한다", () => {
    const p = planReelBake(doc(5, "minimax-h3"));
    expect(p.mode, "통짜로 가면 그 자리에서 422 다").toBe("percut");
    expect(p.sheet).toBe("");
  });

  it("★ 5컷이라도 Seedance 면 예전 그대로 통짜다 — 그 모델에는 제한이 없다", () => {
    const p = planReelBake(doc(5, "seedance-2.0"));
    expect(p.mode).toBe("oneshot");
    expect({ rows: p.grid.rows, cols: p.grid.cols }).toEqual({ rows: 1, cols: 5 });
  });

  it("★ 다른 칸 수는 H3 에서도 통짜다 — 문을 너무 좁히지 않았는지 함께 본다", () => {
    for (const n of [3, 4, 6]) {
      const p = planReelBake(doc(n, "minimax-h3"));
      expect(p.mode, `${n}컷이 막혔다 — 비율 ${sheetAspectFor(storyboardGridFor(n, { resolution: "768P", aspect: "9:16" }), "9:16")}`).toBe("oneshot");
    }
  });

  it("막힌 갈래도 컷 수·길이는 그대로 말해 준다 — 화면이 그 값을 읽는다", () => {
    const p = planReelBake(doc(5, "minimax-h3"));
    expect(p.count).toBe(5);
    expect(p.seconds).toBe(15);
  });
});

describe("비율 거절을 사장님 말로 옮긴다", () => {
  const RAW = '영상 생성 실패 (422) {"detail":[{"loc":["body","reference_image_urls",0],"msg":"The aspect ratio of the image should be between 0.4 and 2.5.","type":"image_aspect_ratio_error"}]}';

  it("★ 제 갈래로 잡힌다", () => {
    expect(classifyFailure(RAW).code).toBe("rejected_aspect");
    expect(FAILURE_CODES).toContain("rejected_aspect");
  });

  it("★★ 문구가 **그림의 가로세로**를 가리킨다 — '문장을 바꿔'가 아니다", () => {
    const { message } = classifyFailure(RAW);
    expect(message).toMatch(/가로|세로|비율/);
    expect(message, "문장을 바꾸라는 틀린 안내가 남아 있다").not.toContain("문장을");
  });

  it("다시 해 볼 수는 있다 — 사진을 바꾸면 풀리는 종류다", () => {
    expect(classifyFailure(RAW).retryable).toBe(true);
  });

  it("★ 판정이 4xx 규칙보다 앞이다 — 뒤에 두면 422 가 먼저 물려 죽은 코드가 된다", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile(new URL("../lib/failure.js", import.meta.url), "utf8");
    expect(src.indexOf("rejected_aspect")).toBeLessThan(src.indexOf("status >= 400"));
  });

  it("초상 거절과 안 헷갈린다 — 둘은 다른 문구가 필요하다", () => {
    const likeness = '실패 (422) {"loc":["body","image_urls"],"msg":"likenesses of real people","type":"content_policy_violation"}';
    expect(classifyFailure(likeness).code).toBe("rejected_likeness");
  });

  it("초상도 비율도 아닌 4xx 는 예전 문구 그대로", () => {
    expect(classifyFailure("영상 생성 실패 (400) bad request").code).toBe("rejected");
  });
});
