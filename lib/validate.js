import { secondsForText } from "./script";

// LLM 응답 스키마 방어 — 실패 시 null 반환 (호출측이 재시도 판단)
// 대본은 장면으로 끊기지 않은 하나의 원고다. 컷은 이 원고를 잘라서 만든다.
export function validateScript(obj) {
  const text = typeof obj?.script === "string" ? obj.script.trim() : "";
  if (!text) return null;
  // 한 문장짜리 원고는 대본이 아니다. 상한은 프롬프트가 목표 분량으로 쥐고,
  // 여기서는 파이프라인이 감당 못 할 크기만 막는다(초당 5.5자로 3분 분량).
  if (text.replace(/\s/g, "").length < 20) return null;
  if (text.length > 2000) return null;
  return { text };
}

// 컷은 원고에서 갈라져 나온다. LLM은 경계(문장 번호)만 고르고 텍스트는 코드가 자른다 —
// 문장을 모델이 다시 쓰게 두면 사장님이 승인한 원고가 이미지 단계에서 조용히 달라진다.
// sentences는 원고를 문장으로 나눈 배열이고, from·to는 1부터 세는 포함 구간이다.
export function validateCutRanges(obj, sentences) {
  if (!Array.isArray(sentences) || sentences.length === 0) return null;
  if (!obj || !Array.isArray(obj.cuts) || obj.cuts.length === 0) return null;
  const out = [];
  let expected = 1; // 앞 컷 다음 문장에서 이어져야 한다 — 빈틈도 겹침도 허용하지 않는다
  for (const c of obj.cuts) {
    // 강제변환하지 않는다. null·""·[]가 0이 되면 경계가 조용히 어긋난다.
    if (!Number.isInteger(c?.from) || !Number.isInteger(c?.to)) return null;
    if (c.from !== expected || c.to < c.from || c.to > sentences.length) return null;
    const sentence = sentences.slice(c.from - 1, c.to).join(" ").trim();
    if (!sentence) return null;
    // 초는 LLM에게 묻지 않는다 — 자른 글자수가 곧 낭독 시간이다
    out.push({ idx: out.length, sentence, seconds: secondsForText(sentence), source: "ai", regen_count: 0 });
    expected = c.to + 1;
  }
  // 원고의 마지막 문장까지 다 쓰였는가 — 뒤를 잘라먹으면 승인한 대본이 사라진다
  if (expected !== sentences.length + 1) return null;
  return out;
}

// 화면 패스 응답 — 컷 수만큼의 '보여줌'. 개수가 맞지 않으면 통째로 버린다
// (짝이 밀리면 엉뚱한 문장에 엉뚱한 그림이 붙는다).
export function validateShows(obj, cutCount, photoIds = []) {
  if (!Number.isInteger(cutCount) || cutCount < 1) return null;
  if (!obj || !Array.isArray(obj.shots) || obj.shots.length !== cutCount) return null;
  const out = [];
  for (const s of obj.shots) {
    const shows = typeof s?.shows === "string" ? s.shows.trim() : "";
    if (!shows) return null;
    const shot = { shows };
    // 없는 레퍼런스는 조용히 제거 — 첨부되지 않을 사진을 가리키는 지시는 그림을 망친다
    if (s.ref_photo_id && photoIds.includes(s.ref_photo_id)) shot.ref_photo_id = s.ref_photo_id;
    out.push(shot);
  }
  return out;
}

// 이야기 소재 질문 방어 — 보기 없이 질문만 받는다(사장님만 아는 이야기라 보기를 만들면
// 없는 사실이 굳는다). 상한 3개는 여기서 자른다.
export function validateDevelopQuestions(obj) {
  if (!Array.isArray(obj?.questions)) return null;
  const out = obj.questions
    .filter((q) => typeof q?.question === "string" && q.question.trim())
    .slice(0, 3)
    .map((q) => ({ question: q.question.trim(), options: [], answer: null, done: false, kind: "develop" }));
  return out.length ? out : null;
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
