// 수거 복구 — **일시 오류는 접수증을 지킨다** (2026-09-02 사장님 신고).
//
// 사고 모양: 굽는 도중 오류로 멈췄다가 이어서 하면, fal 에는 완성본이 있는데 보관함에는
// 안 보인다. 뿌리가 둘이었다:
//   ① collectReelOneShot 의 catch 가 **어떤 오류에도** job: null — 네트워크가 한 번
//      흔들리면 이미 구워진(돈 낸) 편의 주소를 우리 손으로 버렸다(인계 문서 §7.7).
//   ② 수거가 ⑤영상 상태 라우트에만 걸려 있어, 보관함으로 바로 가면 아무도 안 걷었다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { collectReelOneShot } from "../lib/reel/pipeline.js";

const doc = () => ({
  id: "p1",
  kind: "reel",
  cuts: [{ idx: 0 }, { idx: 1 }],
  reel: { job: { requestId: "r1", of: "각인", prompt: "pr", aspect_ratio: "9:16", seconds: 15 } },
});

// updateProject 스파이 — 갱신 함수를 실제로 적용해 무엇이 적혔는지 본다.
function harness(collectImpl) {
  let current = doc();
  const writes = [];
  return {
    deps: {
      getProject: async () => current,
      updateProject: async (_id, _owner, fn) => { current = fn(current); writes.push(current); return current; },
      collectClip: collectImpl,
    },
    state: () => current,
    writes,
  };
}

describe("일시 오류 — 접수증이 산다", () => {
  // fal 쪽 결론이 아닌 실패들: 다음 방문이 같은 접수증으로 다시 걷을 수 있어야 한다.
  const transient = [
    ["네트워크", "fetch failed"],
    ["혼잡", "영상 생성 실패 (429) too many requests"],
    ["시간 초과", "영상 생성 실패 (504) gateway timeout"],
    ["제공자 5xx", "영상 생성 실패 (503) unavailable"],
  ];
  for (const [name, msg] of transient) {
    it(`★★ ${name}(${msg.slice(0, 20)}…) — job 이 남고 아무것도 안 적는다`, async () => {
      const h = harness(async () => { throw new Error(msg); });
      const out = await collectReelOneShot("p1", "o1", h.deps);
      expect(out.transient).toBe(true);
      expect(h.state().reel.job?.requestId, "접수증이 지워졌다 — 돈 낸 편을 잃는다").toBe("r1");
      expect(h.writes.length, "일시 오류인데 문서를 적었다").toBe(0);
      expect(h.state().reel.error ?? null).toBe(null);
    });
  }
});

describe("확정 실패 — 기존대로 접수증을 지우고 사유를 적는다", () => {
  it("fal 이 결론을 낸 거절(422·비초상)은 error 로 남는다", async () => {
    const h = harness(async () => {
      throw new Error('영상 생성 실패 (422) {"detail":[{"msg":"invalid input"}]}');
    });
    const out = await collectReelOneShot("p1", "o1", h.deps);
    expect(out.changed).toBe(false);
    expect(h.state().reel.job ?? null, "확정 실패인데 접수증이 남았다 — 다음 요청이 또 수거하려 든다").toBe(null);
    expect(h.state().reel.status).toBe("error");
    expect(h.state().reel.error).toContain("422");
  });

  it("성공 수거는 그대로다 — 클립이 꽂히고 접수증이 지워진다", async () => {
    const h = harness(async () => ({ done: true, url: "https://fal/v.mp4", seconds: 15 }));
    const out = await collectReelOneShot("p1", "o1", h.deps);
    expect(out.changed).toBe(true);
    expect(h.state().cuts[0].video.url).toBe("https://fal/v.mp4");
    expect(h.state().reel.job ?? null).toBe(null);
  });
});

describe("보는 문이 줍는다", () => {
  const route = readFileSync("app/api/reel/[id]/route.js", "utf8");
  const status = readFileSync("app/api/reel/[id]/status/route.js", "utf8");

  it("★★ GET /api/reel/[id] 가 수거를 부른다 — 보관함이 이 문으로 읽는다", () => {
    expect(route).toContain("collectReelOneShot");
  });

  it("★ 소유자·접수증이 있을 때만 — 남의 편과 빈 편은 그대로 지나간다", () => {
    const at = route.indexOf("collectReelOneShot(id");
    const gate = route.slice(Math.max(0, at - 400), at);
    expect(gate, "소유자 게이트가 없다").toContain("viewed.mine");
    expect(gate, "접수증 게이트가 없다").toContain("requestId");
  });

  it("⑤ 상태 라우트의 수거는 그대로 산다 — 문이 둘이어도 걷는 함수는 하나다", () => {
    expect(status).toContain("collectReelOneShot");
  });
});
