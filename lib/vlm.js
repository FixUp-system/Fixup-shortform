// VLM 검수 — gpt-4o vision으로 후보 중 선택 + 합격 판정
import { promises as fs } from "fs";

export async function selectCandidate({ cut, candidates, refImagePath, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  // 테스트 모드 — 플레이스홀더에 검수는 의미 없으니 첫 후보를 통과시킨다(OpenAI 호출 없음).
  if (process.env.SHOTFORM_FAKE_IMAGES === "1") {
    return { selectedIndex: 0, passed: true, note: "테스트 모드" };
  }
  const content = [
    { type: "text", text: `숏폼 컷 검수. 나레이션: "${cut.sentence}"
후보 이미지들을 보고 JSON만 출력: {"selectedIndex":0부터 시작하는 최선 후보 번호,"passed":true|false(전원 불합격이면 false),"note":"한국어 한 줄 사유"}
검수 기준: 문장 의도 일치 / 신체·손가락 오류 / 이미지 안 글자 깨짐${refImagePath ? " / 레퍼런스 피사체와 외형 일치" : ""}` },
    ...candidates.map((c) => ({ type: "image_url", image_url: { url: c.url } })),
  ];
  if (refImagePath) {
    // 로컬 파일 → base64 data URI (상대경로 URL은 OpenAI가 읽을 수 없음)
    const buf = await fs.readFile(refImagePath);
    const ext = refImagePath.split(".").pop();
    const dataUri = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`;
    content.push({ type: "text", text: "(마지막 이미지는 레퍼런스 원본)" }, { type: "image_url", image_url: { url: dataUri } });
  }

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
