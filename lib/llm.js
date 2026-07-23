// gpt-4o JSON 호출 헬퍼 — response_format json_object, 파싱 실패 시 1회 재시도
export async function callJson({ system, messages, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY, temperature = 0.4 }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았어요");
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM 호출 실패 (${res.status}) ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    try {
      return JSON.parse(data?.choices?.[0]?.message?.content ?? "");
    } catch {
      // 재시도
    }
  }
  throw new Error("LLM 응답 해석 실패");
}
