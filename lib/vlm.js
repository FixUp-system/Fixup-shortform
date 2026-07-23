// VLM 검수 — gpt-4o vision으로 후보 중 선택 + 합격 판정
export async function selectCandidate({ cut, candidates, refImageUrl, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  const content = [
    { type: "text", text: `숏폼 컷 검수. 나레이션: "${cut.sentence}"
후보 이미지들을 보고 JSON만 출력: {"selectedIndex":0부터 시작하는 최선 후보 번호,"passed":true|false(전원 불합격이면 false),"note":"한국어 한 줄 사유"}
검수 기준: 문장 의도 일치 / 신체·손가락 오류 / 이미지 안 글자 깨짐${refImageUrl ? " / 레퍼런스 피사체와 외형 일치" : ""}` },
    ...candidates.map((c) => ({ type: "image_url", image_url: { url: c.url } })),
  ];
  if (refImageUrl) content.push({ type: "text", text: "(마지막 이미지는 레퍼런스 원본)" }, { type: "image_url", image_url: { url: refImageUrl } });

  const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4o", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`VLM 검수 실패 (${res.status})`);
  const data = await res.json();
  const out = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  const selectedIndex = Number.isInteger(out.selectedIndex) && out.selectedIndex >= 0 && out.selectedIndex < candidates.length ? out.selectedIndex : 0;
  return { selectedIndex, passed: out.passed !== false, note: typeof out.note === "string" ? out.note : "" };
}
