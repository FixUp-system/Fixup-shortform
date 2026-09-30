// H3 는 **큐로만** 부른다 — 15초가 ~7.5분이라 동기 호출(fal.run)은 300초에 끊기고
// fal 은 계속 과금한다(lib/i2v.js 머리말: $0.90 을 그렇게 잃었다).
import { describe, it, expect } from "vitest";
import { h3Body, submitH3, collectH3, waitH3 } from "../lib/longform/h3.js";

const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

describe("몸통", () => {
  const body = h3Body({
    prompt: "p", seconds: 14, aspect: "9:16", resolution: "768P", seed: 42,
    refs: [{ kind: "sheet", url: "https://fal/s.png" }, { kind: "anchor", bytes: Buffer.from("x"), key: "a.jpg" }],
  });

  it("★ 참조 필드는 reference_image_urls 다(Seedance 의 image_urls 가 아니다)", () => {
    expect(body.reference_image_urls[0]).toBe("https://fal/s.png");
    expect(body.image_urls).toBeUndefined();
  });

  it("로컬 바이트는 data URI 로 싣는다", () => {
    expect(body.reference_image_urls[1]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("길이는 H3 프로필이 받는 값이다", () => {
    expect(body.duration).toBeGreaterThanOrEqual(5);
    expect(body.duration).toBeLessThanOrEqual(15);
  });

  it("씨앗이 있으면 싣고, 없으면 칸을 안 만든다", () => {
    expect(body.seed).toBe(42);
    expect(h3Body({ prompt: "p", seconds: 10, aspect: "9:16", resolution: "768P", refs: [] }).seed).toBeUndefined();
  });
});

describe("머리말은 한 자리(lib/fal-auth.js)에서 온다", () => {
  it("★★★ 요청 몸통을 fal 에 보관하지 않게 한다 — 닻(실사 얼굴)과 올린 사진이 몸통에 든다", async () => {
    const before = process.env.FAL_KEY;
    process.env.FAL_KEY = "test-key";
    const seen = [];
    const fetchImpl = async (url, opt) => {
      seen.push(opt?.headers || {});
      return url.includes("queue.fal.run")
        ? res(200, { request_id: "r", status_url: "S", response_url: "R" })
        : res(200, { status: "IN_QUEUE" });
    };
    try {
      await submitH3({ prompt: "p" }, { fetchImpl });
      await collectH3({ statusUrl: "S", responseUrl: "R" }, { fetchImpl });
    } finally {
      process.env.FAL_KEY = before;
    }
    for (const h of seen) {
      expect(h.Authorization).toBe("Key test-key");
      expect(h["X-Fal-Store-IO"]).toBe("0");
    }
    expect(seen[0]["Content-Type"]).toBe("application/json");
  });
});

describe("접수", () => {
  it("큐 주소로 보내고 접수증을 돌려준다", async () => {
    let called = "";
    const job = await submitH3({ prompt: "p" }, {
      fetchImpl: async (url) => { called = url; return res(200, { request_id: "r1", status_url: "S", response_url: "R" }); },
    });
    expect(called).toBe("https://queue.fal.run/minimax/h3/reference-to-video");
    expect(job).toEqual({ requestId: "r1", statusUrl: "S", responseUrl: "R" });
  });

  it("거절되면 상태 코드를 담아 던진다", async () => {
    await expect(submitH3({}, { fetchImpl: async () => res(422, { detail: "bad" }) }))
      .rejects.toThrow(/H3 접수 실패 \(422\)/);
  });
});

describe("수거", () => {
  const job = { statusUrl: "S", responseUrl: "R" };

  it("아직이면 done:false", async () => {
    const out = await collectH3(job, { fetchImpl: async () => res(200, { status: "IN_PROGRESS" }) });
    expect(out).toEqual({ done: false, status: "IN_PROGRESS" });
  });

  it("끝났으면 영상 주소를 준다", async () => {
    const out = await collectH3(job, {
      fetchImpl: async (url) => (url === "S" ? res(200, { status: "COMPLETED" }) : res(200, { video: { url: "https://v.mp4" } })),
    });
    expect(out).toEqual({ done: true, url: "https://v.mp4" });
  });
});

describe("기다리기", () => {
  it("끝날 때까지 두드린다", async () => {
    let n = 0;
    const url = await waitH3({ statusUrl: "S", responseUrl: "R" }, {
      sleep: async () => {}, now: () => 0,
      fetchImpl: async (u) => {
        if (u === "S") return res(200, { status: ++n < 3 ? "IN_PROGRESS" : "COMPLETED" });
        return res(200, { video: { url: "https://v.mp4" } });
      },
    });
    expect(url).toBe("https://v.mp4");
    expect(n).toBe(3);
  });

  it("★★ 시간을 넘기면 던지되, 접수증으로 이어 기다릴 수 있다고 말한다 — 재접수하면 값이 두 번 나간다", async () => {
    let t = 0;
    await expect(waitH3({ statusUrl: "S", responseUrl: "R" }, {
      sleep: async () => {}, now: () => (t += 60000), timeoutMs: 120000,
      fetchImpl: async () => res(200, { status: "IN_QUEUE" }),
    })).rejects.toThrow(/다시 돌리면 이어서 기다려요/);
  });
});
