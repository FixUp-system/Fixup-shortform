// **가져오는 이름이 실제로 있는가** (2026-08-27, 배포 로그에서 발견).
//
// 겪은 일 — `lib/speech-probe.js` 가 `costActor` 를 `./actor.js` 에서 가져오고 있었다.
// 그 파일은 그 이름을 안 내보낸다(`costActor` 는 `lib/costs.js` 에 있다). 그래서 값이
// `undefined` 였고, 부르는 순간 TypeError → 바깥 catch 가 삼켜 **whisper 결과가 통째로
// 버려졌다**(`return []`). 자막 시각을 재는 장치가 조용히 죽어 있었고 원장에도 안 남았다.
//
// ★★ 왜 아무도 몰랐나 — 번들러는 이것을 **경고로만** 말한다
//   ("Attempted import error: 'costActor' is not exported"). 빌드는 성공하고, 테스트는
//   그 모듈을 직접 부르지 않으면 지나간다. 프로덕션 배포 로그를 눈으로 읽다가 봤다.
//
// 그래서 **상대경로 import 를 전부 훑어** 그 이름이 대상 파일에 있는지 본다.
// 사슬 전체를 해석하는 것이 아니라(재수출은 아래에서 따로 받는다) 이 사고의 모양 하나를
// 정확히 막는 판이다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = [...walk("lib"), ...walk("app"), ...walk("components")];

// `import { a, b as c } from "./x.js"` 만 본다 — 기본/네임스페이스 import 는 이 사고와 무관하다.
const NAMED = /import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g;

// 그 파일이 이 이름을 내보내는가.
//   · `export function a` · `export const a` · `export class a`
//   · `export { a }` · `export { b as a }`
//   · `export * from "./y.js"` 가 있으면 **판정을 포기한다**(사슬을 안 따라간다 —
//     거짓 경보를 내느니 그 파일은 넘긴다).
function exportsName(src, name) {
  if (/export\s*\*\s*from/.test(src)) return true;
  if (new RegExp(`export\\s+(async\\s+)?(function|const|let|var|class)\\s+${name}\\b`).test(src)) return true;
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const as = part.split(/\bas\b/);
      const out = (as[1] || as[0] || "").trim();
      if (out === name) return true;
    }
  }
  return false;
}

describe("가져오는 이름이 대상 파일에 있다", () => {
  for (const file of FILES) {
    // ★ 줄 주석은 벗긴다 — 주석에 적어 둔 **예시** import 가 단정에 걸린다(실제로
    //   lib/reel/steps.js 의 설명 주석이 그랬다). 블록 주석은 안 벗긴다: 정규식으로
    //   벗기다 파일을 통째로 삼킨 적이 있다(tests/declared-state.test.js 머리말).
    const src = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, " ");
    const specs = [...src.matchAll(NAMED)];
    if (!specs.length) continue;

    it(`${file}`, () => {
      const missing = [];
      for (const [, names, rel] of specs) {
        // 확장자가 없으면 .js·.jsx 를 차례로 본다(화면은 확장자를 자주 생략한다).
        const base = resolve(dirname(file), rel);
        const target = [base, `${base}.js`, `${base}.jsx`, join(base, "index.js")].find(
          (p) => existsSync(p) && statSync(p).isFile()
        );
        if (!target) continue;                       // 못 찾은 경로는 이 판의 일이 아니다
        const targetSrc = readFileSync(target, "utf8");
        for (const part of names.split(",")) {
          const wanted = part.split(/\bas\b/)[0].trim();
          if (!wanted || wanted === "type") continue;
          if (!exportsName(targetSrc, wanted)) missing.push(`${wanted} ← ${rel}`);
        }
      }
      expect(
        missing,
        `없는 이름을 가져온다: ${missing.join(" · ")} — 부르는 순간 undefined 다(번들러는 경고만 낸다)`
      ).toEqual([]);
    });
  }
});
