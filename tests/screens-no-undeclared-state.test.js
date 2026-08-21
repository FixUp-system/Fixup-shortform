// 화면이 **선언하지 않은 상태를 부르지 않는가** — 클릭하는 순간 죽는 부류를 통째로 막는다.
//
// ★★ 2026-08-21 하루에 이 부류가 **두 번** 났다:
//   · app/ads/[id]/page.js — setBusyStep 을 useAdProject 에서 안 꺼내고 불러서
//     `startRender` 가 fetch 앞에서 죽었다. **굽기가 시작조차 안 됐는데** 화면은
//     아무 말도 안 했다(콘솔에만 났다).
//   · app/admin/page.js — grantAmount·grantReason 의 useState 선언이 통째로 빠져
//     [관리]를 누르면 관리 화면이 안 열렸다(모달로 옮기며 쓰는 자리만 가져왔다).
//
// 이 저장소에는 린터도 타입체커도 없다(순수 JS). 그래서 **이런 것을 잡는 것도 테스트다.**
// 렌더링 하네스가 없으므로 소스를 읽어 "부르는데 선언이 없는 이름"을 찾는다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// 화면·컴포넌트 전부. 새 화면이 생겨도 자동으로 걸린다.
function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (/\.(jsx?|tsx?)$/.test(name) && !p.includes("api")) out.push(p);
  }
  return out;
}
const FILES = [...collect("app"), ...collect("components")];

// 이 파일 안에서 **이름이 만들어지는** 모든 자리를 모은다.
// ★ 넓게 잡는다 — 못 모은 이름이 있으면 **거짓 실패**가 나고, 그것이 이 시험을 죽인다.
//   놓치는 쪽(거짓 통과)이 잡아 주는 것이 없는 것보다 낫다.
function declaredNames(src) {
  const found = new Set();
  const add = (n) => n && found.add(n);
  // const/let/var/function/class 이름
  for (const m of src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  // 구조분해 — const { a, b: c } = ... / const [a, b] = ...
  for (const m of src.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]\s*=/g)) {
    for (const piece of m[1].split(",")) {
      const name = piece.split(":").pop().split("=")[0].replace(/[.\s]/g, "");
      add(name);
    }
  }
  // import 된 이름
  for (const m of src.matchAll(/import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
    add(m[1]);
    if (m[2]) for (const piece of m[2].split(",")) add(piece.split(" as ").pop().trim());
  }
  // 함수 인자·화살표 인자
  for (const m of src.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) {
    for (const piece of m[1].split(",")) {
      const name = piece.split(":").pop().split("=")[0].replace(/[.{}[\]\s]/g, "");
      if (/^[A-Za-z_$][\w$]*$/.test(name)) add(name);
    }
  }
  return found;
}

describe("화면이 선언하지 않은 상태 setter 를 부르지 않는다", () => {
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    // `setXxx(` 꼴만 본다 — 상태 setter 는 이 저장소에서 예외 없이 이 이름을 쓴다.
    // ★ 앞에 점이 있으면 **메서드 호출**이다(el.setAttribute · d.setHours ·
    //   localStorage.setItem). 그것까지 잡으면 거짓 실패가 나고, 거짓 실패가 나는
    //   시험은 곧 꺼진다 — 그러면 잡아 주는 것이 없어진다.
    const called = [...src.matchAll(/(?<![.\w$])(set[A-Z][\w$]*)\s*\(/g)].map((m) => m[1]);
    if (!called.length) continue;
    it(`${file}`, () => {
      const declared = declaredNames(src);
      // ★ 표준 전역은 뺀다(setTimeout·setInterval).
      const missing = [...new Set(called)].filter(
        (n) => !declared.has(n) && !["setTimeout", "setInterval", "setImmediate"].includes(n)
      );
      expect(missing, `부르는데 선언이 없다: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
