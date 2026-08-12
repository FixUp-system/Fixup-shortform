// POST /api/chat — gpt-4o 로 영상 생성에 필요한 정보를 대화로 수집
// 응답: {action:"ask", message, quick_replies[]} 또는
//       {action:"generate", material_text, target_seconds, aspect_ratio, style, voice_label, summary}

import { withUser } from "../../../lib/auth/require-user.js";
import { addRecord, assertBudget, costActor, estimateLlmCost } from "../../../lib/costs";
import { randomUUID } from "crypto";
import { TARGET_CHOICES } from "../../../lib/script";
import { STYLE_PRESETS, DEFAULT_STYLE_ID } from "../../../lib/styles";
import { VOICES } from "../../../lib/voices";

const SYSTEM_PROMPT = `너는 shotform의 영상 제작 도우미다. 사용자와 한국어로 대화하며 숏폼 완성 영상(낭독+자막 포함) 제작에 필요한 정보를 수집한다.

수집할 정보:
1) 자료: 영상의 주제·내용·살릴 포인트 (사용자의 첫 메시지에 대부분 담겨 있다)
2) 길이와 비율: 길이는 15|30|45|60(초, 숫자), 비율은 "9:16" | "1:1" | "16:9"
3) 느낌·톤: 예) 따뜻하고 아기자기하게 / 밝고 경쾌하게 / 고급스럽고 차분하게

규칙:
- 반드시 JSON 하나만 출력한다. 다른 텍스트 금지.
- 이미 받은 정보는 절대 다시 묻지 않는다. 질문은 최소로 — 길이와 비율은 한 질문으로 함께 묻고, 그 외에는 자료가 정말 부족할 때만 묻는다.
- **바로 만들기**: 사용자가 "그냥 만들어줘", "알아서 해줘", "바로 만들어", "질문 그만" 등 신호를 보내면 즉시 generate 한다. 부족한 정보는 기본값: 길이 30, 비율 "9:16", 화풍·목소리·느낌은 주제에 어울리게 네가 정한다.
- 아직 부족하면: {"action":"ask","message":"<한 가지만 묻는 질문>","quick_replies":["선택지1","선택지2","선택지3"]}
  - quick_replies는 2~4개, 마지막에는 항상 "그냥 바로 만들어줘"를 넣는다.
- 충분하면:
  {"action":"generate",
   "material_text":"<자료 원문 — 대화에서 받은 사실·포인트를 한국어 서술형으로. 제품명·가격·기간 같은 구체 디테일은 하나도 빠뜨리지 않는다. 지어내지 않는다>",
   "target_seconds":15|30|45|60,
   "aspect_ratio":"9:16"|"1:1"|"16:9",
   "style":"photo"|"illust"|"anime"|"studio"|"render3d"|"film"|"scifi",
   "voice_label":"차분한 여성"|"밝은 여성"|"차분한 남성"|"밝은 남성",
   "summary":"<수집 내용 한국어 한 줄 요약>"}

style 선택 기준 (lib/styles.js 의 실제 프리셋과 같은 뜻으로 쓴다):
- "photo"(실사) — 사진처럼. 실제 가게·사람·현장을 보여줄 때. 모르겠으면 이것.
- "illust"(일러스트) — 손그림 삽화. 따뜻하고 부드러운, 동화책·수채 같은 아기자기한 감성.
- "anime"(애니메이션) — 일본 애니메이션 영화의 한 장면 같은 느낌. 지브리풍·셀 채색 감성은 여기다.
- "studio"(제품컷) — 배경이 비어 있는 깔끔한 제품 사진. 물건 하나를 단독으로 강조해 파는 영상에.
- "render3d"(3D) — 점토 인형 같은 말랑한 3D. 물건을 장난감처럼 주인공으로 세울 때.
- "film"(필름) — 필름으로 찍은 실사. 입자감 있고 따뜻하며 아날로그한 색.
- "scifi"(SF) — 미래적인 컨셉아트. 금속·유리·차가운 빛.
voice_label 선택 기준: 느낌이 밝으면 "밝은 여성"/"밝은 남성", 차분·고급이면 "차분한 여성"/"차분한 남성". 모르겠으면 "차분한 여성".
material_text 는 프롬프트가 아니라 **자료**다 — 영어로 쓰지 말고, 연출 지시를 넣지 말고, 사용자가 준 사실만 담는다.`;

export const POST = withUser(async (req) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY가 설정되지 않았어요 (.env.local 확인)" },
      { status: 500 }
    );
  }

  // ★ 이 라우트는 lib/llm.js 를 안 거치고 OpenAI 를 직접 부른다 — 그래서 오랫동안
  // 한도도 기록도 없었다. 승인만 받으면 크레딧 0 으로 gpt-4o 를 무한히 태울 수 있었고,
  // 그 지출은 우리 비용 화면에 **보이지도 않았다.**
  //
  // amount 는 0 이다 — 토큰 수는 호출한 뒤에야 안다(lib/llm.js 와 같은 이유).
  await assertBudget({ endpoint: "openai/gpt-4o", amount: 0 });

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
    // 파싱에 실패해 재시도하더라도 부른 값은 치렀다 — 그래서 파싱 앞에서 기록한다
    // (lib/llm.js 와 같은 규칙).
    const model = data?.model || "gpt-4o";
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint: `openai/${model}`,
      stage: "대화", user: costActor(), project_id: null,
      prompt: "", duration: `${data?.usage?.prompt_tokens ?? 0}+${data?.usage?.completion_tokens ?? 0}tok`,
      aspect_ratio: "-",
      est_cost_usd: estimateLlmCost(model, data?.usage), status: "done", video_url: "-",
    }).catch(() => {});
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
      const material = typeof parsed.material_text === "string" ? parsed.material_text.trim() : "";
      if (parsed.action === "generate" && material) {
        // 닫힌 목록은 코드가 판정한다 — LLM 이 목록 밖을 답해도 유료 호출로 새지 않게.
        // 조용한 폴백인 이유: 여기 값은 사장님이 고른 것이 아니라 LLM 의 추천이라,
        // 400 으로 대화를 끊는 것보다 기본값으로 이어 가는 쪽이 맞다.
        return Response.json({
          action: "generate",
          material_text: material.slice(0, 4000),
          target_seconds: TARGET_CHOICES.includes(parsed.target_seconds) ? parsed.target_seconds : 30,
          aspect_ratio: ["9:16", "1:1", "16:9"].includes(parsed.aspect_ratio) ? parsed.aspect_ratio : "9:16",
          style: STYLE_PRESETS.some((s) => s.id === parsed.style) ? parsed.style : DEFAULT_STYLE_ID,
          voice_label: VOICES.some((v) => v.label === parsed.voice_label) ? parsed.voice_label : VOICES[0].label,
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
});
