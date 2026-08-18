// 광고 영상에도 **우리가** 자막을 태운다 — 모델이 그린 글자에 기대지 않는다.
//
// 사장님 지시(2026-08-18): "음성과 자막을 선택된 언어로 반영할 수 있도록."
//
// 광고에는 자막을 태우는 코드가 **0건**이었다(lib/ad/*·app/api/ads/* 어디에도 없다).
// 그래서 화면에 보이는 글자는 전부 영상 모델이 그린 것이고, 오타가 나도 고칠 수단이 없었다
// (사장님이 본 `KONKUK UNVV` 가 그 종류다). 시나리오 지문은 오히려 "화면에 글자를 넣으라고
// 요구하지 마라 — 자막은 우리가 나중에 붙인다"라고 적어 두고 있었는데, **붙이는 자리가
// 없었다.** 이 회차가 그 자리를 만든다.
//
// ★ 재료는 이미 있다: `scenario.shots[].line`(대사)과 `shots[].seconds`(장면 길이).
//   초의 합이 전체 길이와 같다는 규칙을 시나리오가 이미 지킨다(lib/ad/scenario.js).
// ★ 장치도 이미 있다: ⑥완성의 buildCues·toAss·burnArgs(lib/subtitles.js·lib/compose.js).
//   **새로 만들지 않는다** — 두 벌이 되면 폰트·줄바꿈·위치 규칙이 갈린다.
// ⚠️ 단계별과 다른 점 하나: 저쪽은 낭독을 실제로 만들어 **실측 길이**로 자막을 맞추는데,
//    광고는 통짜 생성이라 실측이 없다. 시나리오가 적은 초로 맞추므로 말과 자막이 조금
//    어긋날 수 있다 — 그 한계를 코드 주석과 화면 문구가 함께 말해야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { adSubtitleCuts } from "../lib/ad/subtitles.js";

describe("광고 자막 — 재료를 컷 모양으로 옮긴다", () => {
  const scenario = {
    shots: [
      { line: "여름은, 가볍게.", seconds: 5 },
      { line: "", seconds: 4 },
      { line: "지금 만나보세요.", seconds: 6 },
    ],
  };

  it("★★ 장면을 자막 장치가 아는 모양으로 옮긴다", () => {
    const cuts = adSubtitleCuts(scenario);
    expect(cuts, "옮긴 결과가 없다").toHaveLength(3);
    expect(cuts[0].sentence, "대사가 안 실렸다").toBe("여름은, 가볍게.");
    expect(cuts[0].seconds, "길이가 안 실렸다").toBe(5);
    // 자막 장치는 idx 로 순서를 센다(lib/subtitles.js)
    expect(cuts.map((c) => c.idx), "순서가 없다").toEqual([0, 1, 2]);
    // ★ 자막 장치는 "그려진 컷"만 태운다 — 광고는 한 편이 통짜라 모든 장면이 그 한 편을 가리킨다
    expect(cuts[0].video?.url, "그려진 컷으로 안 보인다 — 자막이 한 줄도 안 태워진다").toBeTruthy();
    expect(cuts[0].video?.seconds, "초를 실으면 장면마다 전체 길이를 세게 된다").toBeUndefined();
  });

  it("★★ 대사 없는 장면은 자막이 없다 — 빈 자막을 태우면 검은 띠만 깜빡인다", () => {
    const cuts = adSubtitleCuts(scenario);
    expect(cuts[1].sentence, "빈 대사가 자막으로 간다").toBe("");
    expect(cuts[1].silent, "무음 장면 표시가 없다").toBe(true);
  });

  it("★ 시나리오가 없으면 빈 목록이다 — 태울 것이 없으면 태우지 않는다", () => {
    expect(adSubtitleCuts(null)).toEqual([]);
    expect(adSubtitleCuts({ shots: [] })).toEqual([]);
  });

  it("★ 초가 빠진 옛 시나리오도 죽지 않는다", () => {
    const cuts = adSubtitleCuts({ shots: [{ line: "가" }] });
    expect(cuts[0].seconds, "초가 없으면 0 이어야 한다(자막이 안 흐른다)").toBe(0);
  });
});

describe("광고 자막 — 배선", () => {
  const pipeline = readFileSync("lib/ad/pipeline.js", "utf8");

  it("★★ 완성본에 자막을 태운다", () => {
    expect(pipeline, "자막을 태우는 자리가 없다").toMatch(/burnAdSubtitles|burnSubtitles/);
  });

  it("★★ 언어가 사장님이 고른 그 언어다", () => {
    expect(pipeline, "나레이션 언어를 자막에 안 넘긴다").toMatch(/narration_lang/);
  });

  it("★ 자막 없는 원본을 남긴다 — 자막이 마음에 안 들 때 돌아갈 곳이 있어야 한다", () => {
    expect(pipeline, "원본을 안 남긴다").toMatch(/rawUrl|-raw\.mp4/);
  });
});
