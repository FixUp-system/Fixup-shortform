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
    // 모든 컷은 AI 생성. 사진은 화면에 직접 쓰지 않는다.
    // 구모델이 photo 컷을 내놔도 그 사진을 레퍼런스로 승격해, 사진이 결과에 반영되되 항상 생성을 거친다.
    const cut = { idx: out.length, sentence: c.sentence, seconds, source: "ai", regen_count: 0 };
    const ref = c.ref_photo_id || c.photo_id;
    if (ref && photoIds.includes(ref)) cut.ref_photo_id = ref; // 없는 레퍼런스는 조용히 제거
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

// 구성 응답 방어 — 스키마만 본다(장면 내용의 품질은 판정하지 않는다).
// 장면 수 하한(3)은 프롬프트가 지시한다. 얕은 자료에서 2장면이 나왔다고 진행 자체를 막으면
// 사장님이 아무것도 못 하게 된다. 상한만 둔다.
export function validateSynopsis(obj, photoIds = []) {
  if (!obj || typeof obj.angle !== "string" || !obj.angle.trim()) return null;
  if (!Array.isArray(obj.scenes) || obj.scenes.length === 0 || obj.scenes.length > 8) return null;
  const scenes = [];
  for (const s of obj.scenes) {
    if (typeof s?.role !== "string" || !s.role.trim()) return null;
    if (typeof s?.shows !== "string" || !s.shows.trim()) return null;
    if (typeof s?.says !== "string" || !s.says.trim()) return null;
    const seconds = Number(s.seconds);
    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 15) return null;
    const facts = Array.isArray(s.facts)
      ? s.facts.filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim())
      : [];
    const scene = { role: s.role.trim(), shows: s.shows.trim(), says: s.says.trim(), seconds, facts };
    // 없는 레퍼런스는 조용히 제거 — validateCuts와 같은 방식
    if (s.ref_photo_id && photoIds.includes(s.ref_photo_id)) scene.ref_photo_id = s.ref_photo_id;
    scenes.push(scene);
  }
  return { angle: obj.angle.trim(), scenes };
}
