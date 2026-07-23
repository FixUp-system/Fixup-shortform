// POST /api/chat — gpt-4o 로 영상 생성에 필요한 정보를 대화로 수집
// 응답: {action:"ask", message, quick_replies[]} 또는
//       {action:"generate", prompt, duration, aspect_ratio, summary}

const SYSTEM_PROMPT = `너는 shotform의 영상 제작 도우미다. 사용자와 한국어로 대화하며 숏폼 영상 클립 생성에 필요한 정보를 수집한다.

수집할 정보:
1) 무엇을: 영상의 주제·내용·살릴 포인트 (사용자의 첫 메시지에 대부분 담겨 있다)
2) 길이와 비율: 길이는 "5" 또는 "10"(초), 비율은 "9:16" | "1:1" | "16:9"
3) 느낌·톤: 예) 따뜻하고 아기자기하게 / 밝고 경쾌하게 / 고급스럽고 차분하게

규칙:
- 반드시 JSON 하나만 출력한다. 다른 텍스트 금지.
- 이미 받은 정보는 절대 다시 묻지 않는다. 사용자가 첫 메시지에 느낌까지 다 줬으면 바로 generate 해도 된다.
- 아직 부족하면: {"action":"ask","message":"<한 가지만 묻는 질문>","quick_replies":["선택지1","선택지2","선택지3"]}
  - 한 번에 한 가지 주제만 묻는다. quick_replies는 2~4개, 없으면 빈 배열.
- 충분하면: {"action":"generate","prompt":"<영어 비디오 프롬프트>","duration":"5"|"10","aspect_ratio":"9:16"|"1:1"|"16:9","summary":"<수집 내용 한국어 한 줄 요약>"}
  - prompt는 비디오 생성 모델용 영어 프롬프트다. 피사체·행동·카메라 워크·조명·분위기를 구체적으로, 사용자가 준 포인트를 빠짐없이 살려서 작성한다. 텍스트/자막을 화면에 넣으라는 지시는 하지 않는다.`;

export async function POST(req) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY가 설정되지 않았어요 (.env.local 확인)" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return Response.json({ error: "메시지가 비어 있어요" }, { status: 400 });
  }

  // 1회 재시도 포함 — JSON 파싱 실패 방어
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.map((m) => ({
            role: m.role === "me" ? "user" : "assistant",
            content: m.text,
          })),
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("OpenAI error:", res.status, detail.slice(0, 500));
      return Response.json(
        { error: "대화 모델 호출에 실패했어요. 잠시 후 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(raw);
      if (parsed.action === "ask" && typeof parsed.message === "string") {
        return Response.json({
          action: "ask",
          message: parsed.message,
          quick_replies: Array.isArray(parsed.quick_replies)
            ? parsed.quick_replies.slice(0, 4)
            : [],
        });
      }
      if (
        parsed.action === "generate" &&
        typeof parsed.prompt === "string" &&
        parsed.prompt.length > 0
      ) {
        return Response.json({
          action: "generate",
          prompt: parsed.prompt,
          duration: parsed.duration === "10" ? "10" : "5",
          aspect_ratio: ["9:16", "1:1", "16:9"].includes(parsed.aspect_ratio)
            ? parsed.aspect_ratio
            : "9:16",
          summary: typeof parsed.summary === "string" ? parsed.summary : "",
        });
      }
      // 스키마 불일치 → 재시도
    } catch {
      // 파싱 실패 → 재시도
    }
  }

  return Response.json(
    { error: "응답 해석에 실패했어요. 다시 한 번 보내 주세요." },
    { status: 502 }
  );
}
