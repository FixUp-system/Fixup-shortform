// 이름과 로그인 화면의 자리 (2026-08-13 사용자 요청).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const login = readFileSync("app/login/page.js", "utf8");
const layout = readFileSync("app/layout.js", "utf8");
const sidebar = readFileSync("components/Sidebar.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("이름은 shortform 이다", () => {
  // 눈에 보이는 자리 셋 — 로고·탭 제목·로그인 화면. 안쪽 이름(SHOTFORM_* env·
  // 폴더·패키지명)은 그대로 둔다: 그것들은 브랜드가 아니라 코드의 식별자다.
  it("보이는 자리에 옛 이름이 없다", () => {
    for (const [name, src] of [["로그인", login], ["레이아웃", layout], ["사이드바", sidebar]]) {
      // SHOTFORM_ 로 시작하는 env 이름은 코드의 식별자라 건드리지 않는다
      const visible = src.replace(/SHOTFORM_[A-Z_]+/g, "");
      expect(visible, `${name} 에 옛 이름이 남아 있다`).not.toMatch(/shotform/i);
    }
  });

  it("세 자리 다 새 이름을 쓴다", () => {
    expect(login).toMatch(/shortform/);
    expect(layout).toMatch(/shortform/);
    expect(sidebar).toMatch(/shortform/);
  });
});

describe("로그인 화면은 가운데 선다", () => {
  // 사이드바가 없는 화면(work--bare)이라 위쪽에 붙어 있었다 — 가로만 가운데였고
  // 세로는 화면 맨 위였다.
  it("세로 가운데로 세운다", () => {
    const at = css.indexOf(".work--bare {");
    expect(at, ".work--bare 규칙이 없다").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule, "세로 가운데 정렬이 없다").toMatch(/min-height|justify-content|place-content/);
  });
});

describe("사이드바 — 준비 중 항목", () => {
  it("설정은 두지 않는다 — 누를 수 없는 줄이다", () => {
    expect(sidebar).not.toMatch(/설정/);
  });
});
