import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { generateSpeech, VOICES } from "../lib/tts";
import { runWithActor } from "../lib/actor.js";
import { memoryStore } from "../lib/store/memory.js";

// 사용자 축은 이제 고정 상한이 아니라 **잔액**(크레딧)이다 — 충전이 없으면 유료 호출이
// 나가기 전에 막힌다. 이 파일이 보는 것은 요청·응답의 모양이므로 넉넉히 충전해 열어 둔다.
beforeEach(() =>
  memoryStore.insertGrant({ user_id: "t-user", amount_credits: 1000, reason: "테스트", granted_by: "admin" })
);

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// 비용 기록이 저장소의 data/ 를 오염시키지 않게 임시 디렉터리로 돌린다 —
// 이 테스트들은 addRecord 가 실제로 도는 경로를 지난다.
process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-t-"));

afterEach(() => { delete process.env.SHOTFORM_FAKE; });

describe("VOICES", () => {
  it("목소리 후보가 있고 라벨이 붙어 있다", () => {
    expect(VOICES.length).toBeGreaterThan(0);
    for (const v of VOICES) expect(v.label).toBeTruthy();
  });
});

describe("generateSpeech", () => {
  it("가짜 모드에서는 fal을 부르지 않고 추정 길이를 돌려준다", async () => {
    process.env.SHOTFORM_FAKE = "1";
    let called = false;
    const r = await generateSpeech({
      text: "가".repeat(55),
      voiceId: "v1",
      fetchImpl: () => { called = true; },
    });
    expect(called).toBe(false);
    expect(r.seconds).toBe(10); // 55자 ÷ 5.5
    expect(r.url).toMatch(/^data:audio\//);
  });

  it("응답의 실제 길이를 그대로 돌려준다", async () => {
    // 이 모듈의 존재 이유 — 추정이 아니라 실측을 돌려준다
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ audio: { url: "https://fal.media/a.mp3", duration: 4.3 } }),
    });
    const r = await runWithActor("t-user", () => generateSpeech({ text: "안녕하세요", voiceId: "v1", fetchImpl }));
    expect(r).toEqual({ url: "https://fal.media/a.mp3", seconds: 4.3 });
  });

  it("길이가 안 오면 글자 수로 어림한다", async () => {
    // 모델마다 응답 모양이 다르다 — 길이를 안 주는 경우가 있다
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ audio: { url: "https://fal.media/a.mp3" } }),
    });
    const r = await runWithActor("t-user", () => generateSpeech({ text: "가".repeat(11), voiceId: "v1", fetchImpl }));
    expect(r.seconds).toBe(2);
  });

  it("보낸 요청에 문장과 목소리가 담긴다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ audio: { url: "u", duration: 1 } }) };
    };
    await runWithActor("t-user", () => generateSpeech({ text: "문장입니다", voiceId: "voice-abc", fetchImpl }));
    expect(sent.text).toBe("문장입니다");
    expect(JSON.stringify(sent)).toContain("voice-abc");
  });

  it("결과가 비면 던진다", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({}) });
    await expect(
      runWithActor("t-user", () => generateSpeech({ text: "가", voiceId: "v1", fetchImpl }))
    ).rejects.toThrow(/비어/);
  });

  it("실패하면 상태 코드를 담아 던진다", async () => {
    const fetchImpl = async () => ({ ok: false, status: 402, text: async () => "no credit" });
    await expect(
      runWithActor("t-user", () => generateSpeech({ text: "가", voiceId: "v1", fetchImpl }))
    ).rejects.toThrow(/402/);
  });
});
