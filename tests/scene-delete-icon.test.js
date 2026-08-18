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

  it("★ 장면 줄의 다른 것들은 그대로다", () => {
    expect(rows, "끌기가 사라졌다").toMatch(/draggable/);
    expect(rows, "삭제 동작이 사라졌다").toMatch(/removeShot/);
  });
});
