// **그림이 300초에 잘려 죽는 자리에 우리 시계를 둔다** (2026-09-29 사장님 신고).
//
// ★★★ 실측 — 판 수정이 10분 넘게 "그리는 중"이었다(프로젝트 61c4cc60 · 02:46:56 시작).
//   원장에 그 회차 기록이 없고 오류도 없다. 그림 라우트는 **응답을 기다리는 동기 호출**이고
//   Vercel 함수 상한이 300초라(app/api/reel/[id]/images/route.js 의 maxDuration),
//   넘으면 함수가 통째로 종료된다 — `catch` 도 함께 사라져 **오류조차 못 적는다**.
//   그래서 문서에는 `imagesDrawing: true` 만 남고 화면은 영원히 로딩이다.
// ★★ 고치는 방법은 둘이다:
//   ① 상한에 닿기 **전에** 우리가 먼저 끝낸다 — 무슨 일이 있었는지 적고 잠금을 푼다.
//   ② 잠금 만료(10분)를 함수 상한(5분)에 맞춰 줄인다 — ①이 실패했을 때의 마지막 그물이다.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { withDeadline, DeadlineExceeded } from "../lib/deadline.js";
import { REEL_IMAGE_LOCK_MS, REEL_IMAGE_DEADLINE_MS, isImagesLocked } from "../lib/reel/doc.js";

describe("우리 시계 — withDeadline", () => {
  it("★★★ 제때 끝나면 그대로 돌려준다", async () => {
    await expect(withDeadline(Promise.resolve("ok"), 1000, "늦었어요")).resolves.toBe("ok");
  });

  it("★★★ 넘으면 **우리 문구로** 던진다 — 조용히 멎지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise(() => {});
      const p = withDeadline(never, 250_000, "그림이 오래 걸려요");
      const caught = p.catch((e) => e);
      await vi.advanceTimersByTimeAsync(250_000);
      const err = await caught;
      expect(err).toBeInstanceOf(DeadlineExceeded);
      expect(err.message).toBe("그림이 오래 걸려요");
    } finally {
      vi.useRealTimers();
    }
  });

  it("★★ 끝나면 시계를 치운다 — 안 치우면 함수가 그 시간만큼 안 잠든다", async () => {
    vi.useFakeTimers();
    try {
      await withDeadline(Promise.resolve(1), 9999, "늦었어요");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("★★ 안에서 던진 오류는 그대로 지나간다 — 우리 문구로 덮지 않는다", async () => {
    const boom = Promise.reject(new Error("그림 생성 실패 (422) 어쩌고"));
    await expect(withDeadline(boom, 1000, "늦었어요")).rejects.toThrow(/422/);
  });
});

describe("값 — 상한보다 앞서고, 잠금은 그 뒤다", () => {
  const route = readFileSync("app/api/reel/[id]/images/route.js", "utf8");
  const maxDuration = Number(/maxDuration\s*=\s*(\d+)/.exec(route)?.[1]);

  it("★★★ 우리 시계가 함수 상한보다 **먼저** 운다", () => {
    expect(maxDuration).toBe(300);
    expect(REEL_IMAGE_DEADLINE_MS).toBeLessThan(maxDuration * 1000);
  });

  it("★★★ 잠금은 함수가 죽고 나서 오래 안 남는다(10분 → 6분)", () => {
    expect(REEL_IMAGE_LOCK_MS).toBe(6 * 60 * 1000);
    expect(REEL_IMAGE_LOCK_MS).toBeGreaterThan(maxDuration * 1000);
  });

  it("★★ 잠금 판정은 그대로 — 창이 지나면 열린다(막다른 길을 안 만든다)", () => {
    const at = 1_000_000;
    expect(isImagesLocked({ imagesDrawing: true, imagesAt: at }, at + 1000)).toBe(true);
    expect(isImagesLocked({ imagesDrawing: true, imagesAt: at }, at + REEL_IMAGE_LOCK_MS + 1)).toBe(false);
  });

  it("★★★ 라우트가 그 시계를 실제로 쓴다 — 상수만 두면 아무 일도 안 일어난다", () => {
    expect(route).toMatch(/withDeadline\(/);
    expect(route).toMatch(/REEL_IMAGE_DEADLINE_MS/);
  });
});
