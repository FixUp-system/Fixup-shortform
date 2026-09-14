// 영상 프롬프트를 화면에서 **읽을 수 있게** 끊는다.
//
// ★★ 왜 생겼나(2026-08-27): 사장님이 실제로 만든 프롬프트가 3,785자인데 줄바꿈이 **0개**
//   였다. 시나리오 화면은 그 글을 읽고 [이대로 만들기]를 누를지 정하는 자리인데, 한
//   문단이면 읽을 수가 없어서 그 자리가 통째로 죽는다.
// ★ 근본 처방은 지문이 맡는다(AD_SYSTEM 이 "단마다 줄을 바꾼다"를 시킨다). 이 파일은
//   **그 전에 만든 시나리오**를 위한 것이다 — 옛 문서도 열어서 읽을 수 있어야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { prettyPrompt } from "../lib/ad/prompt-view.js";

// 사장님이 2026-08-27 에 실제로 만든 삼겹살 광고 프롬프트의 모양(줄바꿈 0개).
const REAL =
  "A 15-second vertical 9:16 live-action cinematic restaurant commercial in bright tones. " +
  "REFERENCE IMAGE: @Image1 is the restaurant's official logo. Reproduce it exactly as shown. " +
  "PEOPLE: Two diners in their late 20s to 30s, one man and one woman. " +
  "SCENES AND NARRATION (all narration is a warm off-screen Korean voice): " +
  '(0–4s) Extreme close-up: thick slabs of pork belly hit a hot grill. The voice says: "지글지글." ' +
  '(4–8s) The camera glides over a full table spread. The voice says: "푸짐한 한상차림." ' +
  '(12–15s) Smooth pull-back to the front window. The voice closes: "오늘 저녁, 여기서 만나요." ' +
  "CAMERA, LIGHT, COLOR: Handheld-feel macro close-ups with shallow depth of field. " +
  "SOUND: Loud sizzle of pork fat, charcoal crackle. " +
  "NEGATIVE: no on-screen text, no extra fingers, no burnt meat.";

describe("한 덩어리로 온 프롬프트를 단마다 끊는다", () => {
  const out = prettyPrompt(REAL);

  it("줄바꿈이 0개이던 글에 줄이 생긴다", () => {
    expect(REAL.includes("\n")).toBe(false);
    expect(out.split("\n").length).toBeGreaterThan(8);
  });

  it("단 머리말 앞에서 끊는다", () => {
    for (const label of ["REFERENCE IMAGE:", "PEOPLE:", "SCENES AND NARRATION",
                         "CAMERA, LIGHT, COLOR:", "SOUND:", "NEGATIVE:"]) {
      expect(out, `${label} 앞이 안 끊겼다`).toContain(`\n\n${label}`);
    }
  });

  it("장면 시간 앞에서도 끊는다 — 여기가 가장 길다", () => {
    for (const at of ["(0–4s)", "(4–8s)", "(12–15s)"]) {
      expect(out, `${at} 앞이 안 끊겼다`).toContain(`\n${at}`);
    }
  });

  // ★★ 이것이 이 함수의 계약이다. 화면용으로 끊을 뿐 **값은 그대로**여야 한다 —
  //   여기서 글자가 바뀌면 사장님이 읽은 것과 fal 에 나가는 것이 갈린다.
  it("★ 공백을 줄바꿈으로 바꿀 뿐 글자는 하나도 안 바뀐다", () => {
    const flat = (s) => s.replace(/\s+/g, " ").trim();
    expect(flat(out)).toBe(flat(REAL));
  });
});

describe("건드리면 안 되는 경우", () => {
  // ★ 모델이 이미 나눠 놓았으면 그대로 둔다 — 모델이 나눈 자리가 가장 정확하다.
  it("줄바꿈이 이미 있으면 손대지 않는다", () => {
    const already = "A 15-second ad.\n\nPEOPLE: two diners.\n\nSOUND: sizzle.";
    expect(prettyPrompt(already)).toBe(already);
  });

  it("빈 값·문자열이 아닌 값에 안 죽는다", () => {
    for (const v of ["", "   ", null, undefined, 42, {}]) expect(prettyPrompt(v)).toBe("");
  });

  // ★ 문장 첫 글자(대문자 하나)는 단 머리말이 아니다 — {2,} 가 그것을 막는다.
  it("보통 문장을 쪼개지 않는다", () => {
    const plain = "A woman lifts the jar. She smiles. The light comes up.";
    expect(prettyPrompt(plain)).toBe(plain);
  });
});

// ★★ 2026-09-14 — **뒤집힌 판이다.** 그전에는 광고 시나리오 화면이 이 함수로 영어 프롬프트
//   원문을 그리는 것을 못 박았다. 사장님 지시(사용자에게 불필요한 정보 제거)로 그 문단을 걷었다 —
//   손님은 영어 지시문을 읽지도 고치지도 않고, 판단에 쓰는 것은 이야기·장면·대사 목록이다.
//   ★ 함수 자체(위 묶음)는 순수 함수라 그대로 잰다 — 원문을 다시 보일 날이 오면 이 함수가 선다.
describe("화면 — 광고 시나리오에 영어 프롬프트 원문을 그리지 않는다", () => {
  // 주석은 걷어내고 판정한다 — 걷은 이유를 적은 주석이 단정에 걸리면 안 된다.
  const src = readFileSync("app/ads/[id]/page.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("★ prettyPrompt(scenario?.text) 를 그리지 않는다", () => {
    expect(src, "영어 프롬프트 원문이 화면에 돌아왔다").not.toMatch(/\{prettyPrompt\(/);
    expect(src).not.toContain('className="script-src direction-lines"');
  });
});
