// ②시나리오 — **사장님이 한국어로 고쳐 달라고 적는다**(2026-08-25 지시).
//
// ★★ 기존 `edits`(장면 필드 직접 편집) 옆에 붙이는 **다른 축**이다:
//   · edits — 사장님이 shows·camera 칸을 직접 고친 것. 그 장면을 통째로 실어 "지켜라"
//   · note  — "따뜻한 한 잔이 기다리는 곳 → 함께 기다릴 수 있는 곳" 처럼 **말로 하는 요청**
//   둘은 함께 올 수 있다. 새 장치를 만들지 않고 같은 자리(buildScenarioMessages)에 얹는다.
//
// ★ wiki 원칙(2026-08-19 사장님): "최대한 통제를 자제한다 — 시나리오를 벗어나거나,
//   제품을 변형시키거나, 인물 일관성이 깨지는 것만 빼고." 그래서 요청을 잘게 규정하지 않고
//   **그대로 전하고** 지켜야 할 선(언어·요청한 자리만)만 못 박는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { buildScenarioMessages } from "../lib/reel/scenario.js";

const project = {
  settings: { seconds: 15, aspect_ratio: "9:16", narration_lang: "ko", format: "story", mood: "warm", style: "photo" },
  material: { text: "밀키트 떡볶이", photos: [] },
};
// ★ 한 번만 읽는다 — describe 마다 지역 변수로 두면 옆 블록에서 안 보여
//   같은 이름으로 또 읽게 된다(실제로 그래서 한 번 밟았다).
const page = readFileSync("app/reel/[id]/scenario/page.js", "utf8");
const NOTE = "따뜻한 한 잔이 기다리는 곳을 따뜻한 한 잔과 함께 기다릴 수 있는 곳으로 고쳐줘";

describe("수정 요청이 지시문에 실린다", () => {
  it("사장님이 적은 말이 그대로 들어간다", () => {
    const { messages } = buildScenarioMessages(project, { note: NOTE });
    expect(messages[0].content).toContain(NOTE);
  });

  // ★★ 이 저장소가 다섯 번 쓴 처방 — **안 넘기면 예전과 글자 그대로.**
  it("안 넘기면 지문이 예전과 같다", () => {
    const withOut = buildScenarioMessages(project).messages[0].content;
    const withEmpty = buildScenarioMessages(project, { note: "   " }).messages[0].content;
    expect(withEmpty).toBe(withOut);
  });

  // ★★ 사장님이 못 박은 언어 규칙 — 지시문은 영어, 대사만 한국어.
  //   요청을 한국어로 받으므로 모델이 지문까지 한국어로 쓸 위험이 생긴다. 그 자리를 막는다.
  it("영어로 쓰되 대사만 한국어라고 말한다", () => {
    const body = buildScenarioMessages(project, { note: NOTE }).messages[0].content;
    expect(body).toMatch(/영어/);
    expect(body).toMatch(/대사|line/);
  });

  // ★ 요청한 자리만 고친다 — 통째로 다시 쓰면 사장님이 만족했던 장면까지 사라진다.
  it("요청한 자리만 고치라고 말한다", () => {
    const body = buildScenarioMessages(project, { note: NOTE }).messages[0].content;
    expect(body).toMatch(/그 자리|요청한|나머지는/);
  });
});

describe("라우트가 요청을 나른다", () => {
  const route = readFileSync("app/api/reel/[id]/scenario/route.js", "utf8");
  it("body 에서 note 를 읽어 generateScenario 로 넘긴다", () => {
    expect(route).toContain("note");
    expect(route).toMatch(/generateScenario\(\{[\s\S]{0,200}note/);
  });
});

describe("화면에 적는 자리가 있다", () => {
  it("여러 줄로 적을 수 있다", () => {
    expect(page).toContain("textarea");
  });
  // ⚠️ 고치면 이미지를 다시 만들어야 한다 — **항상** 말해 준다(2026-08-25 사장님 지시).
  //   전에는 그림이 있을 때만 떴는데, 그러면 그림을 만들기 전에 고치려는 사람은
  //   그 사실을 모른다. 수정 폼 바로 아래가 그 말을 할 자리다.
  it("이미지를 다시 만들어야 한다고 폼 아래에서 말한다", () => {
    expect(page).toMatch(/이미지를 다시/);
    const ta = page.indexOf("textarea");
    const msg = page.indexOf("이미지를 다시");
    expect(msg, "안내가 입력 칸보다 앞에 있다").toBeGreaterThan(ta);
  });

  it("그림 유무로 가르지 않는다 — 항상 보인다", () => {
    // ★ 재는 것은 **안내 문구 주변**이다 — 파일 전체를 보면 무관한 자리(이미지
    //   자동 생성 조건)의 같은 모양까지 걸린다. 실제로 그랬다.
    const at = page.indexOf("이미지를 다시");
    expect(at).toBeGreaterThan(-1);
    expect(page.slice(Math.max(0, at - 300), at)).not.toContain("image?.url");
  });
});

describe("새 CSS 를 안 만든다", () => {
  // ★★ 이 저장소는 값을 두 벌로 두지 않는다. 화면이 CSS 에 없는 클래스를 쓰면
  //   스타일이 조용히 안 먹는다 — 테스트는 그런데도 그린이라 눈으로만 발견된다.
  it("입력 칸이 쓰는 클래스가 CSS 에 있다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const at = page.indexOf("textarea");
    const around = page.slice(Math.max(0, at - 200), at + 200);
    const m = around.match(/className="([a-z- ]+)"/);
    expect(m, "textarea 의 className 을 못 찾았다").toBeTruthy();
    for (const cls of m[1].split(" ").filter(Boolean)) {
      expect(css, `CSS 에 .${cls} 가 없다`).toContain("." + cls);
    }
  });
});

describe("폼이 세로로 쌓인다", () => {
  // ★★ .step-actions 는 **가로** 정렬(flex row)이다 — 그 안에 입력 칸을 두면
  //   설명이 옆에 붙고 칸 폭이 줄어들어 시나리오 본문과 가로가 안 맞는다.
  //   입력 칸은 자기 블록(.note-form)에서 세로로 쌓여야 한다.
  it("입력 칸이 .step-actions 안에 있지 않다", () => {
    const ta = page.indexOf("<textarea");
    const acts = page.indexOf('className="step-actions"');
    expect(ta).toBeGreaterThan(-1);
    expect(acts).toBeGreaterThan(-1);
    expect(ta, "입력 칸이 가로 정렬 블록 안에 있다").toBeLessThan(acts);
  });

  it("자기 블록을 가지고 그 클래스가 CSS 에 있다", () => {
    expect(page).toContain('className="note-form"');
    expect(readFileSync("app/globals.css", "utf8")).toContain(".note-form");
  });
});

describe("안내는 오른쪽 끝에", () => {
  // ★ 입력 칸 아래 보조 문구는 오른쪽이 이 저장소 관례다
  //   (.char-count · .step-actions .hint 가 둘 다 text-align: right).
  it("note-form 안 안내가 오른쪽 정렬된다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const at = css.indexOf(".note-form");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 400)).toMatch(/text-align:\s*right/);
  });
});
