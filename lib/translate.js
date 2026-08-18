import { SUBTITLE_LANGS, isSubtitleLang } from "./subtitle-langs.js";

// 자막 번역 — **글자만** 옮긴다. 대본·나레이션·TTS는 그대로 한국어다
// (lib/subtitle-langs.js 머리말 참고: 자막 언어는 소리를 모른다).
//
// 이 파일은 지문과 검증기만 만든다. 모델을 실제로 부르는 것은 이 파일이 아니다
// (호출부가 lib/llm.js 의 callJson 에 이 { system, messages } 를 넘긴다).

// 무엇을 프롬프트로 "부탁"하고 무엇을 코드로 "강제"할지 가른 기준:
//   - 줄 수(개수)는 짝을 잃으면 엉뚱한 컷에 엉뚱한 자막이 붙는다 → validateTranslation 이 통째로 버린다.
//   - 제품명·수치·단위·설명 추가는 값으로 판정할 수 없다("숫자를 지켰는가"는 세면 되지만
//     "제품명을 옮기지 않았는가"는 언어마다 다른 표기라 규칙화가 안 된다) → 지문에 요청한다.
// 이 저장소가 배운 것: 금지를 쌓기만 하면 안 지켜진다(shows 필터가 겪은 패턴과 같다).
// 그래서 여기서는 금지를 나열하는 대신 **왜**를 한 줄씩만 붙인다 — "제품명을 옮기면 사실이
// 달라진다"처럼 이유가 있는 규칙이 이유 없는 규칙보다 오래 지켜진다는 것이 이 저장소의 경험이다.
// 개수처럼 코드로 셀 수 있는 것은 코드가 쥐고, 나머지는 프롬프트가 최선을 다한다.
function translateSystem(lang) {
  return `너는 짧은 영상의 자막을 옮기는 번역가다. 나레이션은 한국어 그대로이고, 화면에 박히는
자막 글자만 ${lang.line}로 옮긴다.
반드시 JSON 하나만 출력: {"lines": ["...", ...]}
규칙:
- 줄 수는 받은 문장 수와 **정확히 같아야 한다**. 합치거나 나누지 마라 — 컷마다 화면에 뜨는 자막이다.
- 자막이다. 화면에 박히는 글자라 짧고 읽기 쉬워야 한다. 원문보다 길어지지 않게 한다.
- 제품명·브랜드·수치·단위는 그대로 둔다. 옮기면 사실이 달라진다.
- 설명을 더하지 않는다. 원문에 없는 말을 넣지 않는다.
- 문장 부호는 ${lang.line}의 관습을 따른다(중국어 。，, 일본어 。、).`;
}

// cuts: [{ sentence }, ...] — validateCutRanges 가 만드는 것과 같은 모양이다.
// 무음 컷(silent:true)은 문장이 없다. 여기서는 그 컷도 자리를 지킨다 — 번호가 밀리면
// 짝이 어긋난다(SHOWS_SYSTEM 의 buildShowsMessages 와 같은 이유).
export function buildTranslateMessages(cuts, langId) {
  const lang = SUBTITLE_LANGS.find((l) => l.id === langId);
  if (!lang || !isSubtitleLang(langId)) throw new Error(`알 수 없는 자막 언어: ${langId}`);
  const list = (cuts || [])
    .map((c, i) => `${i + 1}. ${c?.silent ? "(말 없는 장면)" : c?.sentence || ""}`)
    .join("\n");
  return {
    system: translateSystem(lang),
    messages: [{ role: "user", content: `[한국어 문장 ${cuts.length}개]\n${list}` }],
  };
}

// validateShows(lib/validate.js) 와 같은 모양이다 — 개수가 안 맞으면 통째로 버린다.
// 짝이 밀리면 엉뚱한 컷에 엉뚱한 자막이 붙기 때문이다.
export function validateTranslation(obj, cutCount) {
  if (!Number.isInteger(cutCount) || cutCount < 1) return null;
  if (!obj || !Array.isArray(obj.lines) || obj.lines.length !== cutCount) return null;
  const out = [];
  for (const line of obj.lines) {
    const text = typeof line === "string" ? line.trim() : "";
    if (!text) return null; // 빈 줄이 하나라도 있으면 통째로 버린다
    out.push(text);
  }
  return out;
}

// 각인으로 낡음을 판정한다 — isImageStale·isClipStale(lib/steps.js) 와 같은 계열이다.
// 다른 점 하나: 저 쪽은 "각인이 없으면 안 낡았다"(옛 산출물 보호, 유료 호출을 막는다).
// 여기는 반대다 — 번역이 없으면 아직 값을 치른 적이 없으니 보호할 옛 산출물이 없고,
// **만들어야 할 것이 안 만들어진 상태**라 낡음으로 본다(브리핑이 못 박은 규칙).
// ★ sourceLang — 이 영상이 **말한** 언어(= 대사 원문의 언어). 2026-08-18 에 인자가 늘었다.
//   예전에는 "ko" 가 글자 그대로 박혀 있었는데, 그것은 원문이 언제나 한국어이던 시절의
//   사실이다. 일본어로 말하는 영상에서는 ja 가 원문이라 ja 자막에 번역이 필요 없고,
//   반대로 **한국어 자막에 번역이 필요하다**.
//   ★ 기본값을 "ko" 로 두어 옛 호출자는 글자 그대로 예전처럼 돈다.
export function isSubtitleStale(cut, langId, sourceLang = "ko") {
  if (langId === sourceLang) return false; // 말한 언어가 곧 원문이고, 원문이 곧 자막이다
  const of = cut?.subtitles?.[langId]?.of;
  if (of === undefined) return true;
  return of !== cut?.sentence;
}
