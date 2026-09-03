// 칸 하나에 실리는 지문 한 줄 — **순수 함수다.**
//
// ★★ 왜 따로 빼는가: 사장님이 ③이미지 화면에서 "컷마다 어떤 프롬프트 내용이 반영되는지"를
//   보고 싶다고 했다(2026-08-27). 그 줄을 화면에서 다시 조립하면 **실제로 나간 지문과
//   갈린다** — 화면은 `shows` 만 보여 주는데 지문에는 카메라가 함께 실리는 식으로.
//   그래서 지문을 만드는 쪽(lib/reel/storyboard.js 의 buildStoryboardPrompt)과 화면이
//   **이 함수 하나**를 같이 쓴다.
//
// ★ 순수해야 하는 이유: 화면("use client")이 읽는다. storyboard.js 는 sharp·Storage 를 끌어
//   서버 전용이라 화면이 그 파일을 못 읽는다 — 그것이 이 파일이 따로 있는 이유다
//   (storyboardGridFor 가 lib/reel/oneshot.js 로 옮겨 간 것과 같은 사정).
// ★ import 는 **순수 모듈만**이다(lib/ad/options.js 는 화면도 읽는 표다).

import { AD_MOODS, reelStyleLine } from "../ad/options.js";
// ★ clip-limits 는 순수 파일이다(화면도 읽는다) — 사슬이 안 늘어난다.
import { blocksFacesInRefs } from "../clip-limits.js";

const one = (v) => (typeof v === "string" ? v.trim() : "");

// 칸 하나의 서술. **번호는 1부터**다 — 지문이 "Panel 1 은 왼쪽 위"라고 말하기 때문이다.
//
// ★ 내용이 아무것도 없으면 빈 문자열이다(빈 "Panel 3: ." 을 만들지 않는다) — 부르는 쪽이
//   그 자리를 어떻게 다룰지 정한다(지문은 빼고, 화면은 "아직 없어요"로 읽는다).
export function panelBody(cut) {
  const bits = [one(cut?.shows)];
  if (one(cut?.camera)) bits.push(one(cut.camera));
  return bits.filter(Boolean).join(", ");
}

// 그 컷이 **말하는 것**. 화면이 카드 머리에 한 줄로 얹는다(2026-08-27).
//
// ★★ 지문(panelBody)과 **다른 축**이다: 지문은 "무엇을 그릴까"(영어, 모델에게 하는 말)이고
//   이것은 "무엇을 말하나"(사장님 말, 사람에게 하는 말)다. 카드에서 먼저 읽히는 쪽은
//   대사다 — 그것이 잡혀야 "몇 번째 장면인지"가 잡힌다.
// ★ 무음 컷은 **빈 문자열**이다. 화면은 그 줄을 아예 안 그린다 — 빈 줄을 남기면
//   말이 없는 컷이 아니라 덜 만들어진 화면처럼 보인다.
//   (판정은 lib/progress.js 의 isSilentCut 과 같은 결이다: 키가 있고 값이 비었으면 무음.)
export function panelSay(cut) {
  return one(cut?.sentence);
}

export function panelLine(cut, index) {
  const body = panelBody(cut);
  return body ? `Panel ${index + 1}: ${body}.` : "";
}

// ── 한 장짜리 지문 ─────────────────────────────────────────────────────────────
//
// ★ 게이트 D 를 통과한 문장 그대로다(scripts/measure/storyboard-grid.mjs). 특히 **읽는
//   순서를 말로 못 박는 것** — 행이 하나면 순서가 자명하지만 둘부터는 아니다.
// ★ 컷별 프롬프트(lib/cuts.js 의 buildImagePrompt)와 다른 함수인 이유: 저 함수는 컷 하나를
//   화면 하나로 그리는 지문이고, 여기는 **판형이 먼저**인 한 장이다. 같은 함수에 두 뜻을
//   담으면 어느 쪽도 못 고친다.
// 얼굴을 **주인공 자리에서 내린다** — 사람도 동작도 남기고 **카메라만 물러선다**.
//
// ★ 짝은 실측에서 나온 낱말만 짚는다(뭉뚱그린 규칙은 멀쩡한 서술까지 부순다).
//   왼쪽을 지우는 것이 아니라 **오른쪽으로 갈아 끼운다** — 목적어를 잃지 않으려는 것이다.
// ★ 순서가 있다: 좁은 짝을 먼저 본다("close-up of her face" 를 "close-up" 규칙이 삼키면
//   손 클로즈업이 얼굴 클로즈업으로 남는다).
export const FACE_SOFTEN = [
  [/\bclose-?ups?\s+of\s+(her|his|their)\s+face\b/gi, "close-up of their hands"],
  [/\bfacing\s+(the\s+)?camera\b/gi, "turned toward the food"],
  [/\blooking\s+(straight\s+)?(at|into)\s+(the\s+)?camera\b/gi, "looking down at the food"],
  [/\bsmiling\s+at\s+(the\s+)?camera\b/gi, "smiling down at the food"],
  [/\bmid-bite\s+smile\b/gi, "mid-bite, framed from the chin down"],
  [/\beyes\s+bright\b/gi, "eyes lowered to the food"],
  // ★ **크기**가 마지막 축이다. 시선을 내려도 얼굴이 화면을 채우면 그대로 거절된다 —
  //   실측이 정확히 그랬다(다시 그린 판에서 시선은 내려갔는데 얼굴은 그대로 컸다).
  [/\bchest-up\s+shot\b/gi, "waist-up shot"],
  [/\bhead-and-shoulders\s+shot\b/gi, "waist-up shot"],
];

export function softenFace(line) {
  return FACE_SOFTEN.reduce((s, [re, to]) => s.replace(re, to), String(line || ""));
}

// 사람이 나오는 칸인가 — 이 낱말이 있으면 그 칸에 얼굴이 그려질 수 있다.
const PERSON = /\b(woman|man|girl|boy|person|people|she|he|her|his|model|customer|chef|cook|hands?)\b/i;

// ★★★ 2026-08-31 **두 번째 라이브 실측** — 얼굴을 *작게* 그리는 것으로는 부족했다.
//   같은 아바타 사진을 **단일 인물 카드**(`@Image1`, 트윗과 같은 형식)로 넘겨 봐도 2.5 는
//   9초 만에 거절했다. 즉 **형식과 무관하게 사진 같은 얼굴이 있으면 막는다.**
//   → 그래서 이제 얼굴을 **프레임 밖으로 내보낸다.** 사람은 그대로 있고 손·팔·상반신으로
//     연기한다. 영상 속 사람은 **지문이 만들어 낸다**(원클릭 화장품 영상이 그 증거).
// ★ 이 줄은 **그 칸 설명 안에** 붙인다 — 문단으로 따로 두면 칸 설명이 이긴다(1차 실패의 원인).
const FACE_OUT = " Frame this panel from the shoulders down — hands, arms and torso only, "
  + "with the face cropped outside the frame. No face is visible in this panel.";

export function facelessPanel(line) {
  const s = softenFace(line);
  return PERSON.test(s) ? s.replace(/\s*$/, "") + FACE_OUT : s;
}

export function buildStoryboardPrompt(project, cuts, grid, note, refs = []) {
  const n = cuts.length;
  const sc = project?.scenario || {};
  const settings = project?.settings || {};

  const head =
    `A ${n}-panel storyboard arranged as an even grid of ${grid.rows} rows by ${grid.cols} columns. ` +
    `Every panel is a vertical 9:16 frame and all panels are exactly the same size. ` +
    `The panels are read in order like a comic page: ` +
    `left to right across the top row first, then continuing left to right on the next row down. ` +
    `Panel 1 is the top-left corner and panel ${n} is the bottom-right corner. ` +
    `Thin clean even gaps separate the panels, and the grid fills the whole image edge to edge.`;

  // 전 컷이 같아야 하는 것 — 한 장에 함께 그려지므로 **한 번만** 말하면 된다.
  const keep = [];
  if (one(sc.look)) keep.push(`The subject looks the same in every panel: ${one(sc.look)}.`);
  if (one(sc.wardrobe)) keep.push(`The person wears the same throughout: ${one(sc.wardrobe)}.`);
  if (one(sc.environment)) keep.push(`The whole sequence takes place in ${one(sc.environment)}.`);

  // ★★ 칸 한 줄은 lib/reel/panels.js 하나가 만든다(2026-08-27) — ③이미지 화면이 컷마다
  //   "무엇이 지문에 실렸는지"를 그대로 보여 주기 때문이다. 여기서 손으로 조립하면
  //   화면이 보여 주는 말과 실제로 나간 지문이 갈린다.
  // ★ 빈 줄은 뺀다 — 내용이 없는 칸에 "Panel 3: ." 을 실어 보내지 않는다.
  // ★★★ 2026-08-31 **라이브 실측** — 지시를 덧붙이는 것만으로는 부족했다.
  //   재시도로 다시 그린 판에서 인물은 **카메라를 안 보게 바뀌었는데도**(지시가 먹었다)
  //   **얼굴 크기가 그대로여서 또 거절됐다.** 칸 설명이 `"a cheerful young woman facing
  //   camera, eyes bright, mid-bite smile, vertical chest-up shot"` 를 **요구하고 있었다.**
  //   ★ 이 저장소의 법: *"금지 문구를 더 붙이는 것은 소용없다 — 장면 서술이 이겼다.
  //     못 그리는 것은 **애초에 요구하지 않는다**."* 그래서 **요구를 걷어낸다.**
  //   ★ 걷어내는 것은 **그리기 지문뿐**이다 — 저장된 시나리오(`cut.shows`)는 안 건드린다.
  //     그 값이 자막·낭독·낡음 판정의 원천이라, 고치면 이미 산 것들이 통째로 낡는다.
  //   ★ 바꾸는 자리마다 **목적어를 남긴다** — 낱말만 지우면 "… rear three-quarter facing,"
  //     처럼 문장이 부서진다(2026-08-18 에 밟은 함정).
  // ★★★ 2026-09-01 — **두 갈래로 켜진다.**
  //   ① `reel.face_safe` — 한 번 거절당해 자동 재시도가 켠 것(모르는 모델에서의 학습)
  //   ② `blocksFacesInRefs` — **그 모델이 얼굴을 무조건 막는다는 것을 이미 아는 경우**
  //      (seedance-2.5). 그때는 시도할 이유가 없다 — 안 켜면 판을 두 번 그린다($0.401 낭비).
  const faceSafeOn = project?.reel?.face_safe === true || blocksFacesInRefs(project);
  const panels = cuts.map((c, i) => panelLine(c, i)).filter(Boolean)
    .map((line) => (faceSafeOn ? facelessPanel(line) : line));

  const mood = AD_MOODS.find((m) => m.id === settings.mood)?.line || "";
  // ★ 2026-09-03 — 시나리오 지문과 **같은 값**을 쓴다(reelStyleLine) — 판을 그리는 지문과
  //   시나리오가 다른 화풍을 말하면 판과 굽기가 어긋난다.
  const style = reelStyleLine(settings.style) || "";
  const tone = one(sc.tone);
  const look = [mood, style, tone && `Color treatment: ${tone}`, `Consistent color grade across all ${n} panels.`]
    .filter(Boolean).join(". ");

  // ★ 글자 금지는 격자에서 특히 중요하다 — 모델이 칸마다 번호를 적으려 든다.
  const ban = "No text, no letters, no numbers, no panel numbers, no labels or logos anywhere in the image.";
  // ★★ 사장님이 **말로** 고쳐 달라고 적은 것(2026-08-25). 시나리오 수정 요청과 같은 모양이다.
  //   ★ **전체 한 장 단위**다 — 스토리보드가 한 장이라 그 단위가 맞다. 칸 하나만 다시
  //     만들면 그것만 컷별로 돌아 인물이 다른 칸과 달라진다(08-21 에 하루를 쓴 그 문제).
  //   ★ 안 넘기면 이 줄이 통째로 없어 지문이 예전과 글자 그대로다.
  const ask = typeof note === "string" ? note.trim() : "";
  const fix = ask ? `The client asked for this change — apply it across the whole sheet: ${ask.slice(0, 500)}` : "";

  // ★★★ **초상 거절을 한 번 맞은 판이다**(2026-08-31). 굽는 쪽이 참조 이미지에서 알아볼 수
  //   있는 얼굴을 보면 `content_policy_violation` 으로 되돌린다 — 우리가 그린 얼굴인지
  //   실제 사람인지 **구별하는 신호가 프로토콜에 없어서**다. 그래서 다시 그릴 때는
  //   **사람을 빼는 것이 아니라 프레임을 내린다.** 장면 설명(panelLine)은 한 글자도 안 바꾼다.
  //   ★ `note` 를 쓰지 않는 이유: 그 자리는 **사장님이 말로 적은 것**이고 "The client asked"
  //     로 나간다. 시스템 재시도를 거기 실으면 사장님이 안 한 말이 사장님 말로 나가고,
  //     사장님이 같은 회차에 적은 요청과 자리를 다툰다.
  //   ★ 이 줄이 붙으면 지문이 달라지므로 각인(`of: prompt`)도 달라진다 — 낡음 판정은
  //     그대로 맞게 돈다(다시 그린 그림이 새 각인을 갖는다).
  const faceSafe = project?.reel?.face_safe === true
    ? "Keep every person and every action exactly as described above, but no human face appears "
      + "anywhere in this sheet: people act with their hands, arms and torso, framed from the "
      + "shoulders down, with faces cropped outside the frame. "
      + "Do not remove the people and do not replace them with product-only shots."
    : "";

  // ★★ 첨부 사진이 함께 나갈 때 — **그것이 무엇인지 말해 준다**(2026-08-25 사장님 실측).
  //   사진만 실어 보내면 모델이 "분위기 참고"로 읽고 제품을 자기 식으로 다시 그린다.
  //   시나리오는 사진이 있으면 생김새를 **글로 안 적으므로**(lib/ad/scenario.js) 이 문장이
  //   사진과 칸을 잇는 **유일한 자리**다 — 없으면 제품을 정의하는 것이 아무것도 없다.
  //   ★ "모든 칸에서 같게"가 핵심이다. 격자에서는 그 성질이 부작용이 아니라 목적이다.
  const refLine = refs.length
    ? `The attached reference image${refs.length > 1 ? "s show" : " shows"} the real subject. `
      + `Draw it exactly as it appears in the reference — same shape, same colour, same markings — `
      + `and keep it identical in every panel it appears in. Do not redesign it or invent a different one.`
    : "";

  // ★ faceSafe 는 **칸 설명 뒤**에 둔다 — 앞에 두면 모델이 그 제약을 먼저 읽고 장면을
  //   통째로 제품컷으로 갈아 버린다(그것이 애초에 막으려던 결과다).
  return [head, refLine, keep.join(" "), panels.join("\n"), look, faceSafe, ban, fix]
    .filter(Boolean).join("\n\n");
}
