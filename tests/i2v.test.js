import { describe, it, expect, afterEach } from "vitest";
import { generateClip, I2V_MAX_SECONDS } from "../lib/i2v";

afterEach(() => { delete process.env.SHOTFORM_FAKE; });

describe("generateClip", () => {
  it("가짜 모드에서는 이미지 URL을 그대로 클립으로 돌려준다", async () => {
    process.env.SHOTFORM_FAKE = "1";
    let called = false;
    const r = await generateClip({
      imageUrl: "data:image/svg+xml;base64,AAA", seconds: 4, aspect_ratio: "9:16",
      fetchImpl: () => { called = true; },
    });
    expect(called).toBe(false);
    expect(r).toEqual({ url: "data:image/svg+xml;base64,AAA", seconds: 4, truncated: false });
  });

  it("상한보다 긴 컷은 잘라 만들고 표시를 남긴다", async () => {
    // 원고 컷이 12~13초로 나오는 경우가 있는데 i2v 모델은 10초가 상한이다.
    // 남는 시간은 합성이 마지막 프레임 정지로 채운다.
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "https://fal.media/v.mp4" } }) };
    };
    const r = await generateClip({ imageUrl: "i", seconds: 13, aspect_ratio: "9:16", fetchImpl });
    expect(sent.duration).toBe(I2V_MAX_SECONDS);
    expect(r.seconds).toBe(I2V_MAX_SECONDS);
    expect(r.truncated).toBe(true);
  });

  it("상한 안이면 그대로 보낸다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    const r = await generateClip({ imageUrl: "i", seconds: 4.3, aspect_ratio: "9:16", fetchImpl });
    expect(sent.duration).toBe(4.3);
    expect(r.truncated).toBe(false);
  });

  it("이미지와 비율을 요청에 담는다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    await generateClip({ imageUrl: "https://img/1.png", seconds: 4, aspect_ratio: "1:1", fetchImpl });
    expect(sent.image_url).toBe("https://img/1.png");
    expect(sent.aspect_ratio).toBe("1:1");
  });

  it("초가 없거나 0이어도 최소 1초는 만든다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    await generateClip({ imageUrl: "i", seconds: 0, aspect_ratio: "9:16", fetchImpl });
    expect(sent.duration).toBe(1);
  });

  it("결과가 비면 던진다", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({}) });
    await expect(
      generateClip({ imageUrl: "i", seconds: 4, aspect_ratio: "9:16", fetchImpl })
    ).rejects.toThrow(/비어/);
  });

  it("실패하면 상태 코드를 담아 던진다", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "boom" });
    await expect(
      generateClip({ imageUrl: "i", seconds: 4, aspect_ratio: "9:16", fetchImpl })
    ).rejects.toThrow(/500/);
  });
});
