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
// refIds — 실제로 첨부될 수 있는 id 전부(출연 id + 사진 id).
// 상한 2: 인물 하나 + 사물 하나. 장수가 늘면 모델이 무엇을 따를지 헷갈린다.
const SHOT_REF_MAX = 2;

export function validateShows(obj, cutCount, refIds = []) {
  if (!Number.isInteger(cutCount) || cutCount < 1) return null;
  if (!obj || !Array.isArray(obj.shots) || obj.shots.length !== cutCount) return null;
  const out = [];
  for (const s of obj.shots) {
    const shows = typeof s?.shows === "string" ? s.shows.trim() : "";
    if (!shows) return null;
    const shot = { shows };
    // motion 은 없어도 컷을 버리지 않는다 — 그림은 나오고 움직임만 기본값이 된다.
    // shows 와 달리 필수가 아닌 이유: 이것이 없다고 컷이 못 쓸 것이 되지는 않는다.
    const motion = typeof s?.motion === "string" ? s.motion.trim() : "";
    if (motion) shot.motion = motion;
    // 없는 레퍼런스는 조용히 제거 — 첨부되지 않을 것을 가리키는 지시는 그림을 망친다
    const refs = (Array.isArray(s?.ref_ids) ? s.ref_ids : [])
      .filter((id) => refIds.includes(id))
      .slice(0, SHOT_REF_MAX);
    if (refs.length) shot.ref_ids = refs;
    out.push(shot);
  }
  return out;
}

// 캐스팅 방어 — 인물, 아바타 선택, 그리고 그 인물이 나오는 컷 번호를 검사한다.
//
// 모델은 컷을 1부터 센다(0부터 세게 하면 틀린다). 여기서 0부터인 내부 인덱스로 바꾼다.
// 나오는 컷이 하나도 안 남은 인물은 버린다 — 꽂을 데가 없는 인물은 아무 일도 하지 않는다.
const CAST_MAX = 4;

export function validateCast(obj, avatarIds = [], cutCount = 0) {
  if (!obj || !Array.isArray(obj.cast)) return null;
  const out = [];
  for (const c of obj.cast) {
    const who = typeof c?.who === "string" ? c.who.trim() : "";
    if (!who) continue; // 누구인지 모르는 항목은 쓸 데가 없다
    if (!Array.isArray(c?.cuts)) continue;
    const cuts = [...new Set(
      c.cuts
        .filter((n) => Number.isInteger(n))
        .map((n) => n - 1) // 1부터 → 0부터
        .filter((n) => n >= 0 && n < cutCount)
    )].sort((a, b) => a - b);
    if (!cuts.length) continue; // 꽂을 컷이 없다
    const person = { id: `c${out.length + 1}`, who };
    // 없는 아바타는 조용히 제거 — 첨부되지 않을 사진을 가리키는 지시는 그림을 망친다
    if (c.avatar_id && avatarIds.includes(c.avatar_id)) person.avatar_id = c.avatar_id;
    person.cuts = cuts;
    out.push(person);
    if (out.length >= CAST_MAX) break; // 30초 영상에 다섯 명 이상은 담기지 않는다
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

// 이미 아는 것을 되묻는 질문을 걸러낸다.
//
// 프롬프트에 "자료나 key_points 에 적혀 있으면 버려라"를 예시까지 들어 적었는데도 어겼다
// (자료에 "성수역 2번 출구에서 도보 3분"을 넣어 두고 "수리점의 정확한 위치는?"을 물었다).
// 이 저장소가 같은 실패를 여러 번 겪었다 — 지켜져야 하는 것은 프롬프트가 아니라 코드가 쥔다.
//
// 표면 문자열 대조로는 못 잡는다("위치"와 "출구·거리"는 한 글자도 겹치지 않는다).
// 그래서 묻는 갈래를 알아보고, 그 갈래의 답이 자료에 **구체적으로** 있으면 버린다.
// 구체성을 따지는 이유: "성수동에서 합니다"만 있는 자료에 "정확한 위치는?"은 정당한 질문이다.
const ANSWERED_ALREADY = [
  // 어디 — 동 이름만으로는 부족하다. 역·출구·골목처럼 찾아갈 수 있는 표지가 있어야 답이 있는 것이다
  { asks: /어디|위치|주소|장소|어느\s*곳/, found: /[가-힣]역|출구|골목|시장|번지|[0-9]+\s*층|건너편|맞은편|옆\s*(골목|건물)/ },
  // 얼마 — 숫자와 화폐 단위가 붙어 있어야 한다
  { asks: /얼마|가격|비용|요금|값/, found: /[0-9][0-9,]*\s*원|무료|공짜/ },
  // 언제 — 시각·요일·기간 표지
  { asks: /언제|몇\s*시|영업\s*시간|운영\s*시간|여는|닫는|쉬는\s*날|휴무/, found: /[0-9]+\s*시|오전|오후|평일|주말|[월화수목금토일]요일|휴무|쉽니다|연중/ },
  // 얼마나 걸리나 — 소요 시간
  { asks: /얼마나\s*(걸|오래)|소요|며칠|기간/, found: /[0-9]+\s*(분|시간|일|주|개월|년)/ },
];

export function dropAnsweredQuestions(questions, haystack) {
  const hay = String(haystack || "");
  return (questions || []).filter((q) => {
    const text = typeof q?.question === "string" ? q.question : "";
    return !ANSWERED_ALREADY.some((rule) => rule.asks.test(text) && rule.found.test(hay));
  });
}

// 브리핑 추출 응답 방어. 질문은 최대 3개·보기 4개로 자른다(상한을 LLM 재량에 맡기지 않는다).
// materialText 를 주면 이미 답이 있는 질문을 걸러낸다(안 주면 key_points 만 본다).
export function validateBriefing(obj, materialText = "") {
  if (!obj || typeof obj.topic !== "string" || !obj.topic.trim()) return null;
  if (!Array.isArray(obj.key_points)) return null;
  const key_points = obj.key_points
    .filter((k) => typeof k === "string" && k.trim())
    .map((k) => k.trim());
  if (key_points.length === 0) return null;

  const asked = [];
  // 자료 원문과 방금 뽑은 사실을 함께 놓고, 이미 답이 있는 질문을 버린다
  const known = `${materialText}\n${key_points.join("\n")}`;
  const questions = dropAnsweredQuestions(Array.isArray(obj.questions) ? obj.questions : [], known);
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
