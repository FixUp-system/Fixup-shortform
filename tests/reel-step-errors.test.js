// **오류는 그 단계의 것만 보인다** (2026-08-25 사장님 지적:
// "이미지 생성에서 영상 실패 로그가 같이 뜨고 있어").
//
// ★★ 뿌리 — `reel.error` 가 **단계별이 아니라 reel 하나에 공용**이었다. 쓰는 곳은 둘
//   (⑤영상의 clips 라우트 · ⑥완성의 render 라우트)인데 읽는 곳이 셋(③④⑤⑥)이라,
//   ⑤가 넣은 fal 422(초상 거절)가 ③이미지 화면에 자기 오류처럼 떴다.
//
// ⚠️ **더 나쁜 쪽은 반대 방향이다**: 그림이 진짜로 실패했을 때도 같은 한 칸을 쓰므로,
//   영상 오류가 남아 있으면 **그림의 실패가 그 문구에 가려진다** — 사장님은 왜 안 되는지
//   모른 채 값만 쓴다.
//
// ★ 이 저장소는 같은 문제를 이미 한 번 풀었다: 단계별 흐름의 lib/step-errors.js
//   (STEP_ERROR_FIELDS)가 "어느 단계가 어느 오류 필드를 읽는가"를 표 하나로 쥔다.
//   reel 이 그 계약 밖이라 필드가 하나뿐인 것이 원인이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { reelErrorFor, putReel, reelOf } from "../lib/reel/doc.js";

const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const read = (p) => strip(readFileSync(p, "utf8"));

describe("어느 단계의 오류인가", () => {
  const videoFailed = putReel({}, { status: "error", error: "영상 생성 실패 (422)", errorStep: "video" });
  const imagesFailed = putReel({}, { status: "error", error: "그림을 못 그렸어요", errorStep: "images" });

  it("★★ ③이미지는 **영상 오류를 안 읽는다** — 사장님이 본 그 화면이다", () => {
    expect(reelErrorFor(reelOf(videoFailed), "images")).toBe("");
  });

  it("★ 그림 오류는 ③이미지가 읽는다", () => {
    expect(reelErrorFor(reelOf(imagesFailed), "images")).toBe("그림을 못 그렸어요");
  });

  it("영상 오류는 ⑤영상이 읽는다", () => {
    expect(reelErrorFor(reelOf(videoFailed), "video")).toBe("영상 생성 실패 (422)");
  });

  it("★ 어느 단계 것인지 안 적힌 옛 문서는 **그대로 보여 준다** — 정보를 줄이지 않는다", () => {
    // 옛 문서에는 errorStep 이 없다. 그때까지의 동작(전 단계가 읽는다)을 지킨다 —
    // 안 보여 주면 이미 난 실패가 조용히 사라진다.
    const legacy = putReel({}, { status: "error", error: "옛 오류" });
    for (const step of ["images", "video", "done"]) {
      expect(reelErrorFor(reelOf(legacy), step)).toBe("옛 오류");
    }
  });

  it("오류가 없으면 빈 문자열이다 — 화면이 그대로 falsy 로 쓴다", () => {
    expect(reelErrorFor(reelOf({}), "images")).toBe("");
  });
});

describe("배선 — 쓰는 쪽이 단계를 적는다", () => {
  it("⑤영상(clips)이 video 라고 적는다", () => {
    expect(read("app/api/reel/[id]/clips/route.js")).toMatch(/errorStep:\s*"video"/);
  });

  it("⑥완성(render)이 done 이라고 적는다", () => {
    expect(read("app/api/reel/[id]/render/route.js")).toMatch(/errorStep:\s*"done"/);
  });
});

describe("배선 — 읽는 쪽이 자기 단계만 읽는다", () => {
  for (const [label, path, step] of [
    ["③이미지", "app/reel/[id]/images/page.js", "images"],
    ["⑤영상", "app/reel/[id]/video/page.js", "video"],
    ["⑥완성", "app/reel/[id]/done/page.js", "done"],
  ]) {
    it(`${label} 가 reelErrorFor(…, "${step}") 를 쓴다`, () => {
      const src = read(path);
      expect(src).toContain("reelErrorFor");
      expect(src).toMatch(new RegExp(`reelErrorFor\\([^)]*"${step}"`));
      // 날것의 reel.error 를 그대로 읽으면 안 된다 — 그것이 이 버그였다.
      expect(src, "reel.error 를 그대로 읽는다").not.toMatch(/\{reel\.error &&/);
    });
  }
});
