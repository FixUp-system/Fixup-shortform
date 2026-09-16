// 사이드바 [내 계정]·[운영] 이 GET /api/me 왕복 없이도 첫 렌더부터 옳게 그려지는가.
//
// 배선은 셋이다: app/layout.js(헤더 → meInitialFromHeaders) → components/AppShell.jsx
// (MeProvider·Sidebar 에 값을 건넴) → components/Sidebar.jsx(initialAdmin·guest 로 그림).
// 실제 판정(meInitialFromHeaders)은 tests/initial-me.test.js 가 동작으로 잰다 — 여기서는
// 그 값이 화면까지 끊기지 않고 이어지는지를 소스로 문다(이 저장소에 렌더 테스트가 없다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const layout = strip(readFileSync("app/layout.js", "utf8"));
const shell = strip(readFileSync("components/AppShell.jsx", "utf8"));
const side = strip(readFileSync("components/Sidebar.jsx", "utf8"));

describe("사이드바 지연 — 헤더 힌트가 첫 렌더까지 이어진다", () => {
  it("레이아웃이 헤더에서 읽어 AppShell 에 넘긴다", () => {
    expect(layout).toMatch(/meInitialFromHeaders\(await headers\(\)\)/);
    expect(layout).toMatch(/<AppShell\s+initialMe=\{meInitial\}>/);
  });

  it("AppShell 이 MeProvider 와 Sidebar 양쪽에 건넨다", () => {
    expect(shell).toMatch(/<MeProvider initial=\{initialMe\}>/);
    expect(shell).toMatch(/<Sidebar initialAdmin=\{initialMe\?\.isAdmin\}\s*\/>/);
  });

  it("Sidebar 는 응답이 오기 전엔 initialAdmin 을, 온 뒤엔 me?.isAdmin 만 본다", () => {
    expect(side).toMatch(/const isAdmin = !!me\?\.isAdmin \|\| \(initialAdmin && !ready\)/);
  });

  it("[내 계정] 섹션은 guest 하나로만 가린다 — 프로필 완주를 기다리지 않는다", () => {
    const at = side.indexOf('href="/me"');
    const gate = side.lastIndexOf("{!guest && (", at);
    expect(gate).toBeGreaterThan(-1);
    // me·ready 조건이 섞이지 않았는지 — 섞이면 다시 GET /api/me 를 기다리게 된다.
    expect(side.slice(gate, at)).not.toMatch(/\bme\s*&&/);
  });
});
