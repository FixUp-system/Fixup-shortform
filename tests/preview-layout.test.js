// 화면 결함 셋 (2026-08-19 사장님 지적, 브라우저 실측으로 확정).
//
// ① 버튼 키가 안 맞는다 — 실측 `.cta` 40px · `.mini` 32px 가 **같은 줄**에 나란히.
//    ★ 같은 결함을 이미 한 번 고쳤다: globals.css 362 줄 주석이 그 사고를 적어 두었고
//      해법은 `.step-actions` 에만 걸렸다. `.preview-actions` 는 글자·여백만 맞추고
//      **키를 안 맞췄다.** 그래서 재발했다.
// ② 컷 설명이 잘 안 보인다 — 프레임 상한이 `100vh - 210px` 인데, 실측으로 이미지 위가
//    이미 139px 이고 아래에 배지·문장·여백이 73px 붙는다(합 212). 여유가 없어 화면이
//    조금만 낮아도 설명이 접힌 자리 아래로 밀린다.
// ③ 보관함 빈 상태 — 실측 360×40. 완성본이 들어올 **틀이 아예 없어** 글자 한 줄이 허공에
//    뜬다(왼쪽 정보 칸은 441px). "영역을 벗어나 보인다"의 실체다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const archive = readFileSync("app/archive/[id]/page.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("① 나란히 선 버튼은 키가 같다", () => {
  const block = css.slice(css.indexOf(".preview-actions .cta"), css.indexOf(".preview-actions .cta") + 400);

  it("★ .preview-actions 가 키를 맞춘다 — 글자·여백만 맞추면 .mini 의 32px 가 그대로 남는다", () => {
    expect(block, "키를 안 맞춰 .cta(40) 와 .mini(32) 가 나란히 선다")
      .toMatch(/min-height:\s*var\(--ctl-md\)/);
  });

  it("★ 두 줄이 되어도 글자가 안 잘린다 — 고정 키가 아니라 최소 키다", () => {
    expect(block, "height 를 못 박으면 라벨이 두 줄일 때 글자가 잘린다")
      .toMatch(/height:\s*auto/);
  });
});

describe("② 컷 설명이 이미지와 같은 화면에 남는다", () => {
  it("★ 프레임 상한이 설명 자리를 실제로 비워 둔다", () => {
    const m = css.match(/\.preview-frame\s*\{[^}]*max-width:\s*calc\(\(100vh\s*-\s*(\d+)px\)/);
    expect(m, "프레임 상한 식을 못 찾았다 — 식이 바뀌면 이 테스트도 같이 봐야 한다").toBeTruthy();
    // 실측 필요분 212px(위 139 + 배지·문장·여백 73). 딱 맞추면 여유가 0 이라 조금만
    // 낮은 화면에서 설명이 밀린다.
    expect(Number(m[1]), "여유가 없어 낮은 화면에서 컷 설명이 접힌 자리 아래로 밀린다")
      .toBeGreaterThanOrEqual(260);
  });
});

describe("③ 완성본이 없어도 자리는 남는다", () => {
  it("★ 빈 상태에도 틀을 그린다 — 글자만 두면 허공에 뜬다", () => {
    const pane = archive.slice(archive.indexOf("done-preview"), archive.indexOf("done-preview") + 500);
    expect(pane, "완성본이 없을 때 틀 없이 글자만 그린다")
      .toMatch(/empty-frame/);
  });

  it("★ 그 틀에 크기가 있다 — 없으면 글자 높이(40px)로 쪼그라든다", () => {
    expect(css, ".empty-frame 에 최소 높이가 없다").toMatch(/\.empty-frame[^}]*min-height/);
  });
});
