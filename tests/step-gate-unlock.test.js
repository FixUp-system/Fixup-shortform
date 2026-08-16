// ★ 산출물이 다 있는데 status 한 줄이 안 올라가면 사장님이 **영영 갇힌다** (2026-08-15 프로덕션 실측).
//
// 실물: 프로젝트 810d2361 — 컷 3개 전부 image 있음 · state=done · 오류 필드 0건 ·
//       progress={phase:"images",done:3,total:3} 인데 **status="voice"**.
//       마지막 문서 쓰기가 컷 저장(progress.at 09:18:01.439)이었고 updated_at 은 09:18:02.098 —
//       그 뒤로 아무 쓰기도 없었다. runImagesPipeline 의 마지막 한 줄이 안 돈 것이다.
//
// 왜 빠져나갈 수 없었나 — 문이 세 개인데 셋 다 닫힌다:
//   ① ④이미지의 [다음] 버튼은 isReachable("video") 를 본다 → status 가 "images" 여야 열린다
//   ② status 를 "images" 로 올리는 자리는 저장소에 **딱 한 줄**이다(runImagesPipeline 끝).
//      컷별 [다시 생성](regenCut)은 그 값을 안 건드린다 — 그림을 다 채워도 안 열린다
//   ③ 다시 [이미지 만들기]를 누르면 라우트가 **409**로 막는다("이미 만든 이미지가 있어요")
//
// 그래서 규칙을 하나 세운다: **산출물이 컷마다 다 나왔으면 그 단계는 지나간 것이다.**
// status 는 여전히 정상 경로의 신호이고, 이것은 그 신호가 유실됐을 때의 **탈출구**다.
//
// ⚠️ "끝남"의 정의를 여기서 새로 쓰지 않는다 — lib/progress.js 의 isCutDone 을 그대로 쓴다.
//    파이프라인이 "단계를 넘긴다"고 판정할 때 쓰는 바로 그 자다(실패로 끝난 컷도 끝난 것으로
//    센다: runImagesPipeline 은 needs_attention 컷을 두고도 status 를 올린다).
import { describe, it, expect } from "vitest";
import { isReachable, currentStepKey } from "../lib/steps.js";

const confirmed = { briefing: { confirmed: true } };

describe("잠금 탈출 — 산출물이 다 있으면 다음 단계가 열린다", () => {
  it("★ ④→⑤: 그림이 컷마다 다 있는데 status 가 뒤처져도 ⑤영상이 열린다 (810d2361 재현)", () => {
    const stuck = {
      ...confirmed,
      status: "voice", // ← runImagesPipeline 의 마지막 줄이 안 돌았다
      cuts: [
        { idx: 0, image: { url: "a" }, state: "done" },
        { idx: 1, image: { url: "b" }, state: "done" },
        { idx: 2, image: { url: "c" }, state: "done" },
      ],
    };
    expect(isReachable("video", stuck), "그림이 다 있는데 ⑤가 안 열린다 — 빠져나갈 문이 없다").toBe(true);
  });

  it("★ ⑤→⑥: 클립이 컷마다 다 있는데 status 가 뒤처져도 ⑥완성이 열린다", () => {
    const stuck = {
      ...confirmed,
      status: "images", // ← runClipsPipeline 의 마지막 줄이 안 돌았다
      cuts: [
        { idx: 0, video: { url: "a" } },
        { idx: 1, video: { url: "b" } },
      ],
    };
    expect(isReachable("done", stuck), "클립이 다 있는데 ⑥이 안 열린다").toBe(true);
  });

  it("③→④: 낭독이 컷마다 다 있는데 status 가 뒤처져도 ④이미지가 열린다", () => {
    const stuck = {
      ...confirmed,
      status: "cuts",
      cuts: [{ idx: 0, audio: { url: "a" } }, { idx: 1, audio: { url: "b" } }],
    };
    expect(isReachable("images", stuck)).toBe(true);
  });

  it("★ 일부만 있으면 안 연다 — 세 컷 중 둘만 그려졌다", () => {
    const half = {
      ...confirmed,
      status: "voice",
      cuts: [
        { idx: 0, image: { url: "a" }, state: "done" },
        { idx: 1, image: { url: "b" }, state: "done" },
        { idx: 2, state: "pending" },
      ],
    };
    expect(isReachable("video", half), "덜 만들어졌는데 열렸다").toBe(false);
  });

  it("★ 컷이 없으면 안 연다 — every() 가 빈 배열에 참을 주는 함정", () => {
    const empty = { ...confirmed, status: "voice", cuts: [] };
    expect(isReachable("video", empty)).toBe(false);
    expect(isReachable("done", { ...confirmed, status: "cuts", cuts: [] })).toBe(false);
  });

  it("★ ①자료를 안 끝냈으면 산출물이 있어도 안 연다 — currentStepKey 의 불변을 지킨다", () => {
    const noBriefing = {
      briefing: null,
      status: "voice",
      cuts: [{ idx: 0, image: { url: "a" }, state: "done" }],
    };
    expect(currentStepKey(noBriefing)).toBe("material");
    expect(isReachable("video", noBriefing)).toBe(false);
  });

  it("실패로 끝난 컷도 끝난 것으로 센다 — 파이프라인이 단계를 넘기는 규칙과 같다", () => {
    // runImagesPipeline 은 needs_attention 컷을 두고도 status 를 올린다("그 컷만 다시 만들 수
    // 있어야 한다"). 여기서 더 엄하게 굴면 파이프라인이 정상 종료한 프로젝트가 갇힌다.
    const withFailure = {
      ...confirmed,
      status: "voice",
      cuts: [
        { idx: 0, image: { url: "a" }, state: "done" },
        { idx: 1, state: "needs_attention" },
      ],
    };
    expect(isReachable("video", withFailure)).toBe(true);

    const clipFailed = {
      ...confirmed,
      status: "images",
      cuts: [{ idx: 0, video: { url: "a" } }, { idx: 1, video_error: "클립을 만들지 못했어요" }],
    };
    expect(isReachable("done", clipFailed)).toBe(true);
  });

  it("status 기반 판정은 그대로다 — 산출물이 없어도 status 가 앞서면 열린다", () => {
    const normal = { ...confirmed, status: "images", cuts: [{ idx: 0 }] };
    expect(isReachable("video", normal)).toBe(true);
    expect(isReachable("done", { ...confirmed, status: "video", cuts: [{ idx: 0 }] })).toBe(true);
  });

  it("앞서가지는 않는다 — 컷만 있고 아무것도 안 만들었으면 ⑤는 닫혀 있다", () => {
    const early = { ...confirmed, status: "cuts", cuts: [{ idx: 0 }, { idx: 1 }] };
    expect(isReachable("images", early)).toBe(false);
    expect(isReachable("video", early)).toBe(false);
    expect(isReachable("done", early)).toBe(false);
  });
});
