// VLM 검수 — gpt-4o vision 으로 그림 한 장을 합격·불합격 판정한다.
//
// 예전에는 후보 2장 중 고르는 일도 했다. 모델을 한 세대 올리면서 컷당 한 장만 만들게 되어
// 고를 것이 없어졌다(2026-07-29). 함수 이름은 그대로 두었다 — 검수를 제대로 손볼 때 함께
// 정리한다. 지금 바꾸면 모델 교체의 효과를 재는 diff 가 커진다.
//
// ⚠️ 이 검수는 지금 사실상 아무것도 걸러내지 못하고 있다(통과율 100%·재시도 0회, 명백한
//    오류를 여섯 번 통과시켰다). 왜 그런지는 별도 과제다. 그럼에도 남기는 이유는
//    나쁜 그림을 걸러낼 유일한 장치이기 때문이다.
import { fakeFal, fakeLlm } from "./fake";
import { toDataUri } from "./refs-io.js";
import { addRecord, assertBudget, costActor, estimateLlmCost } from "./costs";
import { randomUUID } from "crypto";

// sceneBasis: **그림이 실제로 그려진 글**. 부르는 쪽이 `sceneBasisOf(cut, project)`
// (lib/cuts.js)로 정해서 넘긴다 — 이 파일은 자기 조회식을 갖지 않는다.
//
// ★ 여기서 다시 판정하지 않는 이유가 돈이다. 예전에는 이 자리가 `scene?.shows || cut.sentence`
//   로 **사본**을 들고 있었고, 프롬프트 쪽 폴백이 낭독 문장을 걷은 날 두 기준이 갈렸다
//   (실측: 저장된 컷 46개 중 13컷). 검수 기준이 `장면 설명과 일치` 라 기준이 다르면 물릴
//   근거가 생기고, 물리면 파이프라인이 이미지를 한 장 더 산다(컷당 +$0.08, 크레딧 청구 없이
//   원가만 쌓인다). 그래서 판정은 cuts.js 한 자리에 두고 여기는 받은 값을 그대로 쓴다.
//
// ★ 빈 값이면 **장면 설명 줄과 '장면 설명과 일치' 기준을 함께 뺀다.** 프롬프트에도 `Scene:`
//   절이 없는 컷이라(그릴 근거가 아무것도 없다) 대조할 글 자체가 없다. 빈 문자열로 심사하면
//   VLM 이 무엇과 대조할지 모른 채 불합격을 낼 수 있고 그 판정이 유료 재시도를 부른다.
//   나머지 기준(손가락·글자 깨짐·반사·그림자)은 장면 설명 없이도 재므로 검수는 계속 돈다.
// refImage: { bytes, key } — 경로가 아니라 바이트다. 레퍼런스가 Storage 로 가면서
// 이 자리에서 파일을 열 수 없게 됐고, 어차피 파이프라인이 그림에 쓴 바로 그 바이트를
// 심사도 봐야 한다(따로 읽으면 그 사이에 달라질 수 있다).
export async function selectCandidate({ sceneBasis, candidates, refImage, projectId, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  // 테스트 모드 — 플레이스홀더에 검수는 의미 없으니 첫 후보를 통과시킨다(OpenAI 호출 없음).
  if (fakeFal()) {
    return { selectedIndex: 0, passed: true, note: "테스트 모드" };
  }
  const shows = typeof sceneBasis === "string" ? sceneBasis.trim() : "";
  const content = [
    { type: "text", text: `숏폼 컷 검수.${shows ? ` 장면 설명: "${shows}"` : ""}
이 이미지를 보고 JSON만 출력: {"passed":true|false,"note":"한국어 한 줄 사유"}
검수 기준: ${shows ? "장면 설명과 일치 / " : ""}신체·손가락 오류 / 이미지 안 글자 깨짐 / 거울·유리 반사가 실제와 어긋남(등지고 선 사람이 거울에 정면으로 비치는 등) / 그림자 방향이 빛과 어긋남${refImage ? " / 레퍼런스 피사체와 외형 일치" : ""}` },
    ...candidates.map((c) => ({ type: "image_url", image_url: { url: c.url } })),
  ];
  if (refImage?.bytes) {
    content.push(
      { type: "text", text: "(마지막 이미지는 레퍼런스 원본)" },
      { type: "image_url", image_url: { url: toDataUri(refImage.bytes, refImage.key) } }
    );
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
    // 무엇을 기준으로 심사했는지가 원장에 남아야 한다 — 기준이 없었던 것도 사실이라 적는다
    prompt: (shows || "(장면 기준 없음)").slice(0, 300),
    duration: `${data?.usage?.prompt_tokens ?? 0}+${data?.usage?.completion_tokens ?? 0}tok`,
    aspect_ratio: "-",
    est_cost_usd: estimateLlmCost(data?.model || "gpt-4o", data?.usage), status: "done", video_url: "-",
  }).catch(() => {});
  const out = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  // 후보가 한 장이라 고를 것이 없다. selectedIndex 는 호출부 호환을 위해 0 으로 고정한다.
  // passed 는 fail-open 이다 — 명시적 false 만 불합격으로 본다.
  return { selectedIndex: 0, passed: out.passed !== false, note: typeof out.note === "string" ? out.note : "" };
}

// 올린 사진에 무엇이 담겼나 — 인물인지 사물인지 가른다.
//
// 이 판정이 있어야 "원고의 인물 중 사진으로 덮이지 않은 사람"을 알 수 있고, 그 자리에만
// 아바타를 붙일 수 있다. 지금까지 화면 설계는 파일명만 보고 사진을 골랐다(IMG_2847.jpg).
//
// **VLM 실패로는 던지지 않는다.** 실패하면 사물로 취급한다 — 판정이 안 됐다고 대본이
// 멈추면 안 된다. 대가는 "사람 사진을 사물로 봐서 그 인물에 아바타가 붙는 것"인데,
// 2단계 출연 블록에서 사장님이 고친다.
//
// ⚠️ **다만 예산·신원은 던진다**(2026-08-12). `costActor()` 와 `assertBudget` 은 아래
// `try` **바깥**에 있어 fail-open catch 에 안 걸린다 — 돈이 막힌 것을 "사물"로 삼키면
// 사장님은 이유를 영영 못 본다. 그 둘만 예외이고 VLM 호출 실패는 예전 그대로다.
export async function describePhoto({ photoBytes, photoKey, projectId, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  const none = { person: false, what: "", who: null, lettering: "" };
  // fal(이미지)만 가짜인 모드는 OpenAI 가 진짜라 여기도 진짜로 돈다 — 얼굴 사진이
  // "가짜 이미지 모드로 한 번 돌렸다"는 이유만으로 사물로 굳어버리면 안 된다.
  // 둘 다 가짜인 모드(all)에서만 건너뛴다.
  if (fakeLlm()) return none;
  // actor 컨텍스트 부재는 여기서 즉시 던진다 — try 안에서 부르면 VLM 실패를 삼키는
  // fail-open catch 가 "컨텍스트를 안 씌운 호출부"까지 삼켜 조용히 "사물"로 오판정한다.
  const actor = costActor();
  // ★ 예산 그물 — 이 자리는 `requireVideoCharge` **앞**(③목소리 전)이라 크레딧 0 인
  // 체험 사장님이 밟는다. 같은 요청의 앞선 컷 분할 `callJson` 이 한 번 막아 주지만,
  // 그 한 번을 지난 뒤의 비전 호출 수는 **올린 사진 장수만큼**이라 사진을 많이 붙이면
  // 그물 밖 지출이 된다(사진 장수를 자르는 곳이 없다).
  //
  // ⚠️ 반드시 아래 `try` **바깥**이다. try 안의 catch 가 fail-open("사물"로 진행)이라
  // 안에 넣으면 `BudgetExceeded` 를 삼켜 조용히 오판정한다 — 위 actor 주석과 같은 이유다.
  //
  // amount 는 0 이다 — LLM 은 토큰 수를 호출한 뒤에야 안다(lib/llm.js 와 같은 처방).
  await assertBudget({ projectId, endpoint: "openai/gpt-4o", amount: 0 });
  try {
    const content = [
      { type: "text", text: `이 사진에 무엇이 담겼는지 본다. JSON만 출력: {"person":true|false,"what":"무엇이 보이는지 한 마디","who":"사람이면 나이대와 성별(예: 50대 남성), 사람이 아니면 빈 문자열","lettering":"제품에 인쇄된 글자를 보이는 그대로 (없거나 못 읽으면 빈 문자열)"}
person 은 사람의 얼굴·상반신이 알아볼 수 있게 담겼을 때만 true 다. 멀리 지나가는 행인이나 뒷모습만 있으면 false 다.
lettering 은 **제품 자체에 인쇄·각인된 글자**만 적는다(로고·브랜드명·태그). 배경 간판이나 포장 밖의 글자는 적지 않는다.
글자가 흐리거나 잘려서 확실하지 않으면 **비운다** — 짐작해서 채우면 그 짐작이 그대로 영상에 박힌다.
여러 개면 눈에 띄는 것부터 쉼표로 잇는다.` },
    ];
    if (photoBytes) {
      content.push({ type: "image_url", image_url: { url: toDataUri(photoBytes, photoKey) } });
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
      stage: "사진 판정", user: actor, project_id: projectId,
      prompt: String(photoKey || "-").slice(-60),
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
      // ★ 이 글자가 프롬프트에 **철자 그대로** 실린다(lib/cuts.js) — 모델이 사진에서 읽는
      //   것보다 받아쓰는 것이 훨씬 정확하다. 길면 자른다: 제품 로고는 짧고, 길다는 것은
      //   포장 뒷면의 성분표 같은 것을 읽었다는 뜻이라 프롬프트에 실을 값이 아니다.
      lettering: typeof out.lettering === "string" ? out.lettering.trim().slice(0, 80) : "",
    };
  } catch {
    return none; // 판정 실패는 사물로 — 흐름을 막지 않는다
  }
}
