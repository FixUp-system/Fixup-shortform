// 사진 상한 — **화면과 서버가 같은 값을 봐야 하는** 자리.
//
// ★ 갈리면 화면은 통과시키는데 서버가 400 을 낸다. 사장님은 사진을 다 올린 뒤에야
//   거절당한다 — 올리는 데 든 시간이 통째로 버려진다.
// ★ base64 는 1.33배로 부는데 fal 요청 본문에 통째로 실린다. 그래서 넉넉히 두지 않는다.
//
// ⚠️ 광고 경로(app/ads/new/page.js · app/api/ads/route.js · app/api/ads/[id]/route.js)에는
//   아직 같은 상수가 손으로 적혀 있다. 여기로 모으지 않은 이유는 tests/ad-ui.test.js 가
//   그 화면 소스에서 `MAX_PHOTOS = 4` 라는 **글자**를 직접 재고 있어서다 — 남의 태스크의
//   테스트를 이 태스크에서 고치지 않는다. 그쪽을 정리할 때 이 파일을 쓰면 된다.
export const MAX_PHOTOS = 4;

// ── 사진의 종류(2026-08-31 사장님 지시) ─────────────────────────────────────
//
// 그전에는 `＋사진` 하나로 전부 받아서 프롬프트가 그 사진들을 **뭉뚱그려** 가리켰다 —
// 원클릭은 *"첨부한 순서대로 @Image1 · @Image2 다"*, 단계별은 *"The attached images show
// what this scene, the person and the product look like."* 즉 **어느 것이 로고이고 어느
// 것이 제품인지 모델이 몰랐다.**
//
// ★★ 이름이 `role` 인 이유 — `resolveCutRefs`(lib/cast.js)가 이미 ref 마다 `kind`
//   (thing·person)를 달고 있다. 같은 함수 안에 뜻이 다른 `kind` 가 둘이면 반드시 헷갈린다.
//
// ★ `ko` 는 **시나리오를 쓰는 LLM**에게 가는 한국어 지시문에, `en` 은 **그림·영상 모델**이
//   읽는 영어 프롬프트에 실린다. 두 언어를 한 표에 두는 이유는 갈리면 안 되기 때문이다 —
//   같은 사진을 두 자리가 다르게 설명하면 모델이 무엇을 지켜야 할지 모른다.
// ★ `en` 은 **주어 없이** 시작한다(`is the …`). 앞에 "Attached image [1] " 도,
//   "One of the attached images " 도 붙일 수 있어야 해서다.
//
// ★★★ **vision 을 대체하지 않는다.** 라벨이 채우는 것은 `vision.person` 하나뿐이고,
//   단계별이 실제로 싣는 `lettering`(인쇄된 글자)·`what`(색)·`scale` 은 사진을 봐야만
//   아는 값이다. 라벨이 있다고 사진 판정을 건너뛰면 아끼는 값은 없고 **제품 글자가
//   프롬프트에서 사라진다**(08-28 "캔 로고의 폰트가 달라진다"가 그 자리다).
export const PHOTO_ROLES = [
  {
    id: "logo",
    label: "로고",
    ko: "브랜드 로고다. 모양·글자·색을 사진 그대로 두고 절대 다시 그리거나 바꾸지 마라",
    en: "is the brand logo — reproduce it exactly as attached and keep it unchanged; never redraw, restyle, recolour, or re-letter it",
  },
  {
    id: "product",
    label: "제품",
    ko: "제품이다. 생김새·색·인쇄된 글자를 사진 그대로 두고 절대 다른 물건으로 바꾸지 마라",
    en: "is the product — reproduce its shape, colours, and printed lettering exactly as attached and keep it unchanged in every shot; never substitute a different object",
  },
  {
    id: "person",
    label: "인물",
    ko: "인물이다. 얼굴·머리·체형을 사진 그대로 두고 절대 다른 사람으로 바꾸지 마라",
    en: "is the person — keep the face, hair, and build exactly as attached and unchanged across shots; never swap in a different person",
  },
];

export const PHOTO_ROLE_IDS = PHOTO_ROLES.map((r) => r.id);

// 라우트가 **닫힌 목록**으로 받을 때 쓴다. 모르는 값은 거짓이다 —
// 화면에서만 거르면 가림막이지 잠금이 아니다(이 저장소가 2.5 에서 이미 겪었다).
export function isPhotoRole(id) {
  return PHOTO_ROLE_IDS.includes(id);
}

// 그 종류의 표 항목. 없거나 모르는 값이면 **null** — 부르는 쪽이 "종류가 없다"로 읽고
// 예전 문장 그대로 간다(옛 문서 보호).
export function photoRole(id) {
  return PHOTO_ROLES.find((r) => r.id === id) || null;
}

// **이 사진이 인물인가** — 두 근거를 함께 본다(2026-09-01).
//
// ★★ 하나만 보면 샌다. 라벨만 보면 `＋제품`으로 올린 얼굴이 새고, 사진 판정만 보면
//   VLM 이 빗나갔을 때 샌다. 둘 중 하나라도 인물이라고 하면 인물로 친다 —
//   틀려서 잃는 것(사진 한 장이 안 실림)이 틀려서 얻는 것(거절 + 판값 두 번)보다 싸다.
export function isPersonPhoto(photo) {
  return photo?.role === "person" || photo?.vision?.person === true;
}

// **올리는 자리에 보일 종류들.** 얼굴을 막는 모델에서는 `＋인물`이 아예 안 보인다.
//
// ★★★ 왜 잠금이 아니라 숨김인가(2026-09-01 사장님 지시): 잠긴 버튼이 남아 있으면
//   "왜 안 눌리지"를 매번 묻게 된다. 못 쓰는 것은 안 보이는 편이 낫다.
// ★★ 그래도 **화면만으로는 안 된다** — 이 파일 머리말이 이미 말한다("화면에서만 거르면
//   가림막이지 잠금이 아니다"). 실제 잠금은 lib/cut-refs.js 의 describeCutRefs 다.
// ★ **나중에 푼다.** 종량제로 옮겨 가면 실패의 값이 우리 것이 아니게 되므로 이 제한을
//   완화한다(사장님 계획). 그때 tests/person-photo-pro-gate.test.js 부터 읽으면 된다.
export function visiblePhotoRoles(blocksFaces) {
  return blocksFaces ? PHOTO_ROLES.filter((r) => r.id !== "person") : PHOTO_ROLES;
}
