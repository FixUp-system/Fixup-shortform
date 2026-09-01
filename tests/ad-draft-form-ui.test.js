// **글 쓰는 칸이 스타일을 못 받으면 브라우저 기본 상자가 뜬다** (2026-09-01 사장님 지적:
// "원클릭 영상 입력 단계에서 사용자가 입력하는 텍스트 폼 ui가 깨진다").
//
// ★★★ 실측(로컬 브라우저): 원클릭 상세의 ①입력 화면에서 자료 칸이 **좁은 기본 textarea**
//   로 떴다 — 테두리도 글자 크기도 여백도 앱의 것이 아니었다. 같은 자리인 /ads/new 는
//   멀쩡했다. 차이는 클래스 하나였다:
//     · /ads/new        → className="field composer-text"
//     · /ads/[id] ①입력 → className="composer-text"   ← **field 가 없다**
//   공용 규칙은 `textarea.field` 다(app/globals.css). `.composer-text` 는 높이만 얹는
//   보조 규칙이고 그나마 **`.composer` 상자 안에서만** 걸린다(`.composer textarea.composer-text`)
//   — 상세 화면에는 그 상자가 없으니 아무것도 안 걸렸다.
//
// ★★ 그래서 그물도 함께 친다 — 화면이 늘 때 이 실수가 조용히 반복되지 않게, 모든
//   textarea 가 globals.css 에 **이름이 있는** 클래스를 쥐고 있는지 본다(부모가 주는
//   경우도 인정한다). 그 그물이 어디까지 재는지는 아래 describe 머리말에 적어 두었다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync("app/globals.css", "utf8");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}
// `<textarea` 뒤 400 자 안의 첫 className="..." 를 그 칸의 클래스로 본다.
function textareaClasses(src) {
  const out = [];
  for (const m of src.matchAll(/<textarea/g)) {
    const chunk = src.slice(m.index, m.index + 400);
    const cls = chunk.match(/className="([^"]+)"/);
    out.push(cls ? cls[1].trim().split(/\s+/) : []);
  }
  return out;
}
// 바로 앞 300 자에서 감싸는 요소의 클래스들 — 부모가 `.wrap textarea { … }` 로 스타일을
// 주는 자리가 실제로 있다(components/QuickCreate.jsx 의 `.chat-input textarea`).
// 그것을 "스타일 없음"으로 세면 멀쩡한 칸을 잡는 거짓 경보가 된다.
function wrapperClasses(src, at) {
  const before = src.slice(Math.max(0, at - 300), at);
  return [...before.matchAll(/className="([^"]+)"/g)].flatMap((m) => m[1].trim().split(/\s+/));
}
const FILES = [...walk("app"), ...walk("components")].filter((f) => readFileSync(f, "utf8").includes("<textarea"));

describe("원클릭 ①입력 — 글 쓰는 칸", () => {
  const src = readFileSync("app/ads/[id]/page.js", "utf8");
  const cls = textareaClasses(src)[0] || [];

  it("★★★ 공용 규칙을 쓴다 — 없으면 브라우저 기본 상자가 뜬다", () => {
    expect(cls, `지금 클래스: ${cls.join(" ") || "(없음)"}`).toContain("field");
  });

  it("★ 첫 화면(/ads/new)과 **같은 모양**이다 — 같은 일을 하는 칸이 화면마다 다르면 안 된다", () => {
    const newCls = textareaClasses(readFileSync("app/ads/new/page.js", "utf8"))[0] || [];
    expect(cls.filter((c) => c === "field").length).toBe(newCls.filter((c) => c === "field").length);
  });
});

// ★ 이 그물이 재는 것은 **"CSS 에 그 이름이 아예 없다"** 까지다. `.composer textarea
//   .composer-text` 처럼 **부모 안에서만** 걸리는 규칙은 여기서 가려낼 수 없다 —
//   선택자가 존재하기는 하기 때문이다. 그 종류(이번 사고)는 위의 구체 판이 잡는다.
//   그물의 주장을 실제로 재는 것보다 넓게 적으면, 통과했다는 사실이 거짓 안심이 된다.
describe("그물 — 이름만 있고 CSS 가 없는 칸이 또 생기지 않게", () => {
  it("★★ 모든 textarea 가 globals.css 에 이름이 있는 클래스를 쥔다(또는 부모가 준다)", () => {
    const orphans = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      const spots = [...src.matchAll(/<textarea/g)].map((m) => m.index);
      const all = textareaClasses(src);
      all.forEach((cls, i) => {
        // ① 자기 클래스가 규칙을 갖는가 (`textarea.field { … }` · `.ref { … }`)
        // ⚠️ 역슬래시는 **두 겹**이어야 한다 — 템플릿 문자열이 한 겹을 먹는다.
        //   한 겹으로 적으면 `\w` 가 글자 `w` 가 되어 정규식이 조용히 딴것을 잰다
        //   (이 저장소의 CLAUDE.md 가 heredoc 에서 같은 함정을 적어 두었다).
        const own = cls.some((c) => new RegExp(`(^|[\\s,>])(textarea)?\\.${c}(?![\\w-])[^{]*\\{`, "m").test(css));
        // ② 아니면 감싸는 요소가 주는가 (`.chat-input textarea { … }`)
        const byParent = wrapperClasses(src, spots[i]).some((c) =>
          new RegExp(`\\.${c}(?![\\w-])\\s+textarea[^{]*\\{`, "m").test(css));
        if (!own && !byParent) orphans.push(`${f} — ${cls.join(" ") || "(className 없음)"}`);
      });
    }
    expect(orphans, `스타일을 못 받는 칸: ${orphans.join(" / ")}`).toEqual([]);
  });
});

describe("칩 안의 [관리자] 표시", () => {
  // ★★★ 실측: 해상도 칩이 **"1080p관리자"** 로 붙어서 떴다. `.soon-tag` 가
  //   `.side-item .soon-tag` 로만 정의돼 있어 사이드바 밖에서는 규칙이 0 이다 —
  //   여백도 테두리도 없이 글자가 그대로 이어 붙는다.
  it("★★★ 사이드바 밖(칩)에서도 규칙을 받는다", () => {
    const uses = readFileSync("components/AdOptionTray.jsx", "utf8").includes('className="soon-tag"');
    expect(uses, "AdOptionTray 가 soon-tag 를 안 쓴다 — 이 판이 낡았다").toBe(true);
    expect(css, "칩 안 soon-tag 에 규칙이 없다 — 글자가 붙어 버린다")
      .toMatch(/\.chip\s+\.soon-tag\s*\{/);
  });
});

// **밝은 테마를 고른 사람만 화면이 깨진다** (2026-09-01 실측, 로컬 브라우저).
//
// ★★★ 재현: 테마를 [밝게] 로 바꾼 뒤 아무 화면이나 새로고침하면 Next 개발 오버레이가
//   화면을 통째로 덮는다 —
//     "A tree hydrated but some attributes of the server rendered HTML didn't match…"
//     - data-theme="light"
//
// ★★ 원인은 **테마를 먼저 칠하는 그 스크립트 자체**다(app/layout.js 의 <head> 인라인).
//   번쩍임을 없애려면 리액트가 붙기 **전에** 칠해야 하고, 그러면 서버 HTML 에 없던
//   속성이 <html> 에 생긴다 — hydration 이 그것을 불일치로 본다. 스크립트를 없애면
//   번쩍임이 돌아오므로 **고칠 곳은 스크립트가 아니라 단정하는 쪽**이다.
//   리액트가 그 자리를 위해 둔 것이 `suppressHydrationWarning` 이다(문서가 테마 스크립트를
//   예로 든다). 범위는 그 요소의 **속성 한 겹**뿐이라 아래 트리 검사는 그대로 산다.
//
// ★ 개발에서는 오버레이가 덮고, 운영에서는 조용히 루트부터 다시 그린다 — 둘 다
//   "UI 가 깨진다" 로 보인다. 어두운 테마에서는 스크립트가 아무것도 안 찍어서 안 난다.
describe("테마를 먼저 칠하는 스크립트와 hydration", () => {
  const layout = readFileSync("app/layout.js", "utf8");

  it("★★★ <html> 이 속성 불일치를 삼킨다 — 없으면 밝은 테마에서 오버레이가 뜬다", () => {
    const at = layout.indexOf("<html");
    expect(at, "<html> 이 없다 — 이 판이 낡았다").toBeGreaterThan(-1);
    expect(layout.slice(at, at + 260), "suppressHydrationWarning 이 없다")
      .toMatch(/suppressHydrationWarning/);
  });

  it("★★ 먼저 칠하는 스크립트는 **그대로 있다** — 지우면 번쩍임이 돌아온다", () => {
    expect(layout).toMatch(/shortform-theme/);
    expect(layout).toMatch(/setAttribute\('data-theme','light'\)/);
  });
});

// **주소로 바로 들어오면 원클릭 ①입력 화면이 통째로 죽는다** (2026-09-01 로컬 실측).
//
// ★★★ 재현: `/ads/<id>?step=draft` 로 **새로 들어가거나 새로고침**하면
//     Runtime TypeError: Cannot destructure property 'format' of 'value' as it is null
//     components/AdOptionTray.jsx (32:11) ← app/ads/[id]/page.js (410:11)
//   화면 안에서 [입력] 을 눌러 들어갈 때는 안 난다 — 그때는 프로젝트가 이미 읽혀 있다.
//   즉 **처음 그리는 순간**의 문제라, 보관함에서 들어오는 길처럼 새로 뜨는 경로가 다 걸린다.
//
// ★★ 원인은 한 줄이다. `draftOpts` 는 `useState(null)` 로 시작하는데 트레이가 그 값을
//   **바로 구조분해**한다. 같은 파일의 다른 자리들은 이미 `!!draftOpts` 로 지키고 있었다
//   (dirty 판정·저장) — 그리는 자리만 안 지켰다.
//
// ★ 고치는 방향은 **기본값을 지어내지 않는 쪽**이다. `value || {}` 로 막으면 크래시는
//   사라지지만 아직 못 읽은 상태를 "아무것도 안 골랐음"으로 그린다 — 사장님이 틀린 값을
//   보고 그대로 저장할 수 있다. 값이 없으면 **아직 안 그린다.**
import AdOptionTray from "../components/AdOptionTray.jsx";

describe("원클릭 ①입력 — 옵션 트레이", () => {
  it("★★★ 트레이는 value 를 **요구한다** — 없으면 그릴 것이 없다", () => {
    expect(() => AdOptionTray({ value: null })).toThrow();
  });

  it("★★★ 그래서 호출부가 값이 있을 때만 그린다 — 없으면 첫 렌더에서 화면이 죽는다", () => {
    const src = readFileSync("app/ads/[id]/page.js", "utf8");
    const at = src.indexOf("<AdOptionTray");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, at - 200), at), "draftOpts 가드 없이 그린다")
      .toMatch(/draftOpts\s*&&/);
  });

  it("★★ 값을 지어내지 않는다 — `value || {}` 로 막으면 틀린 값을 보여 준다", () => {
    const tray = readFileSync("components/AdOptionTray.jsx", "utf8");
    expect(tray, "빈 객체로 기본값을 만들면 아직 못 읽은 상태가 '아무것도 안 골랐음'으로 보인다")
      .not.toMatch(/=\s*value\s*\|\|\s*\{\}/);
  });
});
