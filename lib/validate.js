// LLM 응답 스키마 방어 — 실패 시 null 반환 (호출측이 재시도 판단)
// sceneCount는 필수다. 문단이 장면과 1:1로 맞물리지 않으면 뒤의 컷·이미지가 전부 어긋난다.
export function validateScript(obj, sceneCount) {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) return null;
  if (!obj || !Array.isArray(obj.paragraphs) || obj.paragraphs.length !== sceneCount) return null;
  const paragraphs = [];
  for (const p of obj.paragraphs) {
    if (typeof p?.text !== "string" || !p.text.trim()) return null;
    paragraphs.push({ text: p.text });
  }
  return { paragraphs };
}

// 컷은 장면에서 갈라져 나온다 — scenes를 받아 소속 검증과 참조 사진 상속을 함께 한다.
export function validateCuts(obj, scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  if (!obj || !Array.isArray(obj.cuts) || obj.cuts.length === 0) return null;
  const out = [];
  for (const c of obj.cuts) {
    if (typeof c?.sentence !== "string" || !c.sentence.trim()) return null;
    // 초는 문자열로 와도 뜻이 명확하니 관용한다. 반면 scene_idx는 강제변환하지 않는다 —
    // null·""·[]가 조용히 0이 되면 그 컷은 근거 없이 장면 0의 화면을 그린다.
    const seconds = Number(c.seconds);
    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 15) return null;
    // 컷은 반드시 어느 장면의 것인지 밝힌다 — 이미지 프롬프트가 그 장면의 shows를 읽는다
    if (typeof c.scene_idx !== "number" || !Number.isInteger(c.scene_idx)) return null;
    const sceneIdx = c.scene_idx;
    if (sceneIdx < 0 || sceneIdx >= scenes.length) return null;
    // 모든 컷은 AI 생성. 사진은 화면에 직접 쓰지 않는다(구모델이 photo 컷을 내놔도 ai로 바꾼다).
    const cut = { idx: out.length, scene_idx: sceneIdx, sentence: c.sentence, seconds, source: "ai", regen_count: 0 };
    // 참조 사진은 컷이 고르지 않는다 — 한 장면의 컷들은 같은 대상을 그리므로 장면이 정한 사진을 물려받는다.
    // 그 값이 실제 사진 목록에 있는지는 validateSynopsis가 이미 걸렀다.
    const ref = scenes[sceneIdx]?.ref_photo_id;
    if (ref) cut.ref_photo_id = ref;
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
    // 없는 레퍼런스는 조용히 제거 — 사진 목록 검사는 여기서만 한다(컷은 장면 값을 물려받을 뿐)
    if (s.ref_photo_id && photoIds.includes(s.ref_photo_id)) scene.ref_photo_id = s.ref_photo_id;
    scenes.push(scene);
  }
  return { angle: obj.angle.trim(), scenes };
}
