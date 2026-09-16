// Scribe v2 호출 — **언제 말했나**를 재는 유일한 자리.
//
// ★ 값이 나간다(fal-ai/elevenlabs/speech-to-text/scribe-v2). 그래서 가짜 모드에서는
//   안 부르고, 원장에 남기고, 못 재도 **던지지 않는다**(자막이 옛 방식으로 흐를 뿐
//   영상은 이미 다 구웠다).
// ★★ 2026-09-16 — whisper 는 낱말 사이 쉼을 다음 낱말의 시작에 붙여 실측 2.75초까지
//   일찍 떴다(설계 문서 §2). Scribe v2 는 낱말 사이 쉼을 빈 구간으로 남긴다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { probeSpeech } from "../lib/speech-probe.js";
// ★ 값이 나가는 길(addRecord)은 costActor() 를 거친다 — actor 컨텍스트가 없으면
//   currentActor() 가 **던진다**(lib/actor.js). 다른 원장 테스트들(tts·imagegen)도
//   전부 이 헬퍼로 감싼다 — 여기만 빠뜨리면 이 테스트만 조용히 빈 결과로 떨어진다.
import { runWithActor } from "../lib/actor.js";
import { listRecords } from "../lib/costs.js";

describe("probeSpeech", () => {
  // ★★ 2026-09-16 리뷰 M3 — 200 응답인데 낱말이 0개(예: 무음 구간)면 **유료 호출인데
  //   원장에 안 남았다.** 실패(!res.ok)·호출 자체를 안 한 경우(가짜 모드·오디오 없음)만
  //   안 남아야 한다 — 성공 응답이면 낱말 수와 무관하게 남는다.
  it("성공 응답인데 낱말이 0개여도 원장에 남는다", async () => {
    const before = (await listRecords()).length;
    await runWithActor("t-user", () => probeSpeech("data:audio/mp4;base64,AA", {
      fetchImpl: async () => ({ ok: true, json: async () => ({ words: [] }) }),
      projectId: "p1", seconds: 15,
    }));
    const after = await listRecords();
    expect(after.length).toBe(before + 1);
  });

  it("실패 응답(!res.ok)이면 원장에 안 남는다", async () => {
    const before = (await listRecords()).length;
    await runWithActor("t-user", () => probeSpeech("data:audio/mp4;base64,AA", {
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "boom" }),
      projectId: "p1", seconds: 15,
    }));
    expect((await listRecords()).length).toBe(before);
  });

  it("가짜 모드에서는 부르지 않는다 — 값이 0 이라 잴 것이 없다", async () => {
    const prev = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = "fal";
    let called = false;
    const out = await probeSpeech("data:audio/mp4;base64,AA", { fetchImpl: async () => { called = true; } });
    expect(called).toBe(false);
    expect(out.words).toEqual([]);
    process.env.SHOTFORM_FAKE = prev;
  });

  it("낱말만 골라 시각과 글자를 준다", async () => {
    const body = {
      words: [
        { text: "턱선을", start: 1.30, end: 1.60, type: "word" },
        { text: " ", start: 1.60, end: 1.76, type: "spacing" },
        { text: "감싸는", start: 1.76, end: 2.26, type: "word" },
      ],
    };
    const out = await runWithActor("t-user", () => probeSpeech("data:audio/mp4;base64,AA", {
      fetchImpl: async () => ({ ok: true, json: async () => body }),
      projectId: "p1", seconds: 15, lang: "ko",
    }));
    expect(out.words).toEqual([
      { timestamp: [1.30, 1.60], text: "턱선을" },
      { timestamp: [1.76, 2.26], text: "감싸는" },
    ]);
    expect(out.text).toBe("턱선을 감싸는");
  });

  it("언어를 함께 보낸다 — 자동 감지에 맡기지 않는다", async () => {
    let sent = null;
    await probeSpeech("data:audio/mp4;base64,AA", {
      fetchImpl: async (_url, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({ words: [] }) }; },
      projectId: "p1", seconds: 15, lang: "ko",
    });
    expect(sent.language_code).toBe("ko");
    expect(sent.audio_url).toBe("data:audio/mp4;base64,AA");
  });

  // ★★ 못 재도 **던지지 않는다.** 여기서 던지면 이미 값을 다 치른 영상이
  //   "합성 실패"로 끝난다 — 자막 하나 때문에 한 편을 잃는다.
  it("실패하면 빈 결과다 — 던지지 않는다", async () => {
    const out = await probeSpeech("data:audio/mp4;base64,AA", {
      fetchImpl: async () => ({ ok: false, status: 422, text: async () => "nope" }),
      projectId: "p1", seconds: 15,
    });
    expect(out).toEqual({ words: [], text: "" });
  });

  it("소리가 없으면 부르지 않는다", async () => {
    let called = false;
    const out = await probeSpeech(null, { fetchImpl: async () => { called = true; } });
    expect(called).toBe(false);
    expect(out.words).toEqual([]);
  });
});

describe("원장에 남는다", () => {
  const src = readFileSync("lib/speech-probe.js", "utf8");
  it("addRecord 로 기록한다 — 값이 나가는 호출은 전부 장부에 남는다", () => {
    expect(src).toContain("addRecord");
  });
  it("단가표에 Scribe v2 가 있다", () => {
    expect(readFileSync("lib/costs.js", "utf8")).toContain("fal-ai/elevenlabs/speech-to-text");
  });
});
