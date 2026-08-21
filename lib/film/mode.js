// 두 방식이 갈리는 **유일한** 자리.
//
// ★ 왜 한 파일인가: 이 기능의 목적은 "어느 방식이 나은가"를 재는 것이고, 재고 나면 한쪽은
//   지운다. 차이가 여러 파일에 흩어져 있으면 어느 줄이 어느 방식의 것인지 구별이 안 된다.
// ★ r2v 가 이미지 순서를 보는지는 아무도 확인한 적이 없다. 그것이 이 실험의 축이다 —
//   코드가 미리 편들지 않는다.

// ★ 얼려 둔다. "방식은 둘뿐"이 이 기능의 전제인데, 표가 가변이면 호출부의 push 한 줄로
//   런타임에 셋이 될 수 있다 — 그러면 못 고른 방식으로 값이 나간다.
// ★★★ **재고 나서 한쪽이 정해졌다**(2026-08-20 사장님 결정) — 참고 그림이 남았다.
//   이 파일 머리말이 "재고 나면 한쪽은 지운다"고 적어 두었는데, **지우지는 않는다**:
//   지우면 order 로 이미 만든 영상이 보관함에서 죽고(filmMode 가 던진다), 그 회차의
//   실측 근거도 함께 사라진다. seedance-2.0-fast 로 한 번 겪은 사고이고, 2.5 를
//   hidden 으로 다룬 것과 같은 판단이다 — **고르는 길만 닫고 표·판독은 살려 둔다.**
// ★ isFilmMode·filmMode 는 여전히 order 를 안다. 옛 문서는 계속 열리고 계속 구울 수 있다.
export const FILM_MODES = Object.freeze([
  Object.freeze({ id: "order", label: "장면 순서", hint: "그림이 차례로 장면이 돼요", hidden: true }),
  Object.freeze({ id: "refs", label: "참고 그림", hint: "그림은 생김새만 알려 줘요" }),
]);

// 사장님이 **고를 수 있는** 방식. 화면은 이것을 돌려 그린다.
//
// ⚠️ 표(FILM_MODES)를 그대로 돌리면 숨긴 방식까지 나온다 — lib/ad/models.js 의 hidden 을
//   화면이 걸러야 했던 것과 같은 자리다. 거르는 판정을 화면마다 적으면 한 곳이 빠진다.
export const PICKABLE_FILM_MODES = Object.freeze(FILM_MODES.filter((m) => !m.hidden));

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
// ★★ "어디에도 글자 없음"은 **과했다**(실측 2026-08-19). 그 문구가 화면에 얹는 자막뿐
//   아니라 **제품에 인쇄된 글자까지** 지웠다 — 참조 사진에 글자가 있어도 프롬프트가
//   지우라고 하니 모델이 지운다. 막아야 하는 것은 "모델이 **새로 얹는** 글자"이고,
//   제품에 원래 있는 글자는 제품의 일부다.
const NO_TEXT =
  "Do not add any text, captions, titles, watermarks or logos of your own — we burn subtitles separately. " +
  "Text that is physically printed on the product itself is part of the product: keep it exactly as in the reference.";

// 앵커를 쓰는가 — **한 벌**이다.
//
// ★★ 파이프라인이 앵커를 만드는 조건과 프롬프트가 번호를 매기는 조건이 갈리면 라벨이
//   실제 첨부와 어긋난다 — 08-18 의 결함이 정확히 그 어긋남이었다. 조건을 여기 하나에 둔다.
// ★ 사진이 있으면 앵커를 안 만든다(2026-08-19 사장님 결정) — 사장님 사진이 제품의 진실이고,
//   앵커는 그 사진을 참조로 AI 가 그린 그림이라 한 다리 건넌 것이다.
export function usesFilmAnchor(mode, photoCount) {
  return mode === "order" && Number(photoCount) === 0;
}

// ★ opts 는 **그림에만 쓰는 맥락**이다(2026-08-19 실측에서 둘 다 필요해졌다):
//   · narrationLang — 사람이 나오는 그림의 국적. shows 는 "a stylish young woman" 이라고만
//     적고 국적을 안 써서 전부 외국인이 나왔다. 시나리오의 voice 에는 "Korean woman" 이
//     있었는데 그림 쪽으로 가는 길이 없었다.
//   · hasPhoto — 참조 사진이 있는지. 있으면 **참조가 이긴다**고 말해야 한다. shows 의
//     연출 지시(어두운 벨벳·빔라이트)가 강해 모델이 제품 생김새까지 재해석했다.
// ★ 안 주면 아무 말도 안 붙는다 — 옛 호출부가 글자 그대로 예전처럼 돈다.
export function imagePlanFor(mode, scenario, opts = {}) {
  filmMode(mode); // 반환값은 안 쓴다 — 모르는 방식을 여기서 던지게 하려는 검증 호출이다
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  if (!shots.length) return [];

  // 사람이 나오는 그림에만 붙는다. 국적을 안 적으면 모델의 기본값(서양인)이 나온다.
  const NATIONALITY = { ko: "Korean", ja: "Japanese", zh: "Chinese" };
  const who = NATIONALITY[opts.narrationLang];
  const people = who ? ` All people in this image are ${who}.` : "";
  // 참조가 있으면 **생김새는 참조가 정하고 글은 연출만 정한다**. 순서가 중요하다 —
  // 뒤에 붙여야 앞의 연출 서술을 이 문장이 덮는다.
  const PRODUCT_RULE = "is the exact product: keep its shape, colors, markings and proportions identical — do not redesign or reinterpret it. The words above describe only the setting, framing and lighting.";

  // ★★ 첨부가 여럿이면 **각자 무엇인지 말한다**(2026-08-20). 이 저장소가 두 번 배운 것이다:
  //   · 07-29 — 인물 사진 두 장을 익명으로 보냈더니 모델이 배역을 뒤바꿨다.
  //   · 08-18 — 같은 처방을 **물건에는 안 써서** 첨부 둘 중 어느 장이 제품인지 모른 채
  //     전혀 다른 슬리퍼가 나왔다. 단계별은 그때 이 처방을 썼고(lib/cuts.js 의
  //     "Attached reference images, in order: [1] …") film 만 안 썼다.
  //
  // ★ 이것은 연출을 조이는 규칙이 아니라 **없던 정보**다(사장님 확인 2026-08-20).
  //   그리고 여기는 정지 이미지 모델이라 굽기(영상)의 자유도와 무관하다 —
  //   굽기 지시문(attachClauseFor)은 안 건드린다.
  //
  // ⚠️ 번호는 **실제로 실리는 순서**여야 한다. 08-18 의 결함이 바로 그 어긋남이었다
  //   (프롬프트는 [2]부터 시작하는데 첨부는 두 장이라 [1]이 무엇인지 영영 못 들었다).
  //   싣는 순서는 lib/film/pipeline.js 가 정한다: 사장님 사진들 → (앵커) → 얼굴 사진.
  //   앵커가 생기는 조건은 usesFilmAnchor **한 벌**이 답한다 — 저쪽도 그 함수를 쓴다.
  // ★ photoCount 를 안 주는 옛 호출부는 라벨 없이 글자 그대로 예전처럼 돈다.
  const photoCount = Number.isFinite(opts.photoCount) ? opts.photoCount : null;
  const anchored = photoCount !== null && usesFilmAnchor(mode, photoCount);
  const beforeFace = photoCount === null ? null : photoCount + (anchored ? 1 : 0);
  const at = (n) => `[${n}]`;
  const joinAt = (ns) =>
    ns.length > 1 ? `${ns.slice(0, -1).map(at).join(", ")} and ${at(ns[ns.length - 1])}` : at(ns[0]);

  // 이 축의 첨부가 몇 장인가 — 얼굴 사진이 실리는 축만 한 장 더 붙는다.
  const ctxFor = (hasFace) => {
    const total = beforeFace === null ? null : beforeFace + (hasFace ? 1 : 0);
    // 첨부가 하나뿐이면 가리킬 것이 없다 — 번호는 군말이고 옛 문구가 그대로 맞는다.
    if (total === null || total < 2) {
      return `${people}${opts.hasPhoto ? ` The product in the attached reference photo ${PRODUCT_RULE}` : ""}`;
    }
    const labels = [];
    for (let i = 0; i < photoCount; i++) labels.push(`${at(i + 1)} the product`);
    if (anchored) labels.push(`${at(beforeFace)} an appearance reference of the main subject`);
    if (hasFace) labels.push(`${at(total)} the person of this video`);
    let out = `${people} Attached reference images, in order: ${labels.join(", ")}.`;
    if (photoCount > 0) {
      const ns = Array.from({ length: photoCount }, (_, i) => i + 1);
      out += ` The product in ${joinAt(ns)} ${PRODUCT_RULE}`;
    }
    // ★ 얼굴 사진에는 지금까지 **아무 말도 없었다** — 유일한 참조 문장이 제품을 가리켰고,
    //   얼굴은 익명으로 들어갔다. 07-29 에 배운 것("첨부는 익명으로 보내면 안 된다")이
    //   film 에서는 한 번도 안 쓰였다.
    if (hasFace) out += ` The person in ${at(total)} is the person of this video: keep their face exactly as in that image.`;
    return out;
  };
  // 얼굴이 없는 축이 쓰는 값. 얼굴이 실리는 축은 CTX_FACE 를 쓴다.
  const CTX = ctxFor(false);
  const CTX_FACE = ctxFor(true);
  // ★★ 옷차림은 **사람이 나오는 컷에만** 붙인다(2026-08-19). 제품 클로즈업에 옷 얘기가
  //   들어가면 모델이 없는 사람을 그려 넣는다 — 인물 사진을 그 컷에만 넘기는 것과 같은
  //   이유다. 사람 여부는 avatar_id 로 판정한다(시나리오가 이미 답한 값이다).
  // ★ 무대는 **모든** 그림에 붙는다 — 그것이 "무대가 하나"라는 말의 실제 뜻이다.
  const stage = typeof scenario?.environment === "string" ? scenario.environment.trim() : "";
  const STAGE = stage ? ` The whole video takes place in ${stage}.` : "";
  // ★★ 색 처리는 **모든** 그림에 붙는다(2026-08-19). 그전에는 굽기 지시문에만 실려서
  //   그림 넉 장의 색감이 제각각이었다 — 그림이 이미 다른데 영상에서 통일하라고 하는
  //   셈이다. 단계별이 컷마다 "keep identical across all cuts" 로 붙이는 것과 같은 자리다.
  const colorTone = typeof scenario?.tone === "string" ? scenario.tone.trim() : "";
  const TONE = colorTone ? ` Color treatment, identical in every image of this set: ${colorTone}.` : "";
  // ★ 제품 외형은 **사진이 없을 때만** 붙인다. 사진이 있으면 사진이 더 나은 재료이고,
  //   글이 사진과 다투면 글이 이겨 버린다(실측: 프롬프트가 크림색을 시켜 라벤더 토끼가
  //   크림색으로 나왔다). 사진이 없으면 글이 유일한 재료라 없으면 컷마다 흔들린다.
  const shape = typeof scenario?.look === "string" ? scenario.look.trim() : "";
  const LOOK = !opts.hasPhoto && shape ? ` The subject looks like this: ${shape}.` : "";
  const dress = typeof scenario?.wardrobe === "string" ? scenario.wardrobe.trim() : "";
  // ★★ 옷차림도 **모든 그림에서 같다**고 말한다(2026-08-20). 색처리(TONE)가 바로 위에서
  //   쓰는 문구와 같은 자리다 — 그림끼리 옷이 갈리면 영상에서 상의 색이 중간에 바뀐다.
  //   실측(떡볶이): 얼굴 사진을 붙여 얼굴은 셋 다 같아졌는데 상의가 크림·회색으로 갈렸다.
  //   얼굴은 사진이 고정하고 옷은 글이 고정하므로, 글이 흐리면 인물이 반쯤만 고정된다.
  const WEAR = dress ? ` The person is wearing ${dress} — identical in every image of this set.` : "";

  // ★★ 얼굴 사진 하나에 **셋이 함께 걸린다**: 맥락(라벨)·옷차림, 그리고 파이프라인이 싣는
  //   바이트. 셋을 따로 적으면 언젠가 한 자리가 빠진다 — 2026-08-20 아침이 그랬다
  //   (얼굴을 붙였는데 옷차림이 안 따라갔고, 라벨은 아예 없었다).
  //   얼굴만 같고 옷이 바뀌면 소용없고, 얼굴을 싣고도 그것이 무엇인지 안 말하면 익명이다.
  // ★ 두 방식이 함께 쓴다 — order 갈래보다 **위에** 있어야 한다.
  const CW = (id) => `${id ? CTX_FACE : CTX}${id ? WEAR : ""}`;

  if (mode === "order") {
    // ★ shows(영어)만 쓴다. beat·camera·lighting 은 사장님이 읽는 한국어라 이미지 모델에
    //   보내면 이해에 기대는 꼴이 된다(2026-08-19). 옛 문서(shows 없음)는 beat 로 떨어진다 —
    //   빈 프롬프트로 값을 치르는 것보다 낫다.
    return shots.map((s, i) => ({
      key: `shot-${i + 1}`,
      // ★ 이음은 그 컷에만 붙는다 — 앞 컷에서 어떻게 넘어오는지는 컷마다 다르다.
      prompt: `${s.shows || s.beat || ""}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CW(s.avatar_id)}${
        s.transition ? ` This shot continues from the previous one: ${s.transition}.` : ""
      }`.trim(),
      // ★ 이 컷에 보이는 사람의 사진 id — 파이프라인이 바이트를 읽어 참조에 더한다.
      //   사람이 없는 컷은 빈 문자열이고, 그때는 얼굴 사진이 안 실린다(제품 클로즈업에
      //   얼굴이 끼어들면 방해다).
      avatarId: s.avatar_id || "",
    }));
  }

  // 참고 그림 — 장면 수와 무관하게 **세 장**이다. 늘리면 돈이 는다(장당 ≈$0.08).
  //
  // ★★ 무엇을 그릴지는 focus 가 정한다(2026-08-19). 그 전에는 무엇이 중심이든 늘
  //   제품·사람·자리였다 — 인물이 주인공인 영상에도 제품 컷을 그리고, 공간이 주인공인
  //   영상에도 인물 초상을 그렸다. 지켜야 할 것을 **두 장**으로 보여 주는 편이,
  //   안 쓸 그림 한 장을 그리는 것보다 낫다.
  // ★ 재료는 셋 다 shows(영어)다 — 한국어 필드는 이미지 프롬프트에서 걷었다.
  // ★★ 재료와 **그 재료를 낸 장면**을 함께 쥔다(2026-08-20). 글만 뽑아 두면 그 장면에
  //   사람이 있었는지를 되찾을 길이 없다 — 실측에서 그림 넉 장에 여자가 셋 나온 원인이다.
  const sources = shots.map((s) => ({ shot: s, text: s.shows || s.beat || "" })).filter((x) => x.text);
  const shows = sources.map((x) => x.text);
  const first = shows[0] || "";
  const last = shows[shows.length - 1] || "";
  const all = shows.join(" ");
  const focus = scenario?.focus;

  // ★★ 이 축의 재료 장면에 사람이 있는가 — 장면 순서 방식과 **같은 자**다(avatar_id).
  //   있으면 얼굴 사진과 옷차림이 함께 붙는다. 2026-08-19 에 person 축을 끼워 넣으면서
  //   얼굴 사진을 그 축에만 붙였는데, 나머지 축의 재료(shows)에는 사람 묘사가 그대로
  //   들어 있었다 — 참조 없이 사람을 그리니 축마다 딴 얼굴·딴 옷이 나왔다.
  // ★ 자리 축에는 안 쓴다 — "empty of people" 과 얼굴 사진은 서로 싸운다.
  const faceOf = (source) => source?.shot?.avatar_id || "";
  const firstSource = sources[0];
  const lastSource = sources[sources.length - 1];

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
  // ★★ 무대(environment)가 있으면 **그것을** 쓴다(2026-08-19). 첫 장면 shows 를 주면
  //   제품 서술이 통째로 들어가 "자리를 그려라"면서 제품을 그린다 — 실측에서 그 그림에
  //   없던 리본까지 새로 생겼다. environment 를 넣을 때 이 축의 재료를 안 바꿨다.
  // ★ 무대가 없는 옛 문서는 예전처럼 첫 장면을 쓴다.
  const placeSource = stage || first;

  // 참고 그림의 인물 축도 같은 사진을 받는다 — 컷마다 고른 것 중 처음 것을 쓴다
  // (한 영상의 주인공은 하나라는 전제. 여럿이면 첫 번째가 주인공이다).
  const firstAvatar = shots.map((s) => s.avatar_id).find(Boolean) || "";

  // ★ 무대(STAGE)는 **모든 축**에 붙는다 — 그것이 "무대가 하나"라는 말의 실제 뜻이다.
  //   2026-08-19 에는 person 계열에만 붙어 제품·자리 축이 무대를 몰랐다.
  const PERSON_PROMPT = `A head-and-shoulders portrait of the main person of this video. ${PERSON_ONLY}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CW(firstAvatar)}`;

  let axes;
  if (focus === "person") {
    axes = [
      { key: "person", avatarId: firstAvatar, prompt: PERSON_PROMPT },
      { key: "person-full", avatarId: firstAvatar, prompt: `A full-body shot of the same person, standing, showing their outfit. ${PERSON_ONLY}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CW(firstAvatar)}` },
      { key: "place", prompt: `The setting of: ${placeSource}. ${PLACE_ONLY}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CTX}` },
    ];
  } else if (focus === "place") {
    axes = [
      { key: "place", prompt: `A wide establishing shot of the place in: ${placeSource}. ${PLACE_ONLY}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CTX}` },
      { key: "place-detail", prompt: `A close detail of the same place in: ${first}. ${PLACE_ONLY}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CTX}` },
      { key: "subject", avatarId: faceOf(firstSource), prompt: `A clean product shot of the main object in: ${first}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CW(faceOf(firstSource))}` },
    ];
  } else if (focus === "product") {
    axes = [
      { key: "subject", avatarId: faceOf(firstSource), prompt: `A clean product shot of the main object in: ${first}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CW(faceOf(firstSource))}` },
      // ★★★ **손을 요구하지 않는다**(실측 2026-08-21, 스킨 토너에서 손이 셋 나왔다).
      //   그전에는 "The same object being **used or held**" 를 재료 장면 뒤에 무조건
      //   덧붙였는데, 그 장면이 "fingertips resting lightly on her cheeks"(두 손이 이미
      //   뺨에 있다)였다. 둘 다 지키려고 모델이 손을 하나 더 그렸다 — **프롬프트가 자기
      //   안에서 모순**이었다.
      //   ★ 이 저장소가 아는 규율이다: "못 그리는 것은 애초에 요구하지 않는다"(단계별의
      //     motion 규칙이 "손가락을 세밀하게 쓰는 동작은 적지 않는다"로 같은 판단을 한다).
      //   ★ 축은 남긴다 — 제품을 **무대·맥락 안에서** 보여 주는 자리다. 없어지면 제품
      //     참조가 한 장 줄고, 그 맥락(빛·배경)을 영상 모델이 받을 길이 사라진다.
      //     달라진 것은 "어떻게 쥐는가"를 안 시킨다는 것뿐이다.
      { key: "subject-in-use", avatarId: faceOf(lastSource), prompt: `The same object, close-up, present in this scene: ${last}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CW(faceOf(lastSource))}` },
      { key: "place", prompt: `The setting of: ${placeSource}. ${PLACE_ONLY}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CTX}` },
    ];
  } else {
    // info · focus 가 없는 옛 문서 — 지켜야 할 얼굴도 물건도 없으므로 지금까지의 세 축 그대로.
    axes = [
      { key: "subject", avatarId: faceOf(firstSource), prompt: `A clean product shot of the main object in: ${first}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CW(faceOf(firstSource))}` },
      { key: "person", avatarId: firstAvatar, prompt: PERSON_PROMPT },
      { key: "place", prompt: `The place, empty of people, in: ${placeSource}. ${PLACE_ONLY}. ${NO_TEXT}${STAGE}${TONE}${LOOK}${CTX}` },
    ];
  }

  // ★★ 사람이 나오는데 인물 축이 없으면 **한 장 더 만든다**(2026-08-19 사장님 결정).
  //   focus=product 면 축이 제품·제품·자리라 사람 그림이 하나도 없었고, 아바타 사진을
  //   넘기는 자리도 없어서 영상에서 사람이 나올 때마다 얼굴도 옷도 새로 그려졌다
  //   ("마지막에 인물 옷이 갑자기 바뀐다"). 값($0.08)은 사람이 나올 때만 는다.
  const hasPerson = shots.some((sh) => sh.avatar_id);
  if (hasPerson && !axes.some((a) => a.key.startsWith("person"))) {
    // 자리 축 **앞**에 넣는다 — 제품·인물이 먼저고 배경이 마지막이라는 순서를 지킨다.
    axes.splice(axes.length - 1, 0, { key: "person", avatarId: firstAvatar, prompt: PERSON_PROMPT });
  }
  return axes;
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
export function anchorPlanFor(scenario, opts = {}) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  const shows = shots.map((s) => s.shows || s.beat || "").filter(Boolean);
  const first = shows[0] || "";
  const last = shows[shows.length - 1] || "";
  // ★ 인물 앵커는 국적이 필요하다 — 안 적으면 모델 기본값(서양인)이 나온다.
  //   앵커는 사진이 없을 때만 만들어지므로 "참조가 이긴다"는 붙일 일이 없다.
  const NATIONALITY = { ko: "Korean", ja: "Japanese", zh: "Chinese" };
  const who = NATIONALITY[opts.narrationLang];
  const CTX = who ? ` All people in this image are ${who}.` : "";
  switch (scenario?.focus) {
    case "person":
      return { key: "anchor", prompt: `A head-and-shoulders portrait of the main person of this video. plain neutral background, no props, no scenery. ${NO_TEXT}${CTX}` };
    case "product":
      return { key: "anchor", prompt: `A clean product shot of the main object in: ${first}. plain neutral background. ${NO_TEXT}${CTX}` };
    case "place":
      return { key: "anchor", prompt: `A wide establishing shot of the place in: ${first}. empty of people, no person in frame. ${NO_TEXT}${CTX}` };
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
  // ★★★ **"정확히 그대로"를 걷는다**(2026-08-21 사장님 지적 + 실측).
  //
  // 광고와 이 경로의 굽기 프롬프트를 나란히 재 보니 2,211자 vs 2,492자였고, 다른 것은
  // **이 문단 하나뿐**이었다 — 시나리오 지시문도 LLM 도 글자 그대로 같다. 그리고 그
  // 끝에 "Keep … looking **exactly as in these images**" 가 있었다.
  //
  // 그 한 문장이 셋을 한꺼번에 했다:
  //   ① 그림의 결함(손 셋·지어낸 포장·뭉개진 작은 글자)을 **지켜야 할 사실**로 만든다
  //   ② 진실(사장님 사진 1장)을 해석본(그림 4장) 속에 묻는다 — 비율이 4:1 이다
  //   ③ 영상 모델이 잘하는 것(움직임 속에서 스스로 일관성을 만드는 것)을 막는다
  //
  // ★ 이것도 **분할 생성의 처방**이다. 컷마다 따로 구울 때 컷 사이 얼굴·제품이 달라지는
  //   것을 막으려고 넣었는데, 통짜로 굽는 지금은 한 번에 만들어져 그 문제가 없다.
  //   광고에는 이 문장이 아예 없고, 실측에서 광고 쪽이 더 자연스러웠다.
  // ★ **무엇인지는 여전히 말한다** — 안 말하면 첨부가 익명이 되고, 그것은 이 저장소가
  //   두 번 겪은 다른 결함이다(07-29 배역 뒤바뀜 · 08-18 제품 어긋남).
  return "The attached images are appearance references only — they show what the subject, the person and the place look like. Do not read them as a sequence or as scene order; the scene order is written above. Let them guide the look of the subject, the person and the place.";
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
