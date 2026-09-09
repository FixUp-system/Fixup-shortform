// home 은 **화면을 가득 채우는 어두운 무대**다(2026-09-09 저녁 사장님 확정). 이력:
//   · 08-28 "만드는 방식을 고르는" 도해 두 장
//   · 09-08 결과물로 여는 밝은 화면
//   · 09-09 아침 손님에게 열고 결과물을 맨 위로
//   · 09-09 저녁 어두운 무대 + 히어로 자리 + 비율 섞인 벽
//   · 09-09 밤 **덮개가 화면을 가득 채우고 껍데기가 그 위에 얹힌다**  ← 지금
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
// ★ 화면이 세 파일이다. 껍데기(app/home/page.js)는 서버 컴포넌트라 신원을 읽고,
//   목록을 무는 덮개·벽이 클라이언트 부품(components/HomeMade.jsx)이며,
//   틀을 걷는 판단은 components/AppShell.jsx 가 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/home/page.js", "utf8");
const made = readFileSync("components/HomeMade.jsx", "utf8");
const shell = readFileSync("components/AppShell.jsx", "utf8");

describe("home — 화면을 채우는 어두운 무대", () => {
  it("★ 최근 완성본을 불러온다", () => {
    expect(made, "목록을 안 부른다").toMatch(/fetch\(\s*["'`]\/api\/projects/);
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

  it("★ 표지 그림은 작은 판을 지난다", () => {
    expect(made, "표지 그림이 thumbUrl 을 안 지난다").toMatch(/src=\{thumbUrl\(/);
    expect(made, "thumbUrl 을 안 가져온다").toMatch(/import\s*\{[^}]*\bthumbUrl\b[^}]*\}\s*from/);
  });

  it("★★ 덮개가 화면을 채우고 그 위에 껍데기가 얹힌다", () => {
    // 프로토타입과 갈린 자리가 정확히 여기다(위 머리글 참고).
    expect(made, "덮개가 없다").toMatch(/className="stage-cover"/);
    expect(src, "덮개 위에 얹을 껍데기가 없다").toMatch(/className="stage-nav"/);
    // ★ 껍데기는 **덮개 안으로** 들어가야 한다 — 서버가 신원을 읽어 만들고
    //   클라이언트 부품이 덮개 안에 꽂는다. 그래서 prop 으로 건네고 거기서 받는다.
    expect(src, "껍데기를 덮개에 안 건넨다").toMatch(/<HomeMade[^>]*\bnav=\{/);
    expect(made, "덮개가 껍데기를 안 받는다").toMatch(/function HomeMade\(\s*\{[^}]*\bnav\b/);
  });

  it("★★ 덮개는 완성본이 없어도 그려진다 — 껍데기가 같이 사라지면 안 된다", () => {
    // 옛 코드는 목록이 비면 **부품 전체**가 null 이었다. 껍데기가 덮개 안으로 들어온
    // 지금 그대로 두면 브랜드와 로그인 문이 통째로 증발한다.
    // 그래서 감추는 것은 **벽**이고, 덮개는 늘 선다.
    expect(made, "완성본이 없으면 부품 전체가 사라진다").not.toMatch(
      /return\s*\(?\s*made\.length\s*>\s*0\s*&&/
    );
    expect(made, "벽을 조건부로 감추지 않는다").toMatch(
      /made\.length\s*>\s*0\s*&&\s*\(?\s*<div className="stage-band"/
    );
  });

  it("★★ 머리글을 걷었다 — 덮개가 말한다", () => {
    // 2026-09-09 저녁 사장님 지시: "상단에 소재만 적으면 부터 있는 문구 다 제거".
    // 큰 글자와 리드를 빼면 첫 화면에서 **결과물이 유일한 주인공**이 된다.
    expect(src, "전시층 제목이 남아 있다").not.toMatch(/className="display"/);
    expect(src, "리드 문장이 남아 있다").not.toMatch(/className="lede"/);
    expect(src, "옛 머리글 문구가 남아 있다").not.toMatch(/소재만 적으면|한 편이 나옵니다/);
  });

  it("★★ 주 버튼은 '시작하기'이고 문이 신원에 따라 갈린다", () => {
    // ★★ 이름만 세면 안 된다 — 버튼 글자의 삼항과 다른 주소가 대신 통과시킨다
    //   (2026-09-09 변이 검증에서 실제로 겪었다). 문 자체를 한 덩어리로 잰다.
    expect(src, "주 버튼의 문이 신원을 안 본다").toMatch(
      /href=\{signedIn\s*\?\s*"\/ads\/new"\s*:\s*"\/login"\}/
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
    expect(src, "신원 영역을 안 얹었다").toMatch(/<UserMenu\s*\/>/);
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

  it("★ 그림이 안 열리는 칸은 스스로 빠진다", () => {
    // 2026-09-09 실측: 표지 주소가 있는 25편 중 다섯만 실제로 열린다(09-07 파일 미이관).
    expect(made, "못 받은 그림을 그대로 둔다").toMatch(/onError=\{/);
  });

  it("★★ 벽은 한 선에서 잘리고 그 위에 더 보러가기가 선다", () => {
    // 비율이 제각각이라 자유 배치의 바닥이 들쭉날쭉하다 — 잘라야 곧은 선이 된다.
    // 그리고 그 문이 08-27 지시("기본으로 보관함 바로 확인")를 잇는다.
    expect(made, "자르는 자리가 없다").toMatch(/className="stage-cut"/);
    expect(made, "더 보러가기가 보관함으로 안 간다").toMatch(
      /href="\/archive"[^>]*className="stage-more"|className="stage-more"[^>]*href="\/archive"/
    );
  });

  it("★ 만드는 법은 세 걸음이다", () => {
    const ns = src.match(/n:\s*"\d\d"/g) || [];
    expect(ns.length, "걸음 수가 셋이 아니다").toBe(3);
  });
});
