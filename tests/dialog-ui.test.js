// 팝업은 이 화면의 것이라야 한다 — 브라우저 기본 대화상자는 OS 창이라 어두운 화면 위에
// 흰 시스템 창이 뜬다. 글꼴·색·버튼 모양이 전부 우리 것이 아니고, 문구도 붙는 자리가 없다
// (2026-08-13 사용자 지적).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";

const dialog = existsSync("components/DialogProvider.jsx")
  ? readFileSync("components/DialogProvider.jsx", "utf8")
  : "";
const layout = readFileSync("app/layout.js", "utf8");
const admin = readFileSync("app/admin/page.js", "utf8");
const archive = readFileSync("app/archive/page.js", "utf8");
const cards = readFileSync("components/ProjectCards.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("팝업 — 우리 화면의 것", () => {
  it("화면들이 브라우저 기본 대화상자를 부르지 않는다", () => {
    for (const [name, src] of [["admin", admin], ["archive", archive], ["ProjectCards", cards]]) {
      expect(src, `${name} 이 window.confirm/alert/prompt 를 쓴다`)
        .not.toMatch(/window\.(confirm|alert|prompt)\s*\(/);
      // ★ window. 없이 부르는 전역도 브라우저 것이다 — 우리 팝업을 **가져다 쓰는지**로 잰다.
      //   실제로 보관함이 그 상태로 남아 있었다: 전역 confirm 은 값을 바로 돌려주는데
      //   우리 것은 약속이라, await 없이 쓰면 늘 참이 되어 묻지도 않고 지워진다.
      expect(src, `${name} 이 useDialog 를 안 쓴다`).toMatch(/useDialog/);
    }
  });

  it("답을 기다린다 — 팝업은 약속(Promise)으로 답한다", () => {
    for (const [name, src] of [["archive", archive], ["ProjectCards", cards]]) {
      expect(src, `${name} 이 confirm 을 기다리지 않는다`).toMatch(/await confirm\(/);
    }
  });

  it("한 자리에서 그린다 — 화면마다 팝업을 다시 만들지 않는다", () => {
    expect(dialog, "components/DialogProvider.jsx 가 없다").toBeTruthy();
    expect(layout, "레이아웃이 팝업을 걸지 않았다").toMatch(/DialogProvider/);
  });

  // ★ <dialog> 를 쓰는 이유: ESC·포커스 가두기·배경 가림을 브라우저가 이미 한다.
  // div 로 흉내 내면 그 셋을 손으로 만들어야 하고, 대개 하나를 빠뜨린다.
  it("네이티브 <dialog> 위에 얹는다", () => {
    expect(dialog).toMatch(/<dialog/);
    expect(dialog).toMatch(/showModal\(\)/);
  });

  it("ESC 로 닫으면 취소로 답한다", () => {
    expect(dialog).toMatch(/onCancel/);
  });

  it("배경을 눌러도 닫힌다", () => {
    expect(dialog).toMatch(/backdrop|배경/);
  });

  // 값을 받는 팝업(크레딧 수량·사유·비밀번호)까지 여기서 받는다 — 세 자리가 prompt 였다.
  it("값을 받는 팝업도 있다", () => {
    expect(dialog).toMatch(/type === "prompt"|kind === "prompt"/);
  });

  it("색과 모서리를 토큰으로만 그린다", () => {
    const at = css.indexOf(".dlg {");
    expect(at, "globals.css 에 .dlg 규칙이 없다").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toMatch(/var\(--surface\)/);
    expect(rule).toMatch(/var\(--r-card\)/);
  });
});
