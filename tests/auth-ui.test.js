// 화면 배선을 소스에서 판정한다(staleness-ui·credits-ui 와 같은 패턴).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const login = strip(readFileSync("app/login/page.js", "utf8"));

describe("로그인 화면", () => {
  it("매직링크를 더 이상 부르지 않는다", () => {
    expect(login).not.toMatch(/signInWithOtp/);
    expect(login).not.toMatch(/auth\/callback/);
  });
  it("두 라우트를 부른다", () => {
    expect(login).toMatch(/\/api\/auth\/login/);
    expect(login).toMatch(/\/api\/auth\/signup/);
  });
  it("비밀번호 입력이 있다", () => {
    expect(login).toMatch(/type="password"/);
  });
  it("가입 탭이 승인 대기를 미리 알린다", () => {
    expect(login).toMatch(/승인/);
  });
  it("비밀번호를 화면 상태 밖으로 흘리지 않는다 — 링크·쿼리에 싣지 않는다", () => {
    expect(login).not.toMatch(/password=\$\{/);
  });
});

// 시각 규칙은 실측에서 왔다(2026-08-06 네이버·구글). 값이 흔들리면 근거가 사라지므로
// 숫자를 그대로 못 박는다 — 바꾸려면 스펙과 이 테스트를 함께 고쳐야 한다.
const css = readFileSync("app/globals.css", "utf8");
const shell = strip(readFileSync("components/AppShell.jsx", "utf8"));

describe("로그인 화면 시각", () => {
  it("로그인 전용 클래스가 CSS 에 있다", () => {
    for (const cls of [".login-card", ".login-tabs", ".login-tab", ".sent-input--lg", ".cta--block", ".login-help"]) {
      expect(css).toContain(cls);
    }
  });

  // 단정은 전부 규칙 범위(`\{[^}]*`)로 가둔다. 예전 방식(css.slice(indexOf(...)))은
  // 그 클래스가 처음 나온 곳부터 **파일 끝까지**를 봐서, 규칙에서 값을 지워도
  // 파일 아래 아무 규칙에 같은 선언이 있으면 초록으로 남았다.
  it("입력칸이 실측값(52px)만큼 크다", () => {
    expect(css).toMatch(/\.sent-input--lg \{[^}]*min-height:\s*52px/);
  });

  it("주버튼이 실측값(48px)이고 폭을 채운다", () => {
    expect(css).toMatch(/\.cta--block \{[^}]*width:\s*100%/);
    expect(css).toMatch(/\.cta--block \{[^}]*min-height:\s*48px/);
  });

  it("상자가 420px 로 좁다", () => {
    expect(css).toMatch(/\.login-card \{[^}]*max-width:\s*420px/);
  });

  // 제목·부제가 카드와 같은 기둥에 서지 않으면 한 화면에 정렬 축이 둘이 된다
  // (1280 실측: 제목 x≈28 vs 카드 x≈368 — 340px 차이).
  it("제목·부제가 카드와 같은 폭의 기둥에 선다", () => {
    expect(css).toMatch(/\.login-head \{[^}]*max-width:\s*420px/);
    expect(css).toMatch(/\.login-head \{[^}]*margin-inline:\s*auto/);
    // h1 은 전역 `h1.pgtitle`(구체성이 한 단 높다)의 margin 단축 속성에 져서 폭만 걸리고
    // 가운데로는 안 갔다(실측 x 88 vs 카드 430). 이 한 줄이 그 자리를 붙잡는다.
    expect(css).toMatch(/h1\.login-head \{[^}]*margin-inline:\s*auto/);
    expect(login).toMatch(/pgtitle login-head/);
    expect(login).toMatch(/pgsub login-head/);
  });

  // 공유 규칙을 키워서 푼 것이 아니어야 한다 — .pgtitle·.pgsub 는 다른 화면 전부가 쓴다.
  it("전역 제목 규칙에 폭을 심지 않았다", () => {
    const t = css.match(/h1\.pgtitle \{[^}]*\}/);
    const s = css.match(/\n\.pgsub \{[^}]*\}/);
    expect(t).toBeTruthy();
    expect(s).toBeTruthy();
    expect(t[0]).not.toMatch(/max-width|margin-inline/);
    expect(s[0]).not.toMatch(/max-width|margin-inline/);
  });

  // 카드가 화면이 아니라 1160 기둥 기준으로 가운데면 넓은 화면일수록 왼쪽으로 쏠린다.
  // 사이드바 없는 화면에서만 기둥을 가운데로 옮긴다(수식자라 다른 화면에 안 샌다).
  it("사이드바 없는 화면은 기둥 자체가 화면 가운데다", () => {
    expect(css).toMatch(/\.work--bare \{[^}]*margin-inline:\s*auto/);
    expect(shell).toMatch(/className="work work--bare"/);
    // 사이드바가 있는 쪽은 그대로여야 한다.
    expect(shell).toMatch(/<main className="work">/);
  });

  it("칸 사이 16px · 버튼 앞 28px 도 실측에서 온 값이다", () => {
    expect(css).toMatch(
      /\.login-card \.sent-input--lg \+ \.sent-input--lg \{[^}]*margin-top:\s*16px/
    );
    expect(css).toMatch(/\.cta--block \{[^}]*margin-top:\s*28px/);
  });

  // 안내 줄은 카드 **밖** 형제라 폭을 물려받지 않는다. 두 값이 갈라지면 안내가
  // 카드보다 넓게 접혀 카드에서 떨어져 보인다(1280 실측: 안 두면 상자 1104px).
  it("보조 안내가 카드와 같은 폭에서 접힌다", () => {
    expect(css).toMatch(/\.login-help \{[^}]*max-width:\s*420px/);
  });

  // 제출 중에는 탭도 잠기는데 cursor 만으로는 화면에 아무 변화가 없다(실측 확인).
  it("제출 중 탭이 잠긴 것이 눈에 보인다", () => {
    expect(css).toMatch(/\.login-tab:disabled \{[^}]*opacity:\s*0\.4/);
  });

  // min-height 는 바닥값이라, 내용이 더 크면 조용히 아무 일도 안 한다.
  // 글자 상자 계산이 어긋나면 CSS 문자열은 52·48 인데 화면 픽셀은 58·50 이 된다 —
  // 아래 값들이 그 계산을 붙잡는 자리다(box-sizing: border-box 기준).
  // 둘 다 line-height 를 제 자리에서 못 박는다: 물려받으면 body 의 1.6 이 바뀌는 순간
  // min-height 가 무력해지는데, 그때도 이 테스트는 초록이라 아무도 모른다.
  it("실측 높이가 실제로 걸리도록 글자 상자를 계산해 뒀다", () => {
    // 입력칸: 16 × 1.2 = 19.2 + 패딩 24 + 테두리 2 = 45.2 < 52
    expect(css).toMatch(/\.sent-input--lg \{[^}]*padding:\s*12px 14px/);
    expect(css).toMatch(/\.sent-input--lg \{[^}]*line-height:\s*1\.2/);
    // 주버튼: 16 × 1.2 = 19.2 + .cta 패딩 24 = 43.2 < 48
    expect(css).toMatch(/\.cta--block \{[^}]*line-height:\s*1\.2/);
    // ★ 2026-08-18 — 버튼이 **위아래 여백이 아니라 사다리 높이**로 선다(--ctl-md).
    //   그래서 감시할 값도 패딩이 아니라 높이다: 로그인 버튼은 min-height:48 로 사다리보다
    //   크게 서는데, 사다리가 48 을 넘으면 그 min-height 가 조용히 무력해진다.
    //   이 줄이 그때 빨개져 로그인 계산을 다시 보게 만든다.
    expect(css).toMatch(/\.cta \{[^}]*height:\s*var\(--ctl-md\)/);
    expect(css).toMatch(/--ctl-md:\s*40px/);
  });

  it("기존 .sent-input 기본형을 키우지 않았다 — 브리핑·StylePicker 가 쓴다", () => {
    const base = css.match(/\n\.sent-input \{[^}]*\}/);
    expect(base).toBeTruthy();
    expect(base[0]).not.toMatch(/min-height/);
  });

  it("화면이 로그인 전용 클래스를 쓴다", () => {
    expect(login).toMatch(/login-card/);
    expect(login).toMatch(/login-tabs/);
    expect(login).toMatch(/sent-input--lg/);
    expect(login).toMatch(/cta--block/);
  });

  // /login-tab.*\bon\b/s 로는 헐겁다 — dotall 이라 `login-tabs` 하나만 있어도 앞이 맞고
  // `on` 은 파일 어디서든(onClick·onChange) 걸린다. 선택 상태가 **탭 버튼 className 안에서**
  // 붙는지를 물도록 같은 템플릿 리터럴 안으로 범위를 가둔다.
  it("탭 선택 상태를 클래스로 드러낸다", () => {
    expect(login).toMatch(/login-tab\$\{[^`]*" on"/);
  });

  // 두 단정이 서로 다른 것을 막는다: 문구가 사라지는 것(/운영자/)과
  // 안내 줄 자체가 사라지는 것(/login-help/). /운영자/ 는 가입 탭 문구에도 있어
  // 혼자서는 이 <p> 가 지워져도 초록이다.
  it("비밀번호를 잊었을 때 어디로 갈지 알려 준다", () => {
    expect(login).toMatch(/운영자/);
    expect(login).toMatch(/login-help/);
  });

  it("실패 문구는 여전히 서버가 준 것을 그대로 쓴다", () => {
    expect(login).toMatch(/data\.error/);
  });
});
