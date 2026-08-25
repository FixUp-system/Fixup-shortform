// reel 의 **컨셉** — 무엇을 만들 영상인가를 큰 범주로 고른다.
//
// ★★ 왜 이 파일이 생겼나(2026-08-25 사장님 지시). 그전에는 `lib/ad/options.js` 의
//   AD_FORMATS(제품 히어로·언박싱·비포·애프터·브랜드 스토리·사용 후기)를 그대로 썼다.
//   다섯이 전부 **"팔 물건이 있다"** 를 전제로 한 광고 문법이라, reel 이 하려는 범용
//   영상에는 좁았다 — 가게 일상도, 만드는 과정도, 알려 주는 영상도 고를 칸이 없었다.
//   사장님 말: *"좀 더 큰 카테고리화하는거야. 제품 홍보, 정보 전달, 등등."*
//   옛 다섯은 새 표의 **"제품 홍보" 한 칸 안에** 다 들어간다.
//
// ★★ **광고 흐름은 안 건드린다**(사장님이 남겨 두기로 했다). 그래서 이 표를
//   lib/ad/options.js 에 더하지 않고 파일을 새로 냈다. 지시문도 선택 인자 하나로
//   갈린다(lib/ad/scenario.js 의 conceptLine) — 안 넘기면 광고는 글자 그대로 예전이다.
//
// ★ 이 파일은 **화면("use client")이 import 한다.** import 문을 늘리지 마라 —
//   사슬 끝에 `fs` 가 닿으면 빌드가 깨진다(CLAUDE.md 의 그 목록과 같은 처지다).
//   지금은 import 가 0 이다.

// 고르는 값. `beat` 가 시나리오 LLM 에 실릴 **구성 한 줄**이다 — AD_FORMATS 의 beat 가
// 하던 일과 같은 자리다.
//
// ★ 맨 앞이 [알아서]이고 기본값이다. 처음 쓰는 사람은 아무것도 안 골라도 되고, 그리려는
//   그림이 있는 사람만 고른다. 컷 수를 LLM 에 맡긴 것(lib/reel/scenario-rules.js)과 같은 결.
export const REEL_CONCEPTS = Object.freeze([
  Object.freeze({
    id: "auto",
    label: "알아서",
    // ★ beat 가 **없다.** 이 값을 고르면 구성 줄을 아예 안 싣는다 — 빈 문자열을 실으면
    //   모델이 그 자리를 지어내 채운다(lib/reel/clip-prompt.js 가 같은 이유로 빈 줄을 뺀다).
    beat: null,
    desc: "무엇을 만들지 모르겠으면 이대로 두세요 — 적어 주신 내용을 읽고 알아서 구성해요",
  }),
  Object.freeze({
    id: "product",
    label: "제품 홍보",
    beat: "팔 물건이 주인공이다. 등장 → 가까이 → 쓰는 순간 → 마무리.",
  }),
  Object.freeze({
    id: "info",
    label: "정보 전달",
    beat: "알려 주는 것이 주인공이다. 무엇을 → 왜 → 어떻게 순으로 쌓는다.",
  }),
  Object.freeze({
    id: "process",
    label: "과정 보여주기",
    beat: "손과 재료가 화면을 채운다. 준비 → 만드는 중 → 완성. 말보다 소리와 움직임이 이끈다.",
  }),
  Object.freeze({
    id: "place",
    label: "공간 소개",
    beat: "장소가 주인공이다. 밖에서 안으로 들어가며 훑는다.",
  }),
  Object.freeze({
    id: "story",
    label: "이야기",
    beat: "장면을 쌓아 분위기를 만들고 마지막에 닫는다. 설명하지 않는다.",
  }),
  Object.freeze({
    id: "talk",
    label: "사람이 말한다",
    beat: "사람이 카메라를 보고 말한다. 나레이션이 주인공이고 화면이 그것을 받친다.",
  }),
]);

export const DEFAULT_REEL_CONCEPT = "auto";

// 옛 프로젝트가 든 값 — AD_FORMATS 의 id 다. 다섯 다 "팔 물건이 주인공"이라 제품 홍보로
// 읽는다. 이 자리가 없으면 옛 프로젝트가 시나리오를 다시 쓸 때 고른 뜻을 통째로 잃는다.
// ★ 새 id 와 겹치지 않는다("story" 는 양쪽에 있는데, 뜻이 같아 옮길 것이 없다 —
//   아래 판정이 **새 표를 먼저** 보므로 story 는 그대로 story 다).
const LEGACY_AD_FORMATS = Object.freeze(["hero", "unboxing", "before_after", "testimonial"]);

const has = (id) => REEL_CONCEPTS.some((c) => c.id === id);

// 모르는 값은 **던지지 않고** 기본값으로 떨어뜨린다 — 이 함수를 화면이 부르기 때문이다.
// 값이 틀리는 것보다 화면이 사라지는 것이 나쁘다(lib/pricing.js 의 videoPrice 와 같은 원칙).
// ⚠️ 라우트는 이 관용을 그대로 쓰면 안 되는 자리가 아니다 — 컨셉은 값을 가르는 축이
//   아니라서(길이·화질과 다르다) 조용히 기본값이 되어도 돈이 새지 않는다.
export function normalizeReelConcept(v) {
  const id = typeof v === "string" ? v.trim() : "";
  if (has(id)) return id;
  if (LEGACY_AD_FORMATS.includes(id)) return "product";
  return DEFAULT_REEL_CONCEPT;
}

// 시나리오 지시문에 실릴 한 줄. **null 이면 안 싣는다**([알아서]가 그 자리다).
export function reelConceptLine(v) {
  const c = REEL_CONCEPTS.find((x) => x.id === normalizeReelConcept(v));
  return c?.beat ? `구성: ${c.label} — ${c.beat}` : null;
}
