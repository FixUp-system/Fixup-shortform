// LLM 응답 스키마 방어 — 실패 시 null 반환 (호출측이 재시도 판단)
export function validateScript(obj) {
  if (!obj || !Array.isArray(obj.paragraphs) || obj.paragraphs.length === 0) return null;
  const paragraphs = [];
  for (const p of obj.paragraphs) {
    if (typeof p?.tag !== "string" || typeof p?.text !== "string" || !p.text.trim()) return null;
    paragraphs.push({ tag: p.tag, text: p.text });
  }
  const coverage = Array.isArray(obj.coverage)
    ? obj.coverage.filter((c) => typeof c === "string")
    : [];
  return { paragraphs, coverage };
}

export function validateCuts(obj, photoIds) {
  if (!obj || !Array.isArray(obj.cuts) || obj.cuts.length === 0) return null;
  const out = [];
  for (const c of obj.cuts) {
    if (typeof c?.sentence !== "string" || !c.sentence.trim()) return null;
    const seconds = Number(c.seconds);
    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 15) return null;
    const source = c.source === "photo" ? "photo" : "ai";
    const cut = { idx: out.length, sentence: c.sentence, seconds, source, regen_count: 0 };
    if (source === "photo") {
      if (!photoIds.includes(c.photo_id)) return null; // 사진 컷인데 사진이 없으면 스키마 실패
      cut.photo_id = c.photo_id;
    } else if (c.ref_photo_id && photoIds.includes(c.ref_photo_id)) {
      cut.ref_photo_id = c.ref_photo_id; // 없는 레퍼런스는 조용히 제거
    }
    out.push(cut);
  }
  return out;
}

// 브리핑 추출 응답 방어. 질문은 최대 3개·보기 4개로 자른다(상한을 LLM 재량에 맡기지 않는다).
export function validateBriefing(obj) {
  if (!obj || typeof obj.topic !== "string" || !obj.topic.trim()) return null;
  if (!Array.isArray(obj.key_points)) return null;
  const key_points = obj.key_points
    .filter((k) => typeof k === "string" && k.trim())
    .map((k) => k.trim());
  if (key_points.length === 0) return null;

  const asked = [];
  const questions = Array.isArray(obj.questions) ? obj.questions : [];
  for (const q of questions) {
    if (asked.length >= 3) break;
    if (typeof q?.question !== "string" || !q.question.trim()) continue;
    const options = (Array.isArray(q.options) ? q.options : [])
      .filter((o) => typeof o === "string" && o.trim())
      .map((o) => o.trim())
      .slice(0, 4);
    asked.push({ question: q.question.trim(), options, answer: null, done: false });
  }

  const str = (v) => (typeof v === "string" ? v.trim() : "");
  return { topic: obj.topic.trim(), key_points, audience: str(obj.audience), takeaway: str(obj.takeaway), asked };
}
