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

// ★★★ 2026-09-10 — 가입 뒤에 무엇이 남았는지 세 걸음으로 보여 준다(형제 제품 MCS 의
//   온보딩을 **우리 흐름으로** 옮긴 것). 그쪽 가운데 칸은 "이메일 인증"인데 우리는
//   **운영자 승인**이다 — 우리는 메일을 안 쓰고(매직링크 2026-08-06 폐지), 가입 라우트는
//   이메일 인증이 켜져 있으면 그것을 **설정 오류로 보고 500** 을 낸다.
describe("가입 절차 세 걸음", () => {
  // ⚠️ 이 파일의 `login` 은 **주석까지 든 날 것**이다(위 "옛 이름" 판이 주석도 봐야 해서).
  //   아래 "없어야 한다" 판들은 주석의 낱말에 걸린다 — 실제로 이 절을 쓰면서 밟았다.
  //   그래서 여기서만 주석을 걷은 사본을 쓴다(auth-ui.test.js 와 같은 방식).
  const body = login.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("★★★ 세 걸음이 있고, 가운데는 **운영자 승인**이다", () => {
    expect(body, "절차 목록이 없다").toMatch(/login-steps/);
    for (const w of ["가입 신청", "운영자 승인", "이용 시작"]) {
      expect(body, `"${w}" 걸음이 없다`).toContain(w);
    }
    // 그쪽 문구를 그대로 옮기면 우리 제품에서 거짓말이 된다.
    expect(body, "이메일 인증을 절차로 적었다 — 우리는 그것을 설정 오류로 본다")
      .not.toMatch(/이메일 인증/);
  });

  it("★★★ 강조는 **지금 선 걸음 하나**다 — 탭에 따라 자리가 옮겨간다", () => {
    // 로그인 탭이면 마지막 걸음, 가입 탭이면 첫 걸음.
    expect(body, "현재 걸음을 탭에서 끌어오지 않는다").toMatch(/isSignup\s*\?\s*0\s*:\s*2/);
    expect(body, "현재 걸음에 클래스를 안 준다").toMatch(/login-step\$\{\s*here\s*\?/);
  });

  it("★★ 지난 걸음에 **완료 표시를 달지 않는다** — 승인을 받았는지 이 화면은 모른다", () => {
    expect(body, "완료 표시가 있다").not.toMatch(/done|✓/i);
  });

  it("★★★ 액센트를 빌려 쓰지 않는다 — 그 색은 사이드바 스테퍼의 것이다", () => {
    const at = css.indexOf(".login-step.on");
    expect(at, ".login-step.on 규칙이 없다").toBeGreaterThan(-1);
    const block = css.slice(at, at + 300);
    expect(block, "로그인 절차가 액센트를 쓴다").not.toMatch(/var\(--accent/);
    expect(block, "지금 걸음이 먹색으로 안 채워진다").toMatch(/background:\s*var\(--ink\)/);
  });

  it("★★ 번호가 원문자가 아니다 — 판이 원문자를 막는다", () => {
    expect(body, "원문자를 썼다").not.toMatch(/[①②③④⑤⑥⑦⑧⑨]/);
    expect(body, "번호를 안 그린다").toMatch(/login-step-no/);
  });
});

describe("사이드바 — 준비 중 항목", () => {
  it("설정은 두지 않는다 — 누를 수 없는 줄이다", () => {
    expect(sidebar).not.toMatch(/설정/);
  });
});
