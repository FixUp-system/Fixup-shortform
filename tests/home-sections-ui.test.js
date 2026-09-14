// home 은 **제품 도해로 여는 밝은 랜딩**이다(2026-09-14 사장님이 시안 둘 중 골랐다). 이력:
//   · 08-28 "만드는 방식을 고르는" 도해 두 장
//   · 09-08 결과물로 여는 밝은 화면
//   · 09-09 아침 손님에게 열고 결과물을 맨 위로
//   · 09-09 저녁 어두운 무대 + 히어로 자리 + 비율 섞인 벽
//   · 09-09 밤 덮개가 화면을 가득 채우고 껍데기가 그 위에 얹힌다
//   · 09-14 **제품 도해**(입력 → 두 갈래 → 같은 영상) + 밝은 벌  ← 지금
//
// ★★★ 09-14 에 **덮개가 사라졌다.** 그래서 이 파일에서 덮개를 지키던 단정 셋이 바뀌었다 —
//   자세한 뒤집힘(머리글·걸음 띠·밝은 벌)은 tests/landing-hero.test.js 가 적는다.
//
// ★★★ 이 회차에 고친 것은 색이 아니라 **틀**이다. 색 토큰은 프로토타입과 이미 같았는데
//   (#000000 · #F7F7F7 · #C8C8C8 · #0D0D0F · #1C1C20 · 버튼 #B0446A) 화면이 딴판이었다 —
//   프로토타입은 **검은 화면 전체**였고 프로덕션은 **밝은 앱 틀 안에 뜬 검은 카드**였다.
//   사이드바와 띠가 랜딩을 액자에 넣고 있었다. 그래서 랜딩에서는 그 둘을 걷고, 브랜드와
//   신원 영역을 **덮개 위로** 올린다.
//
// ★★ 경계는 그대로다: **랜딩만 어둡고 작업 화면은 밝은 벌**이다.
//   그 경계는 tests/design-system.test.js 가 선택자로 잰다 — 어두운 토큰은 `.home` 아래에서만.
//
// 이 저장소의 화면 계약은 소스 문자열로 잰다 — 렌더 테스트 인프라가 없다.
// ★★ 그래서 단정은 **이름이 적혀 있는가**가 아니라 **코드가 그렇게 생겼는가**를 잰다.
//   이름만 재면 바로 위 주석 한 줄로도 통과한다(2026-09-08 변이 검증에서 실제로 겪었다).
//
// ★ 화면이 세 파일이다. 껍데기(app/home/page.js)와 덮개·벽(components/HomeMade.jsx)이
//   **둘 다 서버 컴포넌트**이고(2026-09-10 — 표지를 구워 넣으며 클라이언트를 걷었다),
//   틀을 걷는 판단은 components/AppShell.jsx 가 한다.
import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";

const src = readFileSync("app/home/page.js", "utf8");
const made = readFileSync("components/HomeMade.jsx", "utf8");
const shell = readFileSync("components/AppShell.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("home — 제품 도해로 여는 랜딩", () => {
  it("★ 굽힌 목록에서 그린다 — 부르지 않는다", () => {
    // ★ 이 판은 원래 "목록을 부르는가"였다. 2026-09-10 에 **부르지 않는 것이 계약**이 됐다
    //   (표지를 파일로 구워 넣었다 — 이유는 tests/showcase-static.test.js 머리말).
    //   지우지 않고 뒤집는다 — 다음 사람이 "왜 안 부르지"를 여기서 알 수 있어야 한다.
    expect(made, "굽힌 목록을 안 읽는다").toMatch(/SHOWCASE/);
    expect(made, "다시 목록을 부른다").not.toMatch(/fetch\(/);
  });

  it("★★★ 어디에도 영상 태그가 없다 — 벽도, 덮개도", () => {
    // 2026-09-07 전송량 사고: 목록이 그 태그를 물면 화면을 여는 것만으로 할당량이 탄다.
    // ★ 덮개는 화면을 가득 채우므로 더더욱 물면 안 된다 — 손님이 오는 첫 화면이라
    //   방문 수만큼 그대로 바이트가 나간다. 재생은 누른 뒤 상세에서.
    // ★ 이 단정만 **날 것 그대로** 잰다(주석까지 센다) — 그 태그 이름이 소스에 적혀 있다는
    //   것 자체가 돌아오는 길목이라, 두 파일의 주석은 "영상 태그"라고만 쓰고 꺾쇠를 안 붙인다.
    expect(src, "<video> 가 껍데기에 있다").not.toMatch(/<video/);
    expect(made, "<video> 가 덮개·벽에 있다").not.toMatch(/<video/);
  });

  it("★★ 표지는 여전히 작다 — 굽는 자리가 바뀌었을 뿐 이유는 그대로다", async () => {
    // 원래는 `?t=1`(thumbUrl)로 작은 판을 받았다. 지금은 **굽는 스크립트가** 작은 판을 받아
    // 파일로 떨어뜨리므로 화면에는 그 흔적이 없다. 그래도 지켜야 할 것은 같다 — 손님이
    // 처음 보는 화면이라 한 장이 커지면 방문 수만큼 곱해진다(2026-09-07 사고의 교훈).
    // ★ 그래서 이름이 아니라 **실제 파일 크기**를 잰다.
    const { SHOWCASE } = await import("../lib/showcase.js");
    expect(SHOWCASE.length, "굽힌 표지가 없다").toBeGreaterThan(0);
    for (const t of SHOWCASE) {
      const kb = statSync("public/showcase/" + t.file).size / 1024;
      expect(kb, t.file + " 이 크다 — 표지는 카드 크기면 된다").toBeLessThan(120);
    }
    expect(made, "굽힌 자리에서 안 읽는다").toMatch(/\/showcase\//);
  });

  it("★★ 껍데기가 **화면 맨 위에 따라다닌다** — 덮개 위에 얹혀 있던 자리에서 내려왔다", () => {
    // 09-14 전에는 껍데기가 덮개(꽉 찬 사진) **안에** 꽂혀 있어서, 화면이 신원을 읽어
    // 만든 것을 부품에 prop 으로 건넸다. 덮개가 사라져 그 배달도 사라졌다 —
    // 이제 화면이 자기 자리에 직접 그린다.
    expect(src, "껍데기가 없다").toMatch(/className="stage-nav"/);
    expect(src, "벽 부품에 아직 껍데기를 건넨다").not.toMatch(/<HomeMade[^>]*\bnav=\{/);
    expect(made, "벽 부품이 아직 껍데기를 받는다").not.toMatch(/function HomeMade\(\s*\{[^}]*\bnav\b/);
    const navRule = css.slice(css.indexOf(".home .stage-nav {"));
    expect(navRule.slice(0, navRule.indexOf("}")), "껍데기가 따라다니지 않는다")
      .toMatch(/position:\s*sticky/);
  });

  it("★★ 표지가 없으면 **벽만** 사라진다 — 화면은 그대로 선다", () => {
    // 껍데기(브랜드·신원·주 버튼)가 화면으로 올라온 뒤라 부품이 통째로 null 이어도
    // 안전하다. 굽힌 표지가 0장인 저장소에서 받아 가도 랜딩은 서야 한다.
    expect(made, "빈 목록에서 벽이 안 빠진다").toMatch(/WALL\.length\s*===\s*0/);
    expect(src, "화면이 표지 없이도 서는지 알 수 없다 — 도해의 결과를 조건부로 안 건다")
      .toMatch(/\{OUT\s*&&/);
  });

  // ★★ 2026-09-14 — "머리글을 걷었다" 판을 **지웠다.** 09-09 저녁 지시("상단 문구 다 제거")가
  //   시안 검토에서 뒤집혔다 — 첫 화면이 사진 한 장이면 무엇을 만들어 주는 곳인지가 안 보인다.
  //   머리글이 **있어야 한다**는 새 계약은 tests/landing-hero.test.js 가 못 박는다.
  //   ★ 옛 문구(“소재만 적으면…”)가 돌아오면 안 되는 것은 그대로다 — 그 자리도 그쪽에 없다.

  it("★★ 주 버튼은 '시작하기'이고 문이 신원에 따라 갈린다", () => {
    // ★★ 이름만 세면 안 된다 — 버튼 글자의 삼항과 다른 주소가 대신 통과시킨다
    //   (2026-09-09 변이 검증에서 실제로 겪었다). 문 자체를 한 덩어리로 잰다.
    // ★ 2026-09-14 — 손님 쪽 문에 **돌아올 자리**가 실렸다(`?next=/ads/new`).
    //   로그인만 시켜 놓고 첫 화면으로 되돌리던 것을 고친 자리다(tests/login-next.test.js).
    expect(src, "주 버튼의 문이 신원을 안 본다").toMatch(
      /href=\{signedIn\s*\?\s*"\/ads\/new"\s*:\s*"\/login\?next=\/ads\/new"\}/
    );
    expect(src, "주 버튼이 없다").toMatch(/<[a-zA-Z][\w-]*\s[^>]*className="cta"/);
    // 사장님 지시: "무료로 시작하기를 시작하기 버튼으로".
    expect(src, "'무료로' 가 남아 있다").not.toMatch(/무료로 시작하기/);
    expect(src, "'시작하기' 가 없다").toMatch(/시작하기/);
  });

  it("★ 브랜드와 신원 영역이 그 껍데기 안에 있다", () => {
    // 사장님 지시: "shortform 이랑 로그인영역은 그 위에 배치".
    // 신원 영역은 UserMenu 하나가 손님(로그인 문)과 들어온 사람(메뉴)을 다 그린다 —
    // 여기서 갈래를 또 만들면 판정이 두 벌이 된다.
    expect(src, "브랜드 글자가 껍데기에 없다").toMatch(/className="stage-brand"[\s\S]{0,120}shortform/);
    // ★ 2026-09-14 — 서버가 아는 신원을 **넘긴다**(첫 그림 깜빡임 제거).
    //   판정이 두 벌이 된 것이 아니다 — `/api/me` 가 답하기 전까지만 쓰는 첫 값이다.
    expect(src, "신원 영역을 안 얹었다").toMatch(/<UserMenu\s+initialGuest=\{!signedIn\}\s*\/>/);
  });

  it("★★★ 랜딩에서는 앱 틀(사이드바·띠)을 걷는다", () => {
    // 이것이 이 회차의 뿌리다 — 틀이 랜딩을 액자에 넣고 있었다.
    // ★ `isBarePath` 에 섞지 않는다. 그 목록은 **로그인 경계**와 짝지어 읽히는 이름이라
    //   랜딩을 거기 넣으면 다음 사람이 "그럼 공개 경로인가"로 읽는다(lib/auth/paths.js 주석).
    expect(shell, "랜딩 갈래가 없다").toMatch(/isLandingPath\(/);
    expect(shell, "랜딩에서 통짜 틀을 안 쓴다").toMatch(/work--flush/);
    // 랜딩 갈래가 사이드바보다 **먼저** 와야 한다 — 뒤에 두면 영영 안 닿는다.
    const landingAt = shell.indexOf("isLandingPath(");
    const sidebarAt = shell.indexOf("<Sidebar");
    expect(landingAt, "랜딩 갈래가 사이드바 뒤에 있다").toBeLessThan(sidebarAt);
  });

  it("★★ 카드에 글을 안 싣는다 — 저장된 이름이 프롬프트 원문이다", () => {
    // 2026-09-09 프로덕션 실측: 완성본 여섯 편 중 셋의 이름이 영어 지문 원문이었다.
    // 손님이 보는 첫 화면이라 그 글자가 서비스의 얼굴이 된다.
    // ★ 이 파일의 주석에서도 그 낱말을 영어로 적지 않는다(아래 단정이 날 것으로 잰다).
    expect(made, "저장된 이름을 카드에 싣는다").not.toMatch(/\btitle\b/);
  });

  it("★★ 깨진 칸이 **원리적으로** 없다 — 화면에서 지우는 것이 아니라 애초에 안 굽는다", () => {
    // ★ 이 판은 원래 "onError 로 스스로 빠지는가"였다. 2026-09-10 에 **필요 없어졌다**:
    //   굽는 스크립트가 실제로 200 으로 받아지는 것만 남기기 때문이다
    //   (scripts/showcase-refresh.mjs · 09-10 실측: 후보 22편 중 **다섯**만 살아 있었다).
    //   화면이 404 를 맞고 나서 지우는 것과, 애초에 안 거는 것은 다르다 —
    //   앞엣것은 그 404 하나하나가 3.34초짜리 느린 요청이었다.
    // ★★ 그래서 여기서는 **굽힌 것이 실제로 다 있는지**를 잰다. 목록과 파일이 갈리면
    //   그 순간 깨진 칸이 생기고, 그것이 이 방식의 유일한 실패 모양이다.
    const { existsSync } = require("node:fs");
    const list = readFileSync("lib/showcase.js", "utf8");
    const files = [...list.matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(files.length, "굽힌 목록이 비어 있다").toBeGreaterThan(0);
    for (const f of files) {
      expect(existsSync("public/showcase/" + f), f + " 이 목록에만 있고 파일이 없다").toBe(true);
    }
  });

  it("★★ 벽은 한 선에서 잘리고 그 위에 더 보러가기가 선다", () => {
    // 비율이 제각각이라 자유 배치의 바닥이 들쭉날쭉하다 — 잘라야 곧은 선이 된다.
    // 그리고 그 문이 08-27 지시("기본으로 보관함 바로 확인")를 잇는다.
    expect(made, "자르는 자리가 없다").toMatch(/className="stage-cut"/);
    expect(made, "더 보러가기가 보관함으로 안 간다").toMatch(
      /href="\/archive"[^>]*className="stage-more"|className="stage-more"[^>]*href="\/archive"/
    );
  });

  // ★★ 2026-09-10 — "만드는 법은 세 걸음이다" 판을 **지웠다.** 사장님 지시로 그 절
  //   (소재·시나리오·영상 생성)을 화면에서 걷었기 때문이다. 걸음 수를 세던 판이라
  //   절이 없으면 셀 것도 없다 — 없어진 것을 지키는 판을 남기면 다음 사람이 되살리려 든다.
  //   ★ 그 절이 없다는 것 자체는 tests/landing-hero.test.js 가 못 박는다.
});
