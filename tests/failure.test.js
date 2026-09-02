import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { classifyFailure, failureFromResponse, FAILURE_CODES } from "../lib/failure.js";

// ★★★ 2026-09-02 — fetch 응답 하나를 사장님 말로 옮기는 자리.
//
// 왜 생겼나: 화면들이 `data.error || "고정 문구"` 를 손으로 적고 있어서, **본문이 JSON 이
// 아닐 때 아무 정보도 안 남았다.** 함수가 시간으로 죽으면 Vercel 이 504 에 HTML 을 주고,
// `res.json()` 이 실패해 빈 객체가 되고, 화면에는 "시나리오를 만들지 못했어요" 만 떴다 —
// 정작 아래 504 갈래가 **이미 있었는데** 거기까지 못 갔다.
describe("응답을 사유로 옮긴다 (failureFromResponse)", () => {
  it("★ 본문이 없어도 상태 코드로 사유를 짓는다 — 504 는 시간 초과다", () => {
    const r = failureFromResponse(504, {});
    expect(r.code).toBe("timeout");
    expect(r.message).toContain("오래 걸렸");
  });

  it("★ 서버가 준 말이 있으면 그 말이 이긴다 — 라우트가 이유를 더 잘 안다", () => {
    const r = failureFromResponse(400, { error: "시나리오를 너무 많이 다시 썼어요" });
    expect(r.message).toBe("시나리오를 너무 많이 다시 썼어요");
  });

  it("서버 문구 안의 상태도 그대로 옮겨진다", () => {
    expect(failureFromResponse(500, { error: "이미지 생성 실패 (429) x" }).code).toBe("busy");
  });

  it("빈 문자열·null 본문은 없는 것으로 본다", () => {
    for (const body of [null, undefined, {}, { error: "" }, { error: "   " }]) {
      expect(failureFromResponse(503, body).code).toBe("provider");
    }
  });

  it("어떤 상태가 와도 안 던지고 코드·문구를 준다", () => {
    for (const s of [400, 401, 402, 408, 429, 500, 502, 504, 0]) {
      const r = failureFromResponse(s, {});
      expect(FAILURE_CODES).toContain(r.code);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});

// ★ 만든 판정을 **화면이 실제로 쓰는지**까지 본다 — 규칙만 있고 안 부르면 아무 일도 안 난다
//   (이 저장소가 여러 번 겪은 모양: 값을 만들어 놓고 배선을 빠뜨린다).
describe("②시나리오 화면이 그 판정을 쓴다", () => {
  const page = readFileSync("app/reel/[id]/scenario/page.js", "utf8");

  it("★ 실패 문구를 손으로 안 적는다 — failureFromResponse 를 부른다", () => {
    expect(page, "판정기를 import 하지 않는다").toContain("failureFromResponse");
    expect(page, "고정 문구를 아직 손으로 적는다").not.toContain('data.error || "시나리오를 만들지 못했어요"');
  });
});

describe("실패 사유 분류", () => {
  it("크레딧 부족은 장부 문구를 그대로 쓰고 재시도를 열지 않는다", () => {
    const r = classifyFailure("크레딧이 모자라요 — 이 작업은 160 크레딧인데 20 남았어요");
    expect(r.code).toBe("no_credits");
    expect(r.retryable).toBe(false);
    expect(r.message).toContain("160 크레딧인데 20 남았어요");
  });

  it("예산 상한도 재시도를 열지 않는다", () => {
    const r = classifyFailure("예산 상한($5)에 닿아 멈췄어요 — 지금까지 $5.10 썼어요");
    expect(r.code).toBe("budget");
    expect(r.retryable).toBe(false);
  });

  it("429 는 몰린 것 — 다시 시도할 수 있다", () => {
    const r = classifyFailure("이미지 생성 실패 (429) rate limited");
    expect(r.code).toBe("busy");
    expect(r.retryable).toBe(true);
  });

  it("504 는 시간 초과다", () => {
    expect(classifyFailure("영상 생성 실패 (504) gateway timeout").code).toBe("timeout");
  });

  it("5xx 는 만드는 쪽 문제다", () => {
    expect(classifyFailure("영상 생성 실패 (500) internal").code).toBe("provider");
  });

  it("402 는 5xx·4xx 규칙보다 먼저 걸려 크레딧으로 읽힌다", () => {
    const r = classifyFailure("이미지 생성 실패 (402) insufficient balance");
    expect(r.code).toBe("no_credits");
    expect(r.retryable).toBe(false);
  });

  it("그 밖 4xx 는 모델이 거부한 것으로 본다", () => {
    const r = classifyFailure("이미지 생성 실패 (400) content policy violation");
    expect(r.code).toBe("rejected");
    expect(r.retryable).toBe(true);
  });

  it("빈 결과", () => {
    expect(classifyFailure("영상 결과가 비어 있어요").code).toBe("empty");
  });

  it("연결 실패", () => {
    expect(classifyFailure("fetch failed").code).toBe("network");
    expect(classifyFailure("connect ETIMEDOUT 1.2.3.4:443").code).toBe("network");
  });

  // ★ 이 자리가 이 표의 핵심이다 — 못 알아본 것을 "알 수 없는 오류"로 뭉개면
  //   지금보다 정보가 **줄어든다**. 사장님이 우리에게 문구를 그대로 읽어 줄 수 있어야 한다.
  it("못 알아본 것은 원문을 그대로 내보낸다", () => {
    const r = classifyFailure("ffmpeg 가 -22 로 죽었어요");
    expect(r.code).toBe("unknown");
    expect(r.message).toBe("ffmpeg 가 -22 로 죽었어요");
    expect(r.retryable).toBe(true);
  });

  it("Error 객체도 받는다", () => {
    expect(classifyFailure(new Error("이미지 생성 실패 (429) x")).code).toBe("busy");
  });

  it("빈 입력에도 안 던진다", () => {
    for (const v of [null, undefined, "", {}]) {
      const r = classifyFailure(v);
      expect(FAILURE_CODES).toContain(r.code);
      expect(typeof r.message).toBe("string");
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});
