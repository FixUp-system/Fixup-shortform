// ⑤영상 — **수정 요청 폼**과 **선 없애기**(2026-08-25 사장님 지시).
//
// ★ 앞의 셋(②시나리오·③이미지·④프롬프트)과 같은 모양이다: 결과를 보여 주고
//   아래에서 한국어로 고쳐 달라고 적는다.
// ★ 영상은 값이 크다 — 요청을 적어 [다시 만들기]를 눌러야 나간다(자동으로 안 나간다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const page = readFileSync("app/reel/[id]/video/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const clean = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("실행 버튼은 **선 아래**, 이전으로와 같은 줄이다", () => {
  // ★★ 2026-08-25 — 사장님이 앞서의 결정을 **뒤집었다**: "영상 만들기 버튼이 이전으로랑
  //   다른 위치에 배치되어 있어. 라인 위에 배치되어 있어서 라인 아래 배치로 변경해줘."
  //   그전에는 선 없는 줄(step-actions--bare)에 혼자 서서 **구분선 위**에 있었다 —
  //   그 배치의 근거였던 "돈 나가는 버튼은 그 줄에 혼자 선다"도 같은 분이 뒤집은 것이다
  //   (⑥완성이 먼저 한 줄로 합쳐졌고 여기가 그 짝이다).
  it("★ 굽는 버튼이 [이전으로]와 **같은 줄**에 있다", () => {
    const at = clean.indexOf('<div className="step-actions">');
    expect(at, "맨 아래 실행줄을 못 찾겠다").toBeGreaterThan(-1);
    const row = clean.slice(at, at + 500);
    expect(row).toContain("ReelBack");
    expect(row, "굽는 버튼이 그 줄에 없다").toContain("bakeBtn");
  });

  it("★ 선 없는 갈래를 더 이상 쓰지 않는다 — 그것이 '선 위'의 원인이었다", () => {
    expect(clean).not.toContain("step-actions--bare");
  });

  it("수정 요청 칸이 떠 있을 때는 그 칸 안에 있다 — 둘은 동시에 안 뜬다", () => {
    // bakeBtn 은 한 곳에서만 그려지고 자리는 asking 하나로 갈린다.
    expect(clean).toMatch(/\{!asking && bakeBtn\}/);
  });
});

describe("수정 요청 폼", () => {
  it("여러 줄로 적을 수 있다", () => {
    expect(clean).toContain("textarea");
    expect(clean).toContain("note-form");
  });

  // ★★ 영상이 있을 때만 보인다 — 만들기 전에는 고칠 것이 없다.
  it("만든 뒤에만 보인다", () => {
    const at = clean.indexOf("<textarea");
    expect(at).toBeGreaterThan(-1);
    // ★ 조건에 이름이 붙었다(`asking`) — 굽는 버튼의 자리가 이 값 하나로 갈리기 때문이다.
    //   그 이름이 실제로 "만든 뒤이고 굽는 중이 아니다"인지도 같이 본다.
    expect(clean.slice(Math.max(0, at - 300), at)).toMatch(/doneCount|hasVideo|videoUrl|asking/);
    expect(clean).toMatch(/const asking = doneCount > 0 && !rendering/);
  });

  // ★★ 값이 나가므로 **자동으로 안 보낸다** — 적고 버튼을 눌러야 나간다.
  it("요청은 다시 만들기 버튼으로 나간다", () => {
    expect(clean).toMatch(/note[\s\S]{0,200}startClips|startClips[\s\S]{0,400}note/);
  });
});
