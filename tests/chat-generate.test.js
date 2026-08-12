import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { POST } from "../app/api/chat/route.js";
import { readFileSync } from "node:fs";
import { STYLE_PRESETS } from "../lib/styles.js";
import { VOICES } from "../lib/voices.js";

const headersFor = () => ({
  [USER_HEADER]: "00000000-0000-4000-8000-00000000000a",
  [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user", "content-type": "application/json",
});
const req = (messages) =>
  new Request("http://localhost/api/chat", {
    method: "POST", headers: headersFor(), body: JSON.stringify({ messages }),
  });
// Anthropic Messages API 응답 모양 — content 는 블록 배열이다
const claudeReply = (obj) => ({
  ok: true,
  status: 200,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => ({
    id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5",
    content: [{ type: "text", text: JSON.stringify(obj) }],
    stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 },
  }),
});

describe("POST /api/chat — generate 스키마", () => {
  beforeEach(() => { process.env.CLAUDE_API_KEY = "sk-test"; });
  afterEach(() => vi.unstubAllGlobals());

  it("단계별 입력을 그대로 내보낸다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => claudeReply({
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
    vi.stubGlobal("fetch", vi.fn(async () => claudeReply({
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
    vi.stubGlobal("fetch", vi.fn(async () => claudeReply({ action: "generate", material_text: "" })));
    expect((await POST(req([{ role: "me", text: "x" }]))).status).toBe(502);
  });

  it("ask 응답은 그대로 통과한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => claudeReply({
      action: "ask", message: "길이는요?", quick_replies: ["15초", "30초", "그냥 바로 만들어줘"],
    })));
    const data = await (await POST(req([{ role: "me", text: "x" }]))).json();
    expect(data.action).toBe("ask");
    expect(data.quick_replies).toContain("그냥 바로 만들어줘");
  });

  // ★★ 홈 챗의 첫 화면에는 우리가 박아 둔 인사말이 이미 떠 있고(components/QuickCreate.jsx),
  // 사장님이 첫 마디를 치면 그 인사말까지 함께 올라온다. OpenAI 는 assistant 로 시작하는
  // 대화를 받아 줬지만 Anthropic 은 **첫 메시지가 user 여야** 하고 아니면 400 이다.
  // 그러면 홈에서 첫 마디를 던지는 모든 사장님이 502 "문제가 생겼어요" 를 본다 — 정문이 닫힌다.
  it("인사말로 시작하는 대화도 user 로 시작해서 나간다", async () => {
    const f = vi.fn(async () => claudeReply({ action: "ask", message: "네", quick_replies: [] }));
    vi.stubGlobal("fetch", f);
    const res = await POST(req([
      { role: "ai", text: "안녕하세요! 어떤 영상을 만들까요?" },
      { role: "me", text: "딸기라떼 홍보" },
    ]));
    expect(res.status).toBe(200);
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent.messages[0].role).toBe("user");
    expect(sent.messages).toHaveLength(1);
  });

  it("빈 텍스트 턴은 보내지 않는다 — 빈 content 도 400 사유다", async () => {
    const f = vi.fn(async () => claudeReply({ action: "ask", message: "네", quick_replies: [] }));
    vi.stubGlobal("fetch", f);
    await POST(req([
      { role: "me", text: "자료" },
      { role: "ai", text: "" },
      { role: "me", text: "  " },
      { role: "me", text: "만들어줘" },
    ]));
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent.messages.map((m) => m.content)).toEqual(["자료", "만들어줘"]);
  });

  it("보낼 턴이 하나도 안 남으면 부르지 않고 400 이다", async () => {
    const f = vi.fn(async () => claudeReply({ action: "ask", message: "네" }));
    vi.stubGlobal("fetch", f);
    const res = await POST(req([{ role: "ai", text: "안녕하세요!" }]));
    expect(res.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  // 프롬프트가 닫힌 목록을 글자로 열거하므로, lib 이 바뀌면 프롬프트가 낡는다.
  // 코드는 목록 밖 값을 기본값으로 접어 버려 조용히 통과하니, 낡음은 여기서만 드러난다.
  it("SYSTEM_PROMPT 가 lib 의 화풍 id·목소리 label 을 모두 열거한다", () => {
    const src = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");
    const prompt = src.slice(src.indexOf("const SYSTEM_PROMPT = `"), src.indexOf("export const POST"));
    for (const id of STYLE_PRESETS.map((s) => s.id)) expect(prompt).toContain(`"${id}"`);
    for (const label of VOICES.map((v) => v.label)) expect(prompt).toContain(`"${label}"`);
  });
});
