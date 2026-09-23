// **보관함 기둥을 단계별 작업 화면과 같게 맞춘다** (2026-09-23 사장님 지시).
//
// ★★★ 실측(1440px 화면) — 단계별은 x264~1397(1133px), 보관함은 x278~1382(1104px) 였다.
//   단계별만 `main.work:has(.rw-grid) { max-width: 1600px }` 로 기둥을 넓혀 두었고
//   보관함은 앱 공통 기둥(1160)을 썼다. 화면을 오갈 때 좌우 끝이 어긋나 보인다.
// ★ 고치는 방법도 **같은 방식**이다 — 화면이 표식(`arch-page`)을 올려 보내고 껍데기가
//   `:has()` 로 집는다. 껍데기에 상태를 하나 더 들이면 "지금 어느 흐름인가"를 아는 자리가
//   둘이 된다(globals.css 의 기둥 절 주석).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// 기둥을 넓히는 규칙 한 줄 — 단계별과 보관함이 **같은 선언**을 쓴다.
const columnRule = strip(css).match(/main\.work:has\([^{]*\{[^}]*\}/g) || [];

describe("기둥 — 단계별과 보관함이 같은 폭이다", () => {
  it("★★★ 기둥을 넓히는 규칙이 하나이고, 그 안에 두 흐름이 함께 있다", () => {
    expect(columnRule).toHaveLength(1);
    expect(columnRule[0]).toMatch(/\.rw-grid/);
    expect(columnRule[0]).toMatch(/\.arch-page/);
  });

  it("★★ 값은 단계별이 쓰던 1600 그대로다 — 새 숫자를 만들지 않는다", () => {
    expect(columnRule[0]).toMatch(/max-width:\s*1600px/);
  });

  it("★★★ 보관함 두 화면이 표식을 올려 보낸다", () => {
    for (const f of ["app/archive/page.js", "app/archive/[id]/page.js"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/className="arch-page"/);
    }
  });

  it("★★ 상세 카드는 기둥 안에서 꽉 찬다 — 자기 상한으로 기둥을 또 정하지 않는다", () => {
    const rule = strip(css).slice(strip(css).indexOf(".panel--library"));
    const decl = rule.slice(0, rule.indexOf("}"));
    expect(decl).toMatch(/width:\s*100%/);
    expect(decl, "기둥과 두 벌이 된다").not.toMatch(/max-width/);
  });
});
