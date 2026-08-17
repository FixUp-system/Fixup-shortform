// 결과를 **한 번에** 받아온다 — 새로고침해야 보이는 화면을 없앤다.
//
// 2026-08-18 사장님 지적: "이미지 혹은 영상 생성시 한 번에 생성이 안 되고 새로고침 후 다시
// 생성해야 한다." 원인이 화면마다 다르다:
//
// ★ ⑤영상 — **폴링 상한이 5분이었다.** 이 화면만 `timeoutMs` 를 안 넘겨 lib/poll.js 의 기본값
//   (POLL_TIMEOUT_MS = 5분)을 그대로 받고 있었다. 그런데 클립은 실측 컷당 100~800초다
//   (원장 기록: 16:13:58 · +20s · +100.8s). 5분을 넘기면 폴링이 포기하고 `pollTimedOut` 이
//   서면 **진입 복원까지 막힌다**(`!pollTimedOut` 조건) — 그래서 새로고침만이 탈출구였다.
//   ③목소리·④이미지는 이미 `Infinity` 다. 영상만 기본값을 받은 것은 실수로 보이고,
//   CLAUDE.md 가 그 함정을 **미리 적어 두었다**("기본값을 그대로 받지 마라").
//
// ★ 그리고 포기한 뒤 **스스로 다시 붙지 않았다.** 사장님이 탭을 다시 보면 그때 한 번 확인하면
//   되는데 아무 장치가 없었다 — 새로고침이 유일한 길이었던 두 번째 이유다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { POLL_TIMEOUT_MS } from "../lib/poll.js";

const read = (p) => readFileSync(p, "utf8");
const video = read("app/create/[id]/video/page.js");

// 오래 걸리는 생성 화면 셋 — 여기서 기본 상한(5분)을 그대로 받으면 안 된다.
const LONG = [
  { step: "⑤영상", src: video },
  { step: "④이미지", src: read("app/create/[id]/images/page.js") },
  { step: "③목소리", src: read("app/create/[id]/voice/page.js") },
];

describe("오래 걸리는 생성은 폴링이 먼저 포기하지 않는다", () => {
  it("★ 기본 상한이 5분이라는 사실을 못 박는다 — 이 테스트의 근거다", () => {
    expect(POLL_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });

  for (const { step, src } of LONG) {
    it(`★ ${step} — 상한을 명시한다(기본값을 그대로 받지 않는다)`, () => {
      // 폴링을 시작하는 자리에 timeoutMs 가 실려 있어야 한다. 안 실리면 5분에 포기하고,
      // 그 뒤에는 진입 복원까지 막혀 새로고침만이 탈출구가 된다.
      expect(src, "timeoutMs 를 안 넘긴다 — 5분에 포기한다").toMatch(/timeoutMs:/);
      // 5분(또는 그보다 짧은 값)을 명시하는 것도 같은 결과다 — 클립 한 컷이 그보다 길 수 있다.
      expect(src, "상한을 5분 이하로 적었다 — 컷 하나가 그보다 길다")
        .not.toMatch(/timeoutMs:\s*(5\s*\*\s*60|[1-5]\s*\*\s*60\s*\*\s*1000|60000|120000|180000|300000)\b/);
    });
  }

  // ★ 포기한 뒤에도 **스스로 다시 붙는다.** 사장님이 다른 탭을 보다 돌아오면 그때 한 번
  //   확인하면 된다 — 그것이 "새로고침"이 하던 일의 전부다.
  it("★ ⑤영상 — 탭으로 돌아오면 다시 확인한다", () => {
    expect(video, "돌아왔을 때를 듣는 자리가 없다").toMatch(/visibilitychange|"focus"|'focus'/);
    // 듣기만 하고 아무것도 안 하면 소용없다 — 포기 표시를 풀고 다시 붙어야 한다.
    expect(video, "포기 표시를 풀지 않는다 — 되돌아와도 폴링이 안 살아난다")
      .toMatch(/setPollTimedOut\(false\)/);
  });
});
