// 장면 순서는 **끌어서** 바꾼다 — 화살표 버튼이 아니다.
//
// 사장님 지시(2026-08-18): "씬 순서를 업다운이 아닌 드래그 배치로."
//
// ↑↓ 두 버튼은 한 칸씩만 옮긴다 — 6번 장면을 맨 위로 보내려면 다섯 번 눌러야 하고,
// 누를 때마다 목록이 움직여 눈이 다시 자리를 찾아야 한다. 끌어 놓기는 **가려는 자리를
// 직접 가리킨다.**
//
// ★ 버튼을 지우면 **키보드로 옮길 길이 함께 사라진다**. 끌기는 마우스 전용이라, 손잡이에
//   초점을 두고 화살표 키로 옮기는 길을 남긴다 — 버튼이 하던 일을 키가 이어받는다.
// ★ 삭제는 그대로 버튼이다. 그건 순서가 아니라 없애는 일이고, 실수로 끌려 사라지면 안 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sc = readFileSync("app/create/[id]/scenario/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const rows = sc.slice(sc.indexOf('<div className="plan-list">'));

describe("장면 순서 — 끌어서 놓는다", () => {
  it("★★ 끌 수 있고, 놓은 자리로 간다", () => {
    expect(rows, "끌 수 있는 자리가 없다").toMatch(/draggable/);
    expect(rows, "끌기를 시작하는 자리가 없다").toMatch(/onDragStart/);
    // 놓기를 받으려면 onDragOver 에서 기본 동작을 막아야 한다 — 이걸 빼면 커서만 바뀌고
    // 아무 데도 못 놓는다(브라우저가 "여기는 놓을 수 없다"로 취급한다).
    expect(rows, "놓기를 받지 않는다").toMatch(/onDrop/);
    expect(rows, "onDragOver 에서 preventDefault 를 안 부른다 — 아무 데도 못 놓는다")
      .toMatch(/onDragOver=\{[^}]*preventDefault/);
  });

  it("★★ 옮기는 함수가 **자리로** 옮긴다 — 한 칸씩이 아니다", () => {
    expect(sc, "자리로 옮기는 함수가 없다").toMatch(/function moveTo|const moveTo/);
    // 끌어 놓기는 "3번을 1번 자리로" 라, 뽑아서 끼우는 것이 맞다(맞바꾸기가 아니다).
    expect(sc, "두 장면을 맞바꾸기만 한다 — 끌어 놓기의 뜻과 다르다").toMatch(/splice/);
  });

  it("★★ 화살표 버튼은 없앤다", () => {
    expect(rows, "↑ 버튼이 남아 있다").not.toContain(">↑<");
    expect(rows, "↓ 버튼이 남아 있다").not.toContain(">↓<");
  });

  it("★★ 키보드로도 옮긴다 — 버튼이 하던 일을 키가 이어받는다", () => {
    expect(rows, "손잡이에 초점을 둘 수 없다").toMatch(/tabIndex/);
    expect(rows, "화살표 키를 안 듣는다").toMatch(/onKeyDown/);
    expect(rows, "위로 옮기는 키가 없다").toMatch(/ArrowUp/);
    expect(rows, "아래로 옮기는 키가 없다").toMatch(/ArrowDown/);
  });

  it("★ 삭제는 그대로 버튼이다 — 순서가 아니라 없애는 일이다", () => {
    expect(rows, "삭제가 사라졌다").toMatch(/removeShot/);
  });

  it("★ 끌 수 있다는 것이 눈에 보인다", () => {
    expect(css, "손잡이 모양이 없다").toMatch(/\.sc-grip/);
    expect(css, "끄는 동안의 표시가 없다 — 무엇을 들고 있는지 모른다").toMatch(/\.sc-dragging|\.plan-row\.dragging/);
  });
});
