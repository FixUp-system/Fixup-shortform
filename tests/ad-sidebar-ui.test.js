// 사이드바 「광고 영상」 최상위 항목 + 하위 단계 표시 — 소스를 읽어 판정한다
// (tests/ad-ui.test.js · tests/staleness-ui.test.js 와 같은 방식. 이 저장소에는
// 렌더링 하네스가 없다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/Sidebar.jsx", "utf8");

// 주석을 걷어낸 본문 — 위치(순서·근접) 기반 단정은 이걸로 한다. 이 파일 자체가 주석에서
// "광고 영상"·"fetch" 같은 낱말을 설명용으로 쓰기 때문에, 걷어내지 않으면 실제 렌더
// 자리가 아니라 위쪽 설명 주석을 잘못 짚어 거짓으로 빨개진다(design-system.test.js의
// stripComments와 같은 방식).
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const clean = stripComments(src);

describe("사이드바 — 「광고 영상」 최상위 항목", () => {
  it("광고 영상이 홈·영상 만들기·보관함과 같은 side-item 형제로 있다", () => {
    // "광고 영상"이라는 낱말만으로는 증거가 안 된다(주석에도 나올 수 있다) — 실제로
    // side-item 클래스가 붙은 Link 안에 있는지까지 본다.
    const idx = clean.indexOf("광고 영상");
    expect(idx, "'광고 영상' 문구가 없다").toBeGreaterThan(-1);
    const linkStart = clean.lastIndexOf("<Link", idx);
    const block = clean.slice(linkStart, idx + 20);
    expect(block, "'광고 영상'이 side-item Link 안에 없다").toMatch(/side-item/);
  });

  // ★ 병합(2026-08-13): "홈 — 빠른 생성"이 사라졌다(빠른 생성을 화면에서 내렸다).
  // 순서 계약은 그 자리를 「영상 만들기」로 옮겨 그대로 지킨다 — 광고는 그 다음, 보관함 앞이다.
  it("최상위 항목은 영상 만들기 다음·보관함 앞에 있다 — 형제 순서가 그대로다", () => {
    const makeIdx = clean.indexOf("영상 만들기 (단계별)");
    const adIdx = clean.indexOf("광고 영상");
    const archiveIdx = clean.indexOf('href="/archive"');
    expect(makeIdx).toBeGreaterThan(-1);
    expect(adIdx).toBeGreaterThan(makeIdx);
    expect(archiveIdx).toBeGreaterThan(adIdx);
  });

  it("현재 프로젝트가 있으면 그 프로젝트로, 없으면 /ads/new로 간다 — 하드코딩된 새 링크 하나만이 아니다", () => {
    // 이 단정이 없으면 광고 링크를 그냥 "/ads/new"로 박아도 통과한다 — 그러면
    // 진행 중인 광고를 다시 열 방법이 사이드바에서 사라진다(기존 '영상 만들기'와 다른 동작).
    expect(src).toMatch(/\/ads\/\$\{[^}]*\.id\}/);
    expect(src).toContain('"/ads/new"');
  });

  it("아이콘이 sparkle(영상 만들기)과 다르다 — 두 최상위 항목이 시각적으로 구별된다", () => {
    const adIdx = clean.indexOf("광고 영상");
    const before = clean.slice(Math.max(0, adIdx - 200), adIdx);
    expect(before).toMatch(/Icon name="ad"/);
  });
});

describe("사이드바 — 광고 하위 단계는 이동이 아니라 표시다", () => {
  it("네 단계(입력·시나리오·만드는 중·완성)가 status 값 그대로 AD_STEPS를 그린다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/ad\/steps["']/);
    expect(src).toContain("AD_STEPS");
    expect(src).toContain("adStepIndex");
  });

  // ★ 2026-08-13 뒤집힌 결정: 이제 **이동한다.** 지나온 단계를 다시 볼 길이 아예 없었다.
  // 주소에 남기므로(?step=) 뒤로가기·새로고침·링크 공유가 산다. 아직 안 온 단계는 그대로
  // 잠금이라 <span> 으로 남는다 — 없는 것을 열 수 없다.
  it("갈 수 있는 단계는 Link, 아직 안 온 단계는 span 이다", () => {
    const mapIdx = src.indexOf("AD_STEPS.map(");
    expect(mapIdx, "AD_STEPS.map( 을 못 찾았다").toBeGreaterThan(-1);
    const block = src.slice(mapIdx, src.indexOf("export default", mapIdx));
    expect(block, "단계가 링크가 아니다").toMatch(/<Link/);
    expect(block, "잠긴 단계를 그릴 <span 이 없다").toMatch(/<span/);
    expect(block, "갈 수 있는지 판정을 안 쓴다").toMatch(/isAdStepReachable/);
  });

  // ★ 2026-08-21 에 **셋이 됐다** — 한 번에 굽는 영상의 단계 목록(FilmStepList)이 더해졌다.
  //   재는 뜻은 그대로다: 새 CSS 를 만들지 않고 있는 것을 그대로 쓰는가.
  it("기존 side-steps·side-step 클래스를 그대로 재사용한다 — 세 목록(단계별 6·광고 4·한번에 5) 모두에서 쓰인다", () => {
    // 새 CSS를 만들면 안 되므로, 컨테이너 클래스가 기존 것과 똑같이 나와야 한다.
    const containerMatches = src.match(/className="side-steps"/g) || [];
    expect(containerMatches.length, "side-steps 컨테이너가 세 곳에서 재사용되지 않는다").toBe(3);
    // 항목 클래스도 템플릿으로 'side-step'을 재사용하는지 — 새 클래스 이름을 발명하지 않았는지.
    const itemMatches = src.match(/`side-step\$\{/g) || [];
    expect(itemMatches.length, "side-step 항목 클래스가 세 곳에서 재사용되지 않는다").toBe(3);
  });

  it("사이드바가 발명한 새 CSS 클래스 이름이 없다 — ad- 접두사 클래스를 스스로 만들지 않았다", () => {
    expect(src).not.toMatch(/["'`]ad-(step|item|side|list)/);
  });

  it("광고 페이지(/ads)가 아니면 하위 단계를 안 그린다 — 기존 inCreate && StepList와 같은 방식", () => {
    expect(src).toMatch(/pathname\.startsWith\(["']\/ads["']\)/);
    // 조건이 실제로 하위 단계 렌더를 감싸는지 — 변수 존재만으로는 증거가 안 된다.
    const guardIdx = src.search(/\{inAds\s*&&/);
    expect(guardIdx, "inAds && 로 감싼 렌더가 없다").toBeGreaterThan(-1);
  });

  it("②시나리오 단계에만, 그리고 지금 그 단계일 때만 '확인' 표시가 붙는다", () => {
    // waits && active 둘 다 있어야 한다 — waits만 있으면 이미 지난 단계에도 계속
    // '확인'이 남아 "아직 기다리는 중"이라는 거짓 신호를 준다.
    expect(src).toMatch(/waits\s*&&\s*active[\s\S]{0,10}&&[\s\S]{0,10}<em>확인<\/em>|s\.waits\s*&&\s*active/);
    expect(src).toContain("<em>확인</em>");
  });

  it("가격·크레딧 숫자를 사이드바에 넣지 않는다", () => {
    // "크레딧"이라는 낱말 자체는 이미 기존 주석(side-grow 위)에도 있다 — 금지 대상은
    // 숫자가 붙은 값(예: "50크레딧")이지 낱말 자체가 아니다.
    expect(src).not.toMatch(/\d+\s*크레딧/);
  });
});

describe("사이드바 — 폴링을 새로 시작하지 않는다", () => {
  it("사이드바에는 fetch도 setInterval도 없다 — /ads/[id] 화면의 폴링 결과를 컨텍스트로만 받는다", () => {
    expect(src, "사이드바가 직접 fetch를 부른다 — 요청이 두 배가 된다").not.toMatch(/\bfetch\(/);
    expect(src, "사이드바가 직접 setInterval을 돈다 — 요청이 두 배가 된다").not.toMatch(/setInterval\(/);
  });

  it("useAdProject로 광고 프로젝트 상태를 읽기만 한다", () => {
    expect(src).toMatch(/from ["'][./]*\.?\/?AdProjectContext["']/);
    expect(src).toContain("useAdProject");
  });
});

describe("사이드바 — 기존 동작 회귀 없음", () => {
  // 빠른 생성은 화면에서 내렸다 — 사이드바에 홈 항목이 없고, 루트는 단계별 흐름으로 보낸다
  // (app/page.js · tests/home-removed.test.js).
  it("홈 항목을 두지 않는다", () => {
    expect(src).not.toContain("홈 — 빠른 생성");
  });

  it("영상 만들기(기존 6단계) 링크·makeHref·StepList가 그대로다", () => {
    expect(src).toContain("영상 만들기 (단계별)");
    expect(src).toMatch(/function makeHref\(project\)/);
    expect(src).toMatch(/function StepList\(/);
    expect(src).toContain("STEPS.find((s) => s.key === currentStepKey(project))");
  });

  it("기존 '+ 새로 만들기' 링크가 그대로다", () => {
    expect(src).toContain("+ 새로 만들기");
    expect(src).toMatch(/inCreate && project\?\.id/);
  });

  // 설정(준비 중)은 뺐다 — 누를 수 없는 줄이었다(2026-08-13).
  it("보관함·템플릿(준비 중) 항목이 그대로다", () => {
    expect(src).toContain('href="/archive"');
    expect(src).toContain("보관함");
    expect(src).toMatch(/템플릿[\s\S]{0,40}준비 중/);
    expect(src).not.toMatch(/설정[\s\S]{0,40}준비 중/);
  });

  // ★ 병합(2026-08-13): 운영자 전용 항목이 둘이 됐다(사용자 관리 · 비용 기록).
  // 계약은 그대로다 — **둘 다** isAdmin 게이트 안이라야 한다(fail-closed).
  it("운영자 전용 항목이 모두 isAdmin 게이트 안에 있다", () => {
    const gates = [...src.matchAll(/\{isAdmin && \(([\s\S]*?)\)\}/g)].map((m) => m[1]);
    expect(gates.length, "isAdmin 게이트를 못 찾았다").toBeGreaterThan(0);
    const inside = gates.join(" ");
    expect(inside, "게이트 안에 /costs 링크가 없다").toContain("/costs");
    expect(inside, "게이트 안에 /admin 링크가 없다").toContain("/admin");
    // 게이트 **밖**에 새어 나온 것이 없어야 한다
    const outside = src.replace(/\{isAdmin && \(([\s\S]*?)\)\}/g, "");
    expect(outside, "/costs 가 게이트 밖에도 있다").not.toContain('href="/costs"');
    expect(outside, "/admin 이 게이트 밖에도 있다").not.toContain('href="/admin"');
  });

  it("side-grow가 그대로 남아 목록을 위로 붙인다", () => {
    expect(src).toContain('className="side-grow"');
  });
});

// ★ 실제 화면에서 잡은 어긋남(2026-08-13) — 완성된 광고에서 ②시나리오를 눌러 다시 봐도
// 사이드바는 ④완성에 불이 켜진 채였다. 사이드바가 **실제 status** 로만 현재 자리를
// 정했기 때문이다. 지금 보고 있는 단계(view)를 화면이 알려 주고, 사이드바는 그것을 켠다.
describe("사이드바 — 보고 있는 단계에 불이 켜진다", () => {
  const ctxSrc = readFileSync("components/AdProjectContext.jsx", "utf8");
  const pageSrc = readFileSync("app/ads/[id]/page.js", "utf8");

  it("컨텍스트가 보는 단계를 나른다 — 사이드바가 주소를 따로 읽지 않는다", () => {
    expect(ctxSrc, "컨텍스트에 view 가 없다").toMatch(/\bview\b/);
    expect(ctxSrc).toMatch(/setView/);
    // 사이드바가 useSearchParams 로 직접 읽으면 이 규약이 깨진다(요청·상태가 두 갈래가 된다)
    expect(src, "사이드바가 주소를 직접 읽는다").not.toContain("useSearchParams");
  });

  it("화면이 보는 단계를 컨텍스트에 알린다 — 안 알리면 사이드바는 영영 status 만 본다", () => {
    expect(pageSrc).toMatch(/setView\(/);
  });

  it("★ 활성 표시는 보는 단계로 정한다 — status 로만 정하면 ?step 이동이 사이드바에 안 보인다", () => {
    const block = clean.slice(clean.indexOf("function AdStepList"), clean.indexOf("export default function Sidebar"));
    expect(block, "AdStepList 가 view 를 안 받는다").toMatch(/view/);
    // 활성 판정이 보는 단계의 번호를 쓴다
    expect(block).toMatch(/viewIdx|activeIdx/);
  });

  it("지나옴·잠금은 여전히 실제 status 로 정한다 — 보는 것과 진행한 것은 다르다", () => {
    const block = clean.slice(clean.indexOf("function AdStepList"), clean.indexOf("export default function Sidebar"));
    expect(block, "adStepIndex(status) 판정이 사라졌다").toMatch(/adStepIndex\(adProject\?\.status\)/);
    expect(block).toMatch(/isAdStepReachable\(s\.key,\s*adProject\?\.status\)/);
  });

  it("★ '확인' 꼬리표는 실제로 거기 멈춰 있을 때만 — 완성본에서 시나리오를 들춰볼 때 뜨면 거짓말이다", () => {
    const block = clean.slice(clean.indexOf("function AdStepList"), clean.indexOf("export default function Sidebar"));
    expect(block).toMatch(/s\.waits\s*&&\s*active\s*&&\s*i\s*===\s*idx/);
  });
});

// ★ 위 수정 직후 실제 화면에서 잡은 파생 결함 — 완성된 광고에서 ②시나리오를 보면
// ④완성이 **잠긴 회색**으로 보였다(누르면 가지는데). 잠금을 "활성도 지나옴도 아니면"
// 으로 정했기 때문이다. 보는 자리를 옮기는 순간 그 규칙이 무너진다.
describe("사이드바 — 잠금은 '갈 수 있는가'로 정한다", () => {
  it("★ 잠금 판정이 이동 가능(canGo)과 같은 것을 본다 — 보는 자리와 무관해야 한다", () => {
    const block = clean.slice(clean.indexOf("function AdStepList"), clean.indexOf("export default function Sidebar"));
    expect(block, "잠금이 canGo 를 안 본다 — 도달한 단계가 잠겨 보인다").toMatch(/!canGo\s*\?\s*["'] locked["']/);
    expect(block, "옛 규칙(!active && !passed)이 남아 있다").not.toMatch(/!active\s*&&\s*!passed/);
  });
});
