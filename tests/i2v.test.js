import { describe, it, expect, afterEach } from "vitest";
import { generateClip, fitDuration, I2V_MAX_SECONDS } from "../lib/i2v";

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// 비용 기록이 저장소의 data/ 를 오염시키지 않게 임시 디렉터리로 돌린다 —
// 이 테스트들은 addRecord 가 실제로 도는 경로를 지난다.
process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-t-"));

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
    // 4초는 눈금(6·8·10…)에 없어 6초로 올라간다 — 가짜 모드도 진짜와 같은 값을 돌려줘야 한다
    expect(r).toEqual({ url: "data:image/svg+xml;base64,AAA", seconds: 6, truncated: false });
  });

  // 관통에서 낭독 실측(9초·5초)을 그대로 보냈다가 네 컷 전부 422 로 거절당했다:
  //   Input should be 6, 8, 10, 12, 14, 16, 18 or 20
  it("모델이 받는 눈금으로 올려 보낸다 — 임의의 초는 422 로 거절당한다", () => {
    expect(fitDuration(5)).toBe(6);    // 하한 — 5초짜리 컷은 만들 수 없다
    expect(fitDuration(9)).toBe(10);
    expect(fitDuration(6)).toBe(6);    // 눈금에 있으면 그대로
    expect(fitDuration(4.3)).toBe(6);
    expect(fitDuration(13)).toBe(14);
    expect(fitDuration(25)).toBe(20);  // 상한에 묶는다
  });

  it("내리지 않고 올린다 — 내리면 소리가 그림보다 길어져 뒤가 잘린다", () => {
    // 올린 만큼은 합성이 마지막 프레임을 늘려 메운다(lib/compose.js 의 tpad)
    for (const s of [3, 5, 7, 9, 11]) expect(fitDuration(s)).toBeGreaterThan(s);
  });

  it("상한보다 긴 컷만 잘린 것으로 표시한다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "https://fal.media/v.mp4" } }) };
    };
    const r = await generateClip({ imageUrl: "i", seconds: 25, aspect_ratio: "9:16", fetchImpl });
    expect(sent.duration).toBe(I2V_MAX_SECONDS);
    expect(r.seconds).toBe(I2V_MAX_SECONDS);
    expect(r.truncated).toBe(true);
  });

  it("눈금에 맞춰 올린 것은 잘린 것이 아니다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    const r = await generateClip({ imageUrl: "i", seconds: 4.3, aspect_ratio: "9:16", fetchImpl });
    expect(sent.duration).toBe(6);
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

  it("움직임 지시를 요청에 담는다 — 없으면 모델 재량이 된다", async () => {
    // 이 자리가 오래 비어 있었다. 이미지와 길이만 보내면 컷이 어떻게 움직일지를
    // 아무도 정하지 않는다 — 숏폼에서 움직임은 컷 정보량의 절반이다.
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    await generateClip({
      imageUrl: "https://img/1.png", seconds: 4, aspect_ratio: "9:16",
      prompt: "카메라가 천천히 뒤로 물러난다", fetchImpl,
    });
    expect(sent.prompt).toContain("카메라가 천천히 뒤로 물러난다");
  });

  it("초가 없거나 0이어도 만들 수 있는 가장 짧은 길이로 간다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    await generateClip({ imageUrl: "i", seconds: 0, aspect_ratio: "9:16", fetchImpl });
    expect(sent.duration).toBe(6);
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
