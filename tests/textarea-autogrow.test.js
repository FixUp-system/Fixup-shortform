// **여러 줄 입력칸은 글 길이만큼 자란다** (2026-09-03 사장님 지시 · 같은 날 두 번).
//
// ★★★ 뿌리 — 공용 규칙 `textarea.field` 가 `overflow-y: hidden` 을 건다. 그것은 칸이
//   **자라는 것을 전제한** 설정인데, 자라게 하는 배선이 빠진 칸은 글이 **스크롤바도 없이
//   잘린다.** 사장님 말: "방향키로는 올라가는데 드래그가 전체를 잡은 건지 보이는 데까지만
//   잡은 건지 모르겠다." 안 보이는 글이 있는데 그것을 알려 주는 표시가 하나도 없었다.
//
// ★★★ **첫 판이 이 증상을 못 막았다** — 그때는 화면 이름 셋을 손으로 적어 두고 그 셋만
//   쟀다(`app/create` · `app/ads/new` · `app/reel/new`). 목록에 없던 **아홉 자리**가 그대로
//   잘렸고(단계별 ①시나리오·②이미지·③프롬프트·⑤영상 · 원클릭 수정 · film 둘 · 보정 칸),
//   사장님이 같은 날 저녁에 다시 짚었다. **목록을 지키는 판은 목록에서 빠진 것을 못 본다.**
//
// ★ 그래서 이 판은 이름을 세지 않는다. **모양**을 잰다:
//   ① 자라는 계산은 훅 하나다(베끼면 새 자리가 또 빠진다)
//   ② `field` 를 단 칸은 전부 `AutoTextarea` 다 — raw `<textarea>` 로는 쓸 수 없다
//      (부르는 자리가 **잊을 수 없는 모양**이어야 세 번째 재발이 없다)
//   ③ 선택 하이라이트가 눈에 보인다(잘리지 않게 한 뒤에도 범위는 보여야 한다)
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// 소스 판 규율(OUTSTANDING §7-10): 줄 주석을 먼저 걷고 블록 주석을 걷는다.
const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const src = (p) => strip(readFileSync(p, "utf8"));

const ROOTS = ["app", "components"];
// 자라는 칸을 **소유한** 곳. 여기만 raw <textarea> 로 `field` 를 쓸 수 있다.
const OWNER = join("components", "AutoTextarea.jsx");
const HOOK = join("components", "useAutoGrow.js");

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(p)) out.push(p);
    }
  };
  for (const r of ROOTS) walk(r);
  return out;
}

// 여는 태그 안의 className 을 집는다. 태그 안에는 `(e) => …` 처럼 `>` 가 들어 있어
// "첫 `>` 까지"로 자르면 안 된다 — 넉넉히 뜬 뒤 **첫 className 문자열**만 본다.
function textareaClasses(text) {
  const out = [];
  let i = 0;
  for (;;) {
    const at = text.indexOf("<textarea", i);
    if (at < 0) break;
    const m = text.slice(at, at + 700).match(/className="([^"]*)"/);
    out.push(m ? m[1].split(/\s+/) : []);
    i = at + 9;
  }
  return out;
}

describe("이 판이 서 있는 전제", () => {
  it("★★ textarea.field 는 안에서 스크롤하지 않는다 — 자라는 것을 전제한 설정이다", () => {
    const rule = readFileSync("app/globals.css", "utf8").match(/textarea\.field\s*\{[^}]*\}/);
    expect(rule, "textarea.field 규칙이 없다").toBeTruthy();
    expect(rule[0]).toMatch(/overflow-y:\s*hidden/);
  });
});

describe("자라는 규칙은 훅 하나다", () => {
  it("★★ 훅이 있고, height 를 auto 로 되돌린 뒤 잰다 — 안 그러면 지워도 안 줄어든다", () => {
    const s = src(HOOK);
    expect(s).toMatch(/export function useAutoGrow/);
    expect(s).toMatch(/style\.height\s*=\s*"auto"/);
    expect(s).toMatch(/scrollHeight/);
  });

  // ★ 신호는 **높이를 직접 쓰는 것**이다. `scrollHeight` 만으로는 넓다 — 채팅을 맨 아래로
  //   붙이는 코드(`scrollTop = scrollHeight`)가 같은 낱말을 쓰는데 그것은 자라는 칸이 아니다.
  it("★★★ 그 계산을 손으로 다시 적은 자리가 **한 곳도** 없다", () => {
    const offenders = sourceFiles()
      .filter((p) => p !== HOOK)
      .filter((p) => /style\.height\s*=/.test(src(p)));
    expect(offenders).toEqual([]);
  });

  it("★★ AutoTextarea 가 스스로 훅을 건다 — 부르는 자리는 훅을 몰라도 된다", () => {
    expect(src(OWNER)).toMatch(/useAutoGrow\(/);
  });
});

describe("자라는 칸을 **잊을 수 없다**", () => {
  it("★★★ field 를 단 칸은 전부 AutoTextarea 다 — raw <textarea> 로 쓰지 않는다", () => {
    const offenders = [];
    for (const path of sourceFiles()) {
      if (path === OWNER) continue;
      for (const classes of textareaClasses(readFileSync(path, "utf8"))) {
        if (classes.includes("field")) offenders.push(`${path}: ${classes.join(" ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("선택 범위가 눈에 보인다", () => {
  const css = readFileSync("app/globals.css", "utf8");

  it("★★ ::selection 바탕색 규칙이 있다", () => {
    expect(css).toMatch(/::selection\s*\{[^}]*background:\s*var\(--sel\)/);
  });

  it("★★ --sel 이 **두 테마 모두** 정의돼 있다 — 한쪽만 있으면 다른 테마에서 안 보인다", () => {
    const hits = css.match(/--sel:\s*[^;]+;/g) || [];
    expect(hits.length, `--sel 정의가 ${hits.length}개다`).toBeGreaterThanOrEqual(2);
  });
});
