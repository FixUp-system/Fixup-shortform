// 브리핑 추출 — 자유 자료를 주제·핵심내용·대상·보고 나면으로 정리하고, 부족한 것만 되묻는다.
// 영상 성격(알림·판매·기록·이야기)은 자료를 보고 판단한다. 어느 쪽도 전제하지 않는다.
const SYSTEM = `너는 짧은 영상을 준비하는 사람의 자료를 정리하는 조수다.
반드시 JSON 하나만 출력:
{"topic":"이 영상이 무엇에 대한 것인지 한 줄",
 "key_points":["영상에 꼭 들어가야 할 내용"],
 "audience":"누가 보게 될지 (자료에 없으면 빈 문자열)",
 "takeaway":"보고 나면 어떤 마음이 들거나 무엇을 하길 바라는지 (없으면 빈 문자열)",
 "questions":[{"question":"되물을 것","options":["보기","보기"]}]}
규칙:
- 자료에 있는 사실만 쓴다. 없는 내용을 지어내지 않는다. 모르면 빈 문자열이나 빈 배열로 둔다.
- key_points는 자료에 나온 구체적인 것(이름·수치·시간·장소·특징)을 그대로 살린다.
- 질문은 최대 3개. 정보가 있어야만 채워지는 것만 묻는다 — 자료에 없어서 대본이 뭉뚱그려질 부분.
- 표현을 더 좋게 만드는 방법이나 취향은 묻지 않는다. 그건 조수가 알아서 할 몫이다.
- 무엇을 물을지는 자료의 성격에 따라 다르다. 파는 내용이면 가격·기간·조건이, 겪은 일이면 언제·어디서·누구와가 후보다.
- 각 질문에는 자료로 미루어 그럴듯한 보기를 2~4개 붙인다. 보기가 마땅치 않으면 빈 배열로 둔다.`;

export function buildBriefingMessages(project) {
  const { material, briefing } = project;
  const photos = material.photos.map((p) => `- ${p.filename}`).join("\n") || "(없음)";
  let user = `[자료 텍스트]
${material.text}
[올린 사진]
${photos}`;

  const asked = briefing?.asked || [];
  if (asked.length > 0) {
    const history = asked
      .map((a) => `- ${a.question} → ${a.answer || "(답 안 함)"}`)
      .join("\n");
    user += `\n\n[이미 물어본 것]\n${history}\n같은 것을 다시 묻지 말고, 이번에는 추가 질문 없이 questions를 빈 배열로 두고 정리만 다시 하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// 답한 흔적 판정 — done 플래그가 빠진 페이로드(answer만 저장)도 흡수해야 답변이 지워지지 않는다.
function isAnswered(a) {
  return a?.done === true || (typeof a?.answer === "string" && a.answer.trim() !== "");
}

// 질문 라운드는 1회 — 한 번이라도 답했거나 건너뛴 이력이 있으면 새 질문으로 갈아치우지 않는다.
export function mergeAsked(prevAsked, freshAsked) {
  const prev = Array.isArray(prevAsked) ? prevAsked : [];
  return prev.some(isAnswered) ? prev : freshAsked;
}

// 대본에 실제로 들어가는 내용만 추린 지문 — 재추출·PATCH 양쪽이 이 하나로 "바뀌었나"를 판정한다.
// asked는 답한 것만 넣는다: lib/script.js가 대본 프롬프트에 넣는 것도 answer가 있는 질문뿐이라,
// 답 없는 질문이 갈려도 대본은 달라지지 않는다(재추출이 질문만 바꿔도 거짓 안내가 뜨지 않게).
const trim = (v) => (typeof v === "string" ? v.trim() : "");

export function briefingSignature(briefing) {
  if (!briefing) return "";
  return JSON.stringify({
    topic: trim(briefing.topic),
    key_points: (Array.isArray(briefing.key_points) ? briefing.key_points : []).map(trim).filter(Boolean),
    audience: trim(briefing.audience),
    takeaway: trim(briefing.takeaway),
    answers: (Array.isArray(briefing.asked) ? briefing.asked : [])
      .filter((a) => trim(a?.answer))
      .map((a) => `${trim(a.question)}→${trim(a.answer)}`),
  });
}

// 브리핑 내용이 실제로 달라졌는가 — 버전은 "확정했다"가 아니라 이 판정에 묶인다.
export function briefingContentChanged(prev, next) {
  return briefingSignature(prev) !== briefingSignature(next);
}
