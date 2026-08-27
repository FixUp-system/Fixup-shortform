// **쓰는데 선언이 없는 상태**를 잡는다 (2026-08-27, 프로덕션 사고).
//
// 겪은 일 — 운영자 화면에서 [관리]를 누르면 화면이 통째로 죽었다("Application error:
// a client-side exception"). 원인은 `grantAmount`·`grantReason` 의 `useState` **두 줄이
// 없었던 것**이다: 모달 개편(dd223aa)에서 입력칸을 모달 안으로 옮기면서 값은 쓰는데
// 선언을 안 했고, 그대로 배포됐다.
//
// ★★ 왜 4,600 개의 판이 이것을 못 잡았나 — 이 저장소의 화면 계약은 **소스 문자열을 훑어**
//   잰다(tests/*-ui.test.js). 그 방식은 "그 글자가 파일에 있나"만 보므로 **선언이 없는
//   식별자**도, 깨진 문법도 못 본다(CLAUDE.md 의 "화면 파일을 손댔으면 한 번 굽는다"가
//   같은 구멍을 말한다 — 굽기는 문법은 잡지만 런타임 ReferenceError 는 못 잡는다).
//
// 그래서 아주 좁은 정적 검사를 하나 둔다: **`setXxx` 가 호출로만 등장하고 어디에도 묶인
// 적이 없으면** 그것은 선언되지 않은 이름이다. 실제 사고가 정확히 그 모양이었다.
//   · `const [x, setX] = useState(...)` → `setX` 가 호출 아닌 자리에 등장한다 ✅
//   · `const { setProject } = useReelProject()` → 마찬가지로 등장한다 ✅
//   · 선언 없이 `setGrantAmount(...)` 만 있다 → 전부 호출이다 ❌
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// app 아래의 화면·컴포넌트를 전부 훑는다(라우트도 포함 — 해로울 것이 없다).
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = [...walk("app"), ...walk("components")];

// 주석만 뺀다 — 주석에 적힌 setXxx 가 단정을 흔들면 안 된다.
//
// ★ 문자열까지 벗기려다 한 번 틀렸다(2026-08-27): 정규식 리터럴 안의 따옴표가 짝을
//   흐트러뜨려 파일 한 뭉치가 통째로 지워졌고, **선언이 있는 이름이 없다고 잡혔다.**
//   여기서 필요한 것은 "이 이름이 어딘가에 묶여 있나"뿐이라 주석만 벗겨도 충분하다.
// ★★ **블록 주석은 안 벗긴다**(2026-08-27 실측). `/\*[\s\S]*?\*\//` 로 벗기려 했더니
//   파일 안의 다른 `/*`·`*/` 짝과 엮여 **선언이 있는 줄까지 통째로 지워졌다** —
//   app/ads/[id]/page.js 의 `const [editing, setEditing] = useState(false)` 가 그렇게
//   사라져 "선언이 없다"고 잡혔다. 줄 주석만 벗기면 한 줄 넘게 먹을 길이 없다.
// ★ 블록 주석이 어떤 이름을 호출 아닌 모양으로 적어 두면 그 이름은 이 판을 그냥 통과한다 —
//   그물이 조금 성겨지는 대신 **거짓 경보가 없다**. 거짓 경보가 나는 판은 곧 무시된다.
function code(src) {
  return src.replace(/^\s*\/\/.*$/gm, " ");
}

// 표준 API·DOM 메서드는 우리 상태가 아니다. 이름만 같을 뿐이라 목록으로 뺀다.
// ★ 점(.) 뒤에 오는 것도 메서드다 — `el.setAttribute(…)` 처럼.
const BUILTIN = new Set([
  "setTimeout", "setInterval", "setImmediate",
  "setHours", "setMinutes", "setSeconds", "setMilliseconds", "setDate", "setMonth", "setFullYear", "setTime",
  "setAttribute", "setItem", "setProperty", "setCustomValidity", "setSelectionRange", "setRequestHeader",
  "setHeader", "setPointerCapture", "setData", "setStart", "setEnd", "setState",
]);

describe("쓰는 상태는 반드시 선언돼 있다", () => {
  for (const file of FILES) {
    const src = code(readFileSync(file, "utf8"));
    // 이 파일에 등장하는 setter 이름들
    const names = new Set([...src.matchAll(/\bset[A-Z][A-Za-z0-9_]*/g)].map((m) => m[0]));
    if (!names.size) continue;

    it(`${file} — setter 가 전부 선언돼 있다`, () => {
      const undeclared = [];
      for (const name of names) {
        if (BUILTIN.has(name)) continue;
        // 묶인 자리가 하나라도 있으면 선언된 것이다. 두 모양을 본다:
        //   ① 호출이 아닌 등장 — `const [x, setX] = …` · `const { setX } = …` · `setX =`
        //   ② 함수 선언 — `function setX(` 는 이름 뒤가 `(` 라 ①에 안 걸린다
        const bound =
          new RegExp(`\\b${name}\\b(?!\\s*\\()`).test(src) ||
          new RegExp(`function\\s+${name}\\s*\\(`).test(src);
        if (!bound) undeclared.push(name);
      }
      expect(
        undeclared,
        `선언 없이 부르기만 한다: ${undeclared.join(" · ")} — 누르는 순간 ReferenceError 로 화면이 죽는다`
      ).toEqual([]);
    });
  }
});
