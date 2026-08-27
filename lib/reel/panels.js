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

import { AD_MOODS, AD_STYLE_LINES } from "../ad/options.js";

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
  const panels = cuts.map((c, i) => panelLine(c, i)).filter(Boolean);

  const mood = AD_MOODS.find((m) => m.id === settings.mood)?.line || "";
  const style = AD_STYLE_LINES[settings.style] || "";
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

  return [head, refLine, keep.join(" "), panels.join("\n"), look, ban, fix].filter(Boolean).join("\n\n");
}
