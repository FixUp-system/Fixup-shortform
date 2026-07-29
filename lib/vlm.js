// VLM 검수 — gpt-4o vision으로 후보 중 선택 + 합격 판정
import { promises as fs } from "fs";
import { fakeFal } from "./fake";
import { addRecord, costActor, estimateLlmCost } from "./costs";
import { randomUUID } from "crypto";

// scene: 이 컷이 속한 장면(②구성). 그림은 장면의 '보여줌'으로 그리므로 심사도 같은 기준으로 한다 —
// 나레이션 문장으로 심사하면 "보이는 것을 말로 반복하지 않는" 설계대로 잘 그린 그림일수록 떨어진다.
// 구성이 없는 옛 프로젝트는 예전처럼 문장으로 폴백한다.
export async function selectCandidate({ cut, scene, candidates, refImagePath, projectId, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  // 테스트 모드 — 플레이스홀더에 검수는 의미 없으니 첫 후보를 통과시킨다(OpenAI 호출 없음).
  if (fakeFal()) {
    return { selectedIndex: 0, passed: true, note: "테스트 모드" };
  }
  const shows = scene?.shows || cut.sentence;
  const content = [
    { type: "text", text: `숏폼 컷 검수. 장면 설명: "${shows}"
후보 이미지들을 보고 JSON만 출력: {"selectedIndex":0부터 시작하는 최선 후보 번호,"passed":true|false(전원 불합격이면 false),"note":"한국어 한 줄 사유"}
검수 기준: 장면 설명과 일치 / 신체·손가락 오류 / 이미지 안 글자 깨짐 / 거울·유리 반사가 실제와 어긋남(등지고 선 사람이 거울에 정면으로 비치는 등) / 그림자 방향이 빛과 어긋남${refImagePath ? " / 레퍼런스 피사체와 외형 일치" : ""}` },
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
  // 이미지를 입력으로 넣는 호출이라 토큰이 적지 않다 — 검수도 돈이 든다
  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint: `openai/${data?.model || "gpt-4o"}`,
    stage: "검수", user: costActor(), project_id: projectId,
    prompt: String(shows).slice(0, 300),
    duration: `${data?.usage?.prompt_tokens ?? 0}+${data?.usage?.completion_tokens ?? 0}tok`,
    aspect_ratio: "-",
    est_cost_usd: estimateLlmCost(data?.model || "gpt-4o", data?.usage), status: "done", video_url: "-",
  }).catch(() => {});
  const out = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  const selectedIndex = Number.isInteger(out.selectedIndex) && out.selectedIndex >= 0 && out.selectedIndex < candidates.length ? out.selectedIndex : 0;
  return { selectedIndex, passed: out.passed !== false, note: typeof out.note === "string" ? out.note : "" };
}

// 올린 사진에 무엇이 담겼나 — 인물인지 사물인지 가른다.
//
// 이 판정이 있어야 "원고의 인물 중 사진으로 덮이지 않은 사람"을 알 수 있고, 그 자리에만
// 아바타를 붙일 수 있다. 지금까지 화면 설계는 파일명만 보고 사진을 골랐다(IMG_2847.jpg).
//
// **던지지 않는다.** 실패하면 사물로 취급한다 — 판정이 안 됐다고 대본이 멈추면 안 된다.
// 대가는 "사람 사진을 사물로 봐서 그 인물에 아바타가 붙는 것"인데, 2단계 출연 블록에서
// 사장님이 고친다.
export async function describePhoto({ photoPath, projectId, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  const none = { person: false, what: "", who: null };
  if (fakeFal()) return none;
  try {
    const content = [
      { type: "text", text: `이 사진에 무엇이 담겼는지 본다. JSON만 출력: {"person":true|false,"what":"무엇이 보이는지 한 마디","who":"사람이면 나이대와 성별(예: 50대 남성), 사람이 아니면 빈 문자열"}
person 은 사람의 얼굴·상반신이 알아볼 수 있게 담겼을 때만 true 다. 멀리 지나가는 행인이나 뒷모습만 있으면 false 다.` },
    ];
    if (photoPath) {
      const buf = await fs.readFile(photoPath);
      const ext = photoPath.split(".").pop();
      content.push({ type: "image_url", image_url: { url: `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}` } });
    }
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) return none;
    const data = await res.json();
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint: `openai/${data?.model || "gpt-4o"}`,
      stage: "사진 판정", user: costActor(), project_id: projectId,
      prompt: String(photoPath || "-").slice(-60),
      duration: `${data?.usage?.prompt_tokens ?? 0}+${data?.usage?.completion_tokens ?? 0}tok`,
      aspect_ratio: "-",
      est_cost_usd: estimateLlmCost(data?.model || "gpt-4o", data?.usage), status: "done", video_url: "-",
    }).catch(() => {});
    const out = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    const person = out.person === true;
    return {
      person,
      what: typeof out.what === "string" ? out.what : "",
      who: person && typeof out.who === "string" && out.who.trim() ? out.who.trim() : null,
    };
  } catch {
    return none; // 판정 실패는 사물로 — 흐름을 막지 않는다
  }
}
