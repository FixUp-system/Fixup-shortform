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
- **바로 만들기**: 사용자가 "그냥 만들어줘", "알아서 해줘", "바로 만들어", "질문 그만" 등 대화를 이어가고 싶지 않다는 신호를 보내면, 더 묻지 말고 즉시 generate 한다. 부족한 정보는 기본값으로 채운다: 길이 "5", 비율 "9:16", 느낌은 주제에 어울리게 네가 정한다.
- 아직 부족하면: {"action":"ask","message":"<한 가지만 묻는 질문>","quick_replies":["선택지1","선택지2","선택지3"]}
  - 한 번에 한 가지 주제만 묻는다. quick_replies는 2~4개.
  - quick_replies의 마지막에는 항상 "그냥 바로 만들어줘"를 넣는다 — 사용자가 언제든 질문을 건너뛰고 생성으로 갈 수 있게.
- 충분하면: {"action":"generate","prompt":"<영어 비디오 프롬프트>","duration":"5"|"10","aspect_ratio":"9:16"|"1:1"|"16:9","summary":"<수집 내용 한국어 한 줄 요약>"}

prompt 작성 규칙 (매우 중요 — 결과 품질을 좌우한다):
- 다음 순서로 구조화해 구체적으로 쓴다: [주체와 외형 묘사] → [행동: 무엇을 어떤 속도·타이밍으로] → [배경·환경] → [카메라: 샷 크기와 무빙] → [조명·색감] → [분위기·스타일 레퍼런스].
- 한 클립 = 한 장면 한 주체. 여러 사건을 욱여넣지 않는다.
- 사용자가 말한 구체 디테일(제품명·상황·포인트·느낌)은 하나도 빠뜨리지 말고 프롬프트에 녹인다. 일반적인 표현으로 뭉개지 않는다.
- 비디오 모델의 약점 회피: 빠른 스포츠 동작, 군중, 여러 인물의 상호작용, 손가락 클로즈업은 부자연스럽기 쉽다. 사용자가 명시하지 않았다면 슬로모션, 클로즈업, 단순한 카메라 무빙 등 모델이 잘하는 연출로 같은 의도를 표현한다.
- 화면에 텍스트/자막/로고를 넣으라는 지시는 하지 않는다 (글자가 깨진다).`;

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
            ? parsed.quick_replies.slice(0, 5)
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
