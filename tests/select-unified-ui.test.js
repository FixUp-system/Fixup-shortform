// 드롭다운 한 벌(2026-09-14 사장님 지시: "드롭다운 ui 전부 통일해줘").
//
// ★ 그 전에는 세 벌이었다 — 크레딧 코드(.cost-select) · 사용자 관리 표(.dlg-input.tier-pick) · 자막 조절판(.sub-select).
//   표의 것은 `height: var(--ctl)` 이었는데 **--ctl 이 어디에도 정의돼 있지 않아** 16px 로 쪼그라든 브라우저 기본 모양이었다.
//   이제 화면은 components/Select.jsx 하나를 부르고, 모양은 globals.css 의 .dd · .dd-input 한 규칙이 정한다.
//   자막 조절판만 격자 리듬(--ctl-h 38px) 때문에 **키와 폭**을 따로 준다 — 모양은 같다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (/\.(jsx?|tsx?)$/.test(name) && !p.includes("api")) out.push(p);
  }
  return out;
}
const css = readFileSync("app/globals.css", "utf8");
const rule = (sel) => {
  const i = css.indexOf(`${sel} {`);
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
};

describe("드롭다운 — 한 벌", () => {
  it("화면은 <select> 를 직접 쓰지 않는다 — components/Select.jsx 만 쓴다", () => {
    const raw = [...collect("app"), ...collect("components")]
      .filter((p) => !p.replace(/\\/g, "/").endsWith("components/Select.jsx"))
      .filter((p) => /<select\b/.test(readFileSync(p, "utf8")));
    expect(raw, `직접 쓴 <select>: ${raw.join(", ")}`).toEqual([]);
  });

  it("Select 는 감싼 칸(.dd) 안에 .dd-input 을 그린다", () => {
    const src = readFileSync("components/Select.jsx", "utf8");
    expect(src).toMatch(/className=\{`dd/);
    expect(src).toMatch(/<select[\s\S]*className=\{`dd-input/);
  });

  it("모양은 한 규칙 — 기본 화살표 끄기 · 32px · 삼각형은 .dd::after 하나", () => {
    expect(rule(".dd-input")).toMatch(/appearance:\s*none/);
    expect(rule(".dd-input")).toMatch(/height:\s*var\(--ctl-sm\)/);
    expect(rule(".dd::after")).toMatch(/border-top:/);
  });

  it("옛 세 벌의 규칙이 없다 — 주석에 남긴 이름은 경위라 세지 않는다", () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/\.cost-select/);
    expect(code).not.toMatch(/\.tier-pick/);
    expect(code).not.toMatch(/\.sub-select-wrap::after/);
    expect(code).not.toMatch(/\.cost-filters select\.field/);
    for (const f of ["app/admin/page.js", "app/admin/codes/page.js", "components/SubtitleEditor.jsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/className="[^"]*(tier-pick|cost-select)/);
    }
  });
});
