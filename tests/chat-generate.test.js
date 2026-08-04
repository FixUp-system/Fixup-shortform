import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { POST } from "../app/api/chat/route.js";

const headersFor = () => ({
  [USER_HEADER]: "00000000-0000-4000-8000-00000000000a",
  [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user", "content-type": "application/json",
});
const req = (messages) =>
  new Request("http://localhost/api/chat", {
    method: "POST", headers: headersFor(), body: JSON.stringify({ messages }),
  });
const openaiReply = (obj) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }),
});

describe("POST /api/chat — generate 스키마", () => {
  beforeEach(() => { process.env.OPENAI_API_KEY = "sk-test"; });
  afterEach(() => vi.unstubAllGlobals());

  it("단계별 입력을 그대로 내보낸다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openaiReply({
      action: "generate", material_text: "국산 딸기 딸기라떼, 이번 주 출시, 5,500원",
      target_seconds: 15, aspect_ratio: "1:1", style: "illust",
      voice_label: "밝은 남성", summary: "딸기라떼 출시 홍보",
    })));
    const data = await (await POST(req([{ role: "me", text: "딸기라떼 홍보" }]))).json();
    expect(data).toEqual({
      action: "generate", material_text: "국산 딸기 딸기라떼, 이번 주 출시, 5,500원",
      target_seconds: 15, aspect_ratio: "1:1", style: "illust",
      voice_label: "밝은 남성", summary: "딸기라떼 출시 홍보",
    });
  });

  it("닫힌 목록 밖 값은 기본으로 — 유료 호출에 모르는 값이 실리지 않게", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openaiReply({
      action: "generate", material_text: "자료",
      target_seconds: 20, aspect_ratio: "4:3", style: "유화느낌", voice_label: "외계인",
    })));
    const data = await (await POST(req([{ role: "me", text: "x" }]))).json();
    expect(data.target_seconds).toBe(30);
    expect(data.aspect_ratio).toBe("9:16");
    expect(data.style).toBe("photo");
    expect(data.voice_label).toBe("차분한 여성");
  });

  it("material_text 가 비면 generate 로 받지 않는다(재시도 → 502)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openaiReply({ action: "generate", material_text: "" })));
    expect((await POST(req([{ role: "me", text: "x" }]))).status).toBe(502);
  });

  it("ask 응답은 그대로 통과한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openaiReply({
      action: "ask", message: "길이는요?", quick_replies: ["15초", "30초", "그냥 바로 만들어줘"],
    })));
    const data = await (await POST(req([{ role: "me", text: "x" }]))).json();
    expect(data.action).toBe("ask");
    expect(data.quick_replies).toContain("그냥 바로 만들어줘");
  });
});
