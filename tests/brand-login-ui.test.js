// 이름과 로그인 화면의 자리 (2026-08-13 사용자 요청).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const login = readFileSync("app/login/page.js", "utf8");
const layout = readFileSync("app/layout.js", "utf8");
const sidebar = readFileSync("components/Sidebar.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("이름은 shortform 이다", () => {
  // 눈에 보이는 자리 셋 — 로고·탭 제목·로그인 화면. 안쪽 이름(SHOTFORM_* env·
  // 폴더·패키지명)은 그대로 둔다: 그것들은 브랜드가 아니라 코드의 식별자다.
  it("보이는 자리에 옛 이름이 없다", () => {
    for (const [name, src] of [["로그인", login], ["레이아웃", layout], ["사이드바", sidebar]]) {
      // SHOTFORM_ 로 시작하는 env 이름은 코드의 식별자라 건드리지 않는다
      const visible = src.replace(/SHOTFORM_[A-Z_]+/g, "");
      expect(visible, `${name} 에 옛 이름이 남아 있다`).not.toMatch(/shotform/i);
    }
  });

  it("세 자리 다 새 이름을 쓴다", () => {
    expect(login).toMatch(/shortform/);
    expect(layout).toMatch(/shortform/);
    expect(sidebar).toMatch(/shortform/);
  });
});

describe("로그인 화면은 가운데 선다", () => {
  // 사이드바가 없는 화면(work--bare)이라 위쪽에 붙어 있었다 — 가로만 가운데였고
  // 세로는 화면 맨 위였다.
  it("세로 가운데로 세운다", () => {
    const at = css.indexOf(".work--bare {");
    expect(at, ".work--bare 규칙이 없다").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule, "세로 가운데 정렬이 없다").toMatch(/min-height|justify-content|place-content/);
  });
});

// ★★★ 2026-09-10 저녁 사장님 지시 둘, 한 자리에서 풀었다:
//   ① "shortform 부분을 고정 위치로 적용해줘"
//   ② "로그인 페이지에서 메인 페이지로 이동할 방법이 없어서 이 부분도 개선해줘"
//
// ①의 원인은 `.work--bare` 의 **세로 가운데 정렬**이었다. 카드가 한 줄이라도 길어지면
// (회원가입 탭의 이름 칸 · 오류 한 줄) 그 절반만큼 위쪽이 통째로 밀려 올라가, 탭을 누를
// 때마다 제목이 튀었다. 흐름에서 빼(`position: fixed`) 아래가 무엇으로 늘든 좌표를 고정한다.
describe("로그인 브랜드 — 화면에 고정되고, 메인으로 가는 문이다", () => {
  it("★★★ 브랜드가 흐름을 떠나 고정된다 — 아래가 늘어도 안 움직인다", () => {
    expect(login, "브랜드에 자기 클래스가 없다").toMatch(/className="login-brand"/);
    expect(css, ".login-brand 규칙이 없다").toMatch(/\.login-brand \{[^}]*position:\s*fixed/);
  });

  it("★★★ 브랜드를 누르면 메인으로 간다", () => {
    const at = login.indexOf('className="login-brand"');
    expect(at, "브랜드가 없다").toBeGreaterThan(-1);
    // 브랜드 덩어리 안에 링크가 있어야 한다 — 옆의 다른 <Link> 를 주워 담지 않게 좁게 자른다.
    const block = login.slice(at, at + 200);
    expect(block, "브랜드가 문이 아니다").toMatch(/href="\/home"/);
  });

  it("★★ 글자로 된 문도 함께 둔다 — 로고가 문인 것은 아는 사람만 안다", () => {
    const line = login.split("\n").find((l) => l.includes('href="/home"') && l.includes("mini")) || "";
    expect(line, "메인으로 가는 글자 문이 없다").toMatch(/메인/);
    // 옆의 보관함 문과 같은 모양이어야 한다(맨 <Link> 면 브라우저가 밑줄을 긋는다).
    expect(line, "버튼 모양(.mini)이 아니다").toMatch(/className="[^"]*\bmini\b/);
  });

  it("★★ 두 문이 붙지 않는다 — flex 안에서 JSX 공백은 사라진다", () => {
    // 2026-09-01 에 같은 성질로 "🗑정리" 가 붙어 나왔다. 사이는 gap 이 벌린다.
    expect(login, "문 두 개를 감싼 줄에 수식자가 없다").toMatch(/login-help login-help--doors/);
    expect(css, "gap 이 없어 두 문이 붙는다").toMatch(/\.login-help--doors \{[^}]*gap:/);
  });

  it("★ 낮은 화면에서는 고정을 푼다 — 안 그러면 넘친 카드와 겹친다", () => {
    expect(css, "낮은 화면 갈래가 없다").toMatch(
      /@media \(max-height:[^)]*\) \{[\s\S]{0,200}\.login-brand \{[^}]*position:\s*static/
    );
  });
});

describe("사이드바 — 준비 중 항목", () => {
  it("설정은 두지 않는다 — 누를 수 없는 줄이다", () => {
    expect(sidebar).not.toMatch(/설정/);
  });
});
