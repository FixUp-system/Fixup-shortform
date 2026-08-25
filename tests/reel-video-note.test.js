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

describe("영상과 버튼 사이 선이 없다", () => {
  // ★ .step-actions 의 border-top 은 다른 화면도 쓴다 — 여기만 끄는 갈래가 필요하다.
  it("선 없는 갈래가 CSS 에 있다", () => {
    expect(css).toMatch(/step-actions--bare|\.no-rule/);
  });

  it("만들기 줄이 그 갈래를 쓴다", () => {
    // ★★ 2026-08-25 — 재던 방식을 바꿨다. 예전에는 `startClips` 에서 거슬러 올라가 가장
    //   가까운 `step-actions` 를 봤는데, 굽는 버튼이 **한 곳에서만 그려지도록**(bakeBtn)
    //   위로 올라가면서 그 거리 재기가 깨졌다. 지키려는 것은 위치가 아니라 **선이 없다**는
    //   것이므로, 그 줄이 선 없는 갈래를 쓰는지를 직접 본다.
    expect(clean, "만들기 버튼 줄이 선 없는 갈래를 안 쓴다").toContain('className="step-actions step-actions--bare"');
    // ★ 그 줄에 들어가는 것은 굽는 버튼 하나다(되돌아가는 링크는 아래 줄이다).
    expect(clean).toMatch(/step-actions--bare"[\s\S]{0,120}bakeBtn/);
  });
});

describe("굽는 버튼은 ②③④와 같은 모양이다", () => {
  // ★★ 2026-08-25 사장님 지시: "영상에서의 다시 만들기 버튼이 이미지 생성과 시나리오
  //   영상프롬프팅과 달라서 통일 시켜줘." 앞의 셋은 전부 **수정 요청 칸 안 오른쪽 아래**에
  //   `.mini` 로 서 있는데 여기만 칸 밖 별도 줄의 `.cta` 였다.
  it("한 곳에서만 그린다 — 자리가 둘이어도 라벨이 안 갈린다", () => {
    expect(clean).toContain("const bakeBtn");
    // 굽기를 부르는 자리가 하나뿐이다(버튼을 손으로 두 번 적지 않는다).
    expect(clean.match(/onClick=\{startClips\}/g) || []).toHaveLength(1);
  });

  it("생김새가 앞의 셋과 같다 — .mini 다", () => {
    const at = clean.indexOf("const bakeBtn");
    expect(clean.slice(at, at + 200)).toContain('className="mini"');
  });

  it("수정 요청 칸 안에서는 안내문 오른쪽에 선다", () => {
    const at = clean.indexOf("note-act");
    expect(at, "수정 요청 칸에 실행 자리가 없다").toBeGreaterThan(-1);
    const box = clean.slice(at, at + 220);
    expect(box).toContain("note-hint");
    expect(box.indexOf("note-hint")).toBeLessThan(box.indexOf("bakeBtn"));
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
