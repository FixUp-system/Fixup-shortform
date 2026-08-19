// 두 방식이 갈리는 **유일한** 자리.
//
// ★ 왜 한 파일인가: 이 기능의 목적은 "어느 방식이 나은가"를 재는 것이고, 재고 나면 한쪽은
//   지운다. 차이가 여러 파일에 흩어져 있으면 어느 줄이 어느 방식의 것인지 구별이 안 된다.
// ★ r2v 가 이미지 순서를 보는지는 아무도 확인한 적이 없다. 그것이 이 실험의 축이다 —
//   코드가 미리 편들지 않는다.

// ★ 얼려 둔다. "방식은 둘뿐"이 이 기능의 전제인데, 표가 가변이면 호출부의 push 한 줄로
//   런타임에 셋이 될 수 있다 — 그러면 못 고른 방식으로 값이 나간다.
export const FILM_MODES = Object.freeze([
  Object.freeze({ id: "order", label: "장면 순서", hint: "그림이 차례로 장면이 돼요" }),
  Object.freeze({ id: "refs", label: "참고 그림", hint: "그림은 생김새만 알려 줘요" }),
]);

export function isFilmMode(v) {
  return FILM_MODES.some((m) => m.id === v);
}

// ★ 던진다. 모르는 값을 조용히 한쪽으로 떨어뜨리면 사장님이 고른 방식과 다른 것이
//   구워지고, 그 회차는 실험으로 못 쓴다 — 그런데 값은 이미 나갔다.
export function filmMode(id) {
  const m = FILM_MODES.find((x) => x.id === id);
  if (!m) throw new Error(`모르는 방식이에요: ${id}`);
  return m;
}

// 화면에 글자를 요구하지 않는다 — 모델은 글자를 "글자처럼 생긴 무늬"로 그린다.
// 자막은 우리가 ffmpeg 로 태운다(lib/compose.js).
const NO_TEXT = "No text or letters anywhere in the image.";

export function imagePlanFor(mode, scenario) {
  filmMode(mode); // 반환값은 안 쓴다 — 모르는 방식을 여기서 던지게 하려는 검증 호출이다
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  if (!shots.length) return [];

  if (mode === "order") {
    // ★ shows(영어)만 쓴다. beat·camera·lighting 은 사장님이 읽는 한국어라 이미지 모델에
    //   보내면 이해에 기대는 꼴이 된다(2026-08-19). 옛 문서(shows 없음)는 beat 로 떨어진다 —
    //   빈 프롬프트로 값을 치르는 것보다 낫다.
    return shots.map((s, i) => ({
      key: `shot-${i + 1}`,
      prompt: `${s.shows || s.beat || ""}. ${NO_TEXT}`.trim(),
    }));
  }

  // 참고 그림 — 장면 수와 무관하게 축 셋이다. 무엇이 계속 같아야 하는가로 나눈다:
  // 물건 · 사람 · 자리. 장면 순서는 프롬프트(글)가 정한다.
  // ★ 재료는 셋 다 shows(영어) 한 벌이다 — 한국어 필드를 이미지 프롬프트에서 걷었다.
  //   대신 **축마다 다른 조각**을 쥐어 준다: 물건은 첫 장면, 사람은 마지막 장면, 자리는 전부.
  //   셋이 같은 문자열을 받으면 세 장이 같은 그림이 되고 "생김새 참조 세 벌"이 무너진다.
  const shows = shots.map((s) => s.shows || s.beat || "").filter(Boolean);
  return [
    { key: "subject", prompt: `A clean product shot of the main object in: ${shows[0] || ""}. ${NO_TEXT}` },
    { key: "person", prompt: `A portrait of the person in: ${shows[shows.length - 1] || ""}. ${NO_TEXT}` },
    { key: "place", prompt: `The place, empty of people, in: ${shows.join(" ")}. ${NO_TEXT}` },
  ];
}

// 붙인 그림을 모델에게 **뭐라고 부를지**. 이 한 문단이 두 방식의 실질적 차이다.
export function attachClauseFor(mode) {
  filmMode(mode); // 반환값은 안 쓴다 — 모르는 방식을 여기서 던지게 하려는 검증 호출이다
  if (mode === "order") {
    return "The attached images are the scenes of this video, in order: use the first image for the first scene, the second for the second, and so on. Keep each scene faithful to its image.";
  }
  return "The attached images are appearance references only — they show what the subject, the person and the place look like. Do not read them as a sequence or as scene order; the scene order is written above. Keep the subject, the person and the place looking exactly as in these images.";
}
