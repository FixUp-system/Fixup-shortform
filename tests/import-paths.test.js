import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";

// ★★★ **상대 경로 import 가 실제로 풀리는가** — 값으로 잰다(2026-08-20 사고).
//
// 이 저장소의 화면 시험은 소스를 **문자열로만** 훑는다(readFileSync + 정규식). 그래서
// import 가 실제 파일을 가리키는지는 **한 번도 안 본다.** 오늘 `app/film/[mode]/page.js` 를
// `app/film/one/[mode]/page.js` 로 한 칸 깊은 곳에 옮기면서 `../../../lib/…` 아홉 줄을
// 안 고쳤고, **3,768개가 전부 그린인 채 앱이 안 떴다**(Module not found). 사장님이 쓰던
// 중에 그것을 밟았다.
//
// CLAUDE.md 는 "화면 파일을 손댔으면 한 번 굽는다"로 이 결함군을 막으라고 적어 두었다.
// 그런데 `npx next build` 는 **돌아가는 dev 서버를 죽인다**(SHOTFORM_DIST_DIR 이 안 먹는다) —
// 그래서 실제로는 자주 못 돌리고, 오늘도 그 이유로 건너뛰었다. 굽기가 잡아 주는 것 중
// **경로 해석**만 떼어 내 여기서 값싸게 잰다: 파일이 그 자리에 실제로 있는가.
//
// ⚠️ 이것은 굽기를 대신하지 않는다. 문법 오류·타입 오류·런타임 오류는 여전히 못 잡는다.
//   잡는 것은 **딱 하나** — "가리키는 파일이 없다". 오늘 앱을 죽인 것이 그것이다.

const ROOTS = ["app", "components", "lib"];
const CODE = /\.(js|jsx|mjs)$/;
// Next 가 확장자 없는 상대 import 를 해석하는 방식과 같은 순서로 후보를 만든다.
const CANDIDATES = ["", ".js", ".jsx", ".mjs", ".ts", ".tsx", "/index.js", "/index.jsx"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(name)) out.push(full);
  }
  return out;
}

// import·export·동적 import 셋 다 본다 — 어느 것이든 못 풀면 그 자리에서 죽는다.
const SPEC = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|(?:^|[\s;(])import\s*\(\s*["']([^"']+)["']\s*\)/gm;

function relativeSpecs(file) {
  const src = readFileSync(file, "utf8");
  const found = [];
  for (const m of src.matchAll(SPEC)) {
    const spec = m[1] || m[2];
    if (spec && spec.startsWith(".")) found.push(spec);
  }
  return found;
}

const FILES = ROOTS.filter((r) => existsSync(r)).flatMap((r) => walk(r));

describe("상대 경로 import 가 실제 파일을 가리킨다", () => {
  it("★ 소스 파일이 실제로 모였다 — 0개면 이 시험은 아무것도 안 재고 통과한다", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("★ 못 푸는 상대 import 가 하나도 없다 — 하나면 그 화면이 통째로 안 뜬다", () => {
    const broken = [];
    for (const file of FILES) {
      for (const spec of relativeSpecs(file)) {
        const base = path.resolve(path.dirname(file), spec);
        if (!CANDIDATES.some((ext) => existsSync(base + ext))) {
          broken.push(`${file}  →  ${spec}`);
        }
      }
    }
    // 목록을 그대로 보여 준다 — 개수만 알려 주면 어느 줄인지 다시 찾아야 한다.
    expect(broken, `못 푸는 import ${broken.length}건:\n${broken.join("\n")}`).toEqual([]);
  });
});
