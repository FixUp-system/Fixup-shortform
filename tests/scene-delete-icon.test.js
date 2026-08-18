// 장면 삭제는 **오른쪽 끝의 아이콘**이다.
//
// 사장님 지시(2026-08-18): "삭제 버튼은 오른쪽 끝으로 배치해줘 · 아이콘으로 배치해줘."
//
// ↑↓ 를 걷어내고 삭제만 남기니 글자 버튼 하나가 장면 왼쪽에 덩그러니 섰다. 삭제는 **자주
// 쓰는 일이 아니라 가끔 쓰는 일**이라 눈길이 먼저 닿을 자리가 아니고, 그렇다고 없앨 수도
// 없다. 오른쪽 끝의 작은 아이콘이 그 두 가지를 함께 만족시킨다.
//
// ★ 아이콘만 두면 **무엇인지 모르는 그림**이 된다 — 이 저장소는 아이콘 옆에 늘 글자
//   라벨을 둔다(components/Icon.jsx 머리말). 라벨을 뺄 때는 그 자리를 aria-label·title 이
//   대신해야 한다. 안 그러면 스크린리더에는 이름 없는 버튼이고, 마우스로는 눌러 봐야 안다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sc = readFileSync("app/create/[id]/scenario/page.js", "utf8");
const icon = readFileSync("components/Icon.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const rows = sc.slice(sc.indexOf('<div className="plan-list">'));

describe("장면 삭제 — 오른쪽 끝 아이콘", () => {
  it("★ 같은 아이콘 세트에 휴지통이 있다 — 새 그림 방식을 만들지 않는다", () => {
    expect(icon, "휴지통 아이콘이 없다").toMatch(/trash:/);
    expect(icon, "아이콘이 hex 색을 쓴다 — 세트 규칙은 currentColor 다").not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it("★★ 삭제가 아이콘으로 그려진다", () => {
    expect(rows, "삭제가 아직 글자 버튼이다").toMatch(/Icon[^>]*name="trash"/);
  });

  it("★★ 이름 없는 버튼이 되지 않는다", () => {
    const at = rows.indexOf('name="trash"');
    const btn = rows.slice(Math.max(0, at - 400), at + 120);
    expect(btn, "무엇을 하는 버튼인지 말하지 않는다 — 스크린리더에는 이름이 없다")
      .toMatch(/aria-label="[^"]*삭제|title="[^"]*삭제/);
  });

  it("★★ 오른쪽 끝에 선다", () => {
    expect(css, "삭제를 오른쪽으로 미는 규칙이 없다").toMatch(/\.sc-del/);
    const r = css.slice(css.indexOf(".sc-del"), css.indexOf(".sc-del") + 220);
    expect(r, "오른쪽 끝으로 안 민다").toMatch(/margin-left:\s*auto|justify-content:\s*flex-end/);
  });

  // 사장님 지시(같은 회차): "장면 추가 버튼도 그냥 기호로 표현해줘."
  it("★★ 장면 추가도 기호다 — 삭제와 짝이 되는 자리다", () => {
    const head = sc.slice(sc.indexOf("step-actions plan-head"), sc.indexOf('<div className="plan-list">'));
    expect(head, "장면 추가가 아직 글자다").toMatch(/Icon[^>]*name="plus"/);
    expect(head, "무엇을 하는 버튼인지 말하지 않는다").toMatch(/aria-label="[^"]*장면 추가/);
  });

  it("★★ 두 기호 버튼의 크기가 같다 — 짝인데 8px 어긋나 있었다", () => {
    // 추가 버튼은 목록 머리줄에 있어 `.step-actions .mini` 의 40px 를 물려받았고,
    // 카드 안의 삭제는 32px 였다. 실행줄 규칙의 뜻은 "한 줄에 선 **글자 버튼들**의 키를
    // 맞춘다"이지, 짝이 있는 기호 버튼까지 끌어가라는 것이 아니다.
    const del = css.slice(css.indexOf(".sc-del"), css.indexOf(".sc-del") + 200);
    const add = css.slice(css.indexOf(".step-actions .sc-add"), css.indexOf(".step-actions .sc-add") + 160);
    expect(add, "추가 버튼이 실행줄 키를 그대로 물려받는다").toMatch(/height:\s*var\(--ctl-sm\)/);
    for (const r of [del, add]) {
      expect(r, "정사각이 아니다 — 짝과 모양이 갈린다").toMatch(/width:\s*var\(--ctl-sm\)/);
    }
  });

  it("★ 장면 줄의 다른 것들은 그대로다", () => {
    expect(rows, "끌기가 사라졌다").toMatch(/draggable/);
    expect(rows, "삭제 동작이 사라졌다").toMatch(/removeShot/);
  });
});
