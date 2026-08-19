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

  // 참고 그림 — 장면 수와 무관하게 **세 장**이다. 늘리면 돈이 는다(장당 ≈$0.08).
  //
  // ★★ 무엇을 그릴지는 focus 가 정한다(2026-08-19). 그 전에는 무엇이 중심이든 늘
  //   제품·사람·자리였다 — 인물이 주인공인 영상에도 제품 컷을 그리고, 공간이 주인공인
  //   영상에도 인물 초상을 그렸다. 지켜야 할 것을 **두 장**으로 보여 주는 편이,
  //   안 쓸 그림 한 장을 그리는 것보다 낫다.
  // ★ 재료는 셋 다 shows(영어)다 — 한국어 필드는 이미지 프롬프트에서 걷었다.
  const shows = shots.map((s) => s.shows || s.beat || "").filter(Boolean);
  const first = shows[0] || "";
  const last = shows[shows.length - 1] || "";
  const all = shows.join(" ");
  const focus = scenario?.focus;

  // ★★ 사람 축의 재료를 **장면 하나 통째로** 주지 않는다(실측 2026-08-19). 그렇게 하면
  //   "A portrait of the person in: She smiles and sets the glass down, the pink drink
  //   centered and glowing on the marble counter with soft sun flare behind" 가 되어,
  //   초상을 그리라면서 잔·카운터·역광까지 다 넣는다. 지금은 **사람을 가리키는 말만**
  //   남기고 배경은 프롬프트가 직접 지운다.
  const PERSON_ONLY = "plain neutral background, no props, no scenery";
  // ★★ 자리 축도 같다. "empty of people" 이라고 써 놓고 사람 묘사를 재료로 다 넣으면
  //   두 지시가 싸운다 — 재료에서 사람 얘기를 빼는 것이 맞다.
  const PLACE_ONLY = "empty of people, no person in frame";
  // ★ 자리 축의 재료는 **첫 장면 하나**다(all 이 아니다). 장면 전부를 이어 주면 뒤 장면의
  //   사람 묘사가 그대로 들어가, "empty of people" 과 재료가 서로 싸운다 — 실측에서 본
  //   그 결함이다. 한 영상의 장소는 대개 하나라 첫 장면으로 충분하다.
  // ⚠️ 남는 한계: **첫 장면에 사람이 있으면 여전히 샌다.** 완전히 없애려면 시나리오가
  //   장소를 따로 내야 하는데(칸 하나 더), 지금은 재료를 줄이는 데서 멈춘다.
  const placeSource = first;

  if (focus === "person") {
    return [
      { key: "person", prompt: `A head-and-shoulders portrait of the main person of this video. ${PERSON_ONLY}. ${NO_TEXT}` },
      { key: "person-full", prompt: `A full-body shot of the same person, standing, showing their outfit. ${PERSON_ONLY}. ${NO_TEXT}` },
      { key: "place", prompt: `The setting of: ${placeSource}. ${PLACE_ONLY}. ${NO_TEXT}` },
    ];
  }

  if (focus === "place") {
    return [
      { key: "place", prompt: `A wide establishing shot of the place in: ${placeSource}. ${PLACE_ONLY}. ${NO_TEXT}` },
      { key: "place-detail", prompt: `A close detail of the same place in: ${first}. ${PLACE_ONLY}. ${NO_TEXT}` },
      { key: "subject", prompt: `A clean product shot of the main object in: ${first}. ${NO_TEXT}` },
    ];
  }

  if (focus === "product") {
    return [
      { key: "subject", prompt: `A clean product shot of the main object in: ${first}. ${NO_TEXT}` },
      { key: "subject-in-use", prompt: `The same object being used or held, close-up, in: ${last}. ${NO_TEXT}` },
      { key: "place", prompt: `The setting of: ${placeSource}. ${PLACE_ONLY}. ${NO_TEXT}` },
    ];
  }

  // info · 그리고 focus 가 없는 옛 문서 — 지켜야 할 얼굴도 물건도 없으므로 지금까지의
  // 세 축을 그대로 둔다(무엇을 두 장 그릴지 고를 근거가 없다).
  return [
    { key: "subject", prompt: `A clean product shot of the main object in: ${first}. ${NO_TEXT}` },
    { key: "person", prompt: `A portrait of the person in: ${last}. ${NO_TEXT}` },
    { key: "place", prompt: `The place, empty of people, in: ${all}. ${NO_TEXT}` },
  ];
}

// 장면 순서 방식의 **앵커** — focus 하나만 그린 그림 한 장.
//
// ★★ 왜 필요한가(2026-08-19 실측): order 갈래는 컷마다 **독립적으로** 그림을 만든다.
//   앞 그림을 안 보므로 3번 컷의 인물과 4번 컷의 인물이 딴 사람이고, 제품(컵)도 컷마다
//   다른 물건이 된다. 사장님이 눈으로 잡은 그 결함이다.
// ★ 앞 그림을 이어서 넘기지 않는 이유: 2→3→4 로 오차가 누적된다(직전만 보면 조금씩
//   밀려 마지막이 첫 장면과 딴판이 된다). 앵커 하나면 전부가 같은 기준을 본다.
// ★ 첫 장면 그림을 앵커로 쓰지 않는 이유: 첫 장면에 중심이 안 보일 수 있다 — 실측에서
//   1번 컷은 잔만 있고 인물이 없었다. 그걸로는 인물을 고정할 수 없다.
// ★ info 는 앵커가 없다(null) — 지켜야 할 얼굴도 물건도 없는데 $0.08 을 치를 이유가 없다.
export function anchorPlanFor(scenario) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  const shows = shots.map((s) => s.shows || s.beat || "").filter(Boolean);
  const first = shows[0] || "";
  const last = shows[shows.length - 1] || "";
  switch (scenario?.focus) {
    case "person":
      return { key: "anchor", prompt: `A head-and-shoulders portrait of the main person of this video. plain neutral background, no props, no scenery. ${NO_TEXT}` };
    case "product":
      return { key: "anchor", prompt: `A clean product shot of the main object in: ${first}. plain neutral background. ${NO_TEXT}` };
    case "place":
      return { key: "anchor", prompt: `A wide establishing shot of the place in: ${first}. empty of people, no person in frame. ${NO_TEXT}` };
    default:
      // info · focus 가 없는 옛 문서 — 앵커 없이 예전 그대로 흐른다
      return null;
  }
}

// 붙인 그림을 모델에게 **뭐라고 부를지**. 이 한 문단이 두 방식의 실질적 차이다.
export function attachClauseFor(mode, opts = {}) {
  filmMode(mode); // 반환값은 안 쓴다 — 모르는 방식을 여기서 던지게 하려는 검증 호출이다
  if (mode === "order") {
    // ★★ 앵커가 붙으면 **첫 이미지가 장면이 아니다**(2026-08-19). 그대로 두면 모델이
    //   앵커를 1번 장면으로 그리고 실제 장면이 통째로 한 칸씩 밀린다.
    // ★ 앵커가 없을 때(focus=info · 옛 문서)는 예전 문구가 맞다 — 그래서 갈라 쓴다.
    if (opts.hasAnchor) {
      return "The first attached image is NOT a scene — it is an appearance reference showing what the main subject of this video looks like; keep it looking exactly the same throughout. The scenes start from the second image: use the second image for the first scene, the third for the second scene, and so on, in order. Keep each scene faithful to its image.";
    }
    return "The attached images are the scenes of this video, in order: use the first image for the first scene, the second for the second, and so on. Keep each scene faithful to its image.";
  }
  return "The attached images are appearance references only — they show what the subject, the person and the place look like. Do not read them as a sequence or as scene order; the scene order is written above. Keep the subject, the person and the place looking exactly as in these images.";
}

// 이 경로의 파일 이름 규칙 — **방식이 이름에 들어간다.**
//
// ★★ 광고는 `<id>.mp4` 하나면 됐다(한 프로젝트에 한 편). 여기는 한 프로젝트에서 두 편을
//   굽는다 — 이름이 하나면 나중에 구운 쪽이 앞의 것을 덮어 **비교 대상이 사라진다.**
//   그런데 비교가 이 기능의 전부다.
// ★ 그래도 이름은 **여전히 프로젝트 id 로 시작해야 한다** — app/api/renders/[name]/route.js
//   가 이름에서 id 를 되찾아 소유자를 검사한다(무작위 이름이면 저장은 되는데 열 수가 없다).
// ★ 자막 장치(lib/compose.js 의 burnSubtitles)는 `${projectId}-raw.mp4` 를 읽어
//   `${projectId}.mp4` 로 굽는다. 그래서 그 함수에는 **이 합친 이름을 projectId 로 넘긴다** —
//   장치를 고치지 않고 이름 규칙만 얹는다(두 벌이면 폰트·줄바꿈·위치가 갈린다).
// ★★ 왜 pipeline.js 가 아니라 여기 있나(2026-08-19): 이 규칙을 아는 자리가 셋이 됐다 —
//   굽기·읽기(renders)·**지우기**(app/api/projects/[id]/route.js). 지우기가 pipeline 을
//   import 하면 ffmpeg·fal 이 딸려 오고, 그래서 손으로 이름을 적으면 방식이 늘 때 파일이
//   샌다(문서를 지운 뒤에는 그 파일을 다시 열 길이 아예 없다). 규칙은 표 옆에 둔다.
export function filmVideoBase(projectId, mode) {
  filmMode(mode);
  return `${projectId}-${mode}`;
}
