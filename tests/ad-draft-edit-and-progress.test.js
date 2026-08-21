// ①입력으로 돌아가 **기존 값 그대로** 고칠 수 있는가 · ②지금 도는 단계가 보이는가.
//
// 둘 다 2026-08-21 사장님 지적에서 나왔다:
//   "시나리오에서 뒤로가기가 없다. 사이드바 입력을 누르면 아무것도 없는 처음으로 나온다."
//   "생성 중인지 멈춘 건지 알 수 없다."
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const detail = readFileSync("app/ads/[id]/page.js", "utf8");
const tray = readFileSync("components/AdOptionTray.jsx", "utf8");
const newPage = readFileSync("app/ads/new/page.js", "utf8");
const sidebar = readFileSync("components/Sidebar.jsx", "utf8");
const ctx = readFileSync("components/AdProjectContext.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("입력 트레이는 두 화면이 나눠 쓴다 — 두 벌이면 한쪽이 낡는다", () => {
  it("첫 화면과 입력 수정 화면이 **같은 컴포넌트**를 쓴다", () => {
    expect(newPage).toContain("AdOptionTray");
    expect(detail).toContain("AdOptionTray");
  });

  it("트레이가 옵션·모델·해상도·길이를 전부 그린다", () => {
    for (const t of ["AD_FORMATS", "AD_MOODS", "AD_LANGS", "STYLE_PRESETS", "ASPECTS", "modelsForTier"]) {
      expect(tray, `${t} 가 트레이에 없다`).toContain(t);
    }
  });

  // ★ 판정(등급·해상도·길이)은 lib 하나다. 트레이가 다시 재면 서버와 갈린다.
  it("트레이는 판정을 스스로 안 만든다 — lib 을 부른다", () => {
    expect(tray).toMatch(/from ["'][./]*lib\/ad\/models["']/);
    expect(tray).toMatch(/from ["'][./]*lib\/tiers["']/);
  });
});

describe("①입력 — 저장된 값에서 시작해 고칠 수 있다", () => {
  it("본문과 옵션을 저장된 값으로 채운다", () => {
    expect(detail).toContain("setDraftText(project.material?.text");
    expect(detail).toMatch(/format: st\.format/);
    expect(detail).toMatch(/narration_lang/);
  });

  // ★★ 폴링이 project 를 새로 받을 때마다 입력이 되돌아가면 글을 쓸 수가 없다.
  it("한 번만 채운다 — 그 뒤 사장님이 고친 값을 덮지 않는다", () => {
    expect(detail).toContain("filledRef");
    expect(detail).toMatch(/if \(filledRef\.current \|\| !project\?\.settings\) return;/);
  });

  it("저장은 PATCH 하나다 — 화면이 등급·길이·해상도를 다시 판정하지 않는다", () => {
    expect(detail).toMatch(/method: "PATCH"/);
    expect(detail).toContain("saveDraft");
  });

  // ★ 안 바뀐 것을 PATCH 로 보내면 라우트가 등급을 다시 재는데, 등급이 내려간 뒤
  //   옛 문서를 열기만 해도 403 이 날 수 있다(그 라우트 주석 참고).
  it("바뀐 것이 없으면 저장을 안 보낸다", () => {
    expect(detail).toContain("const dirty =");
    expect(detail).toMatch(/if \(!dirty\) return true;/);
  });

  // ★★ 고친 값이 아니라 저장된 옛 값으로 시나리오가 쓰이면 고친 것이 조용히 버려진다.
  it("★ [시나리오 만들기]가 **저장하고 나서** 부른다", () => {
    expect(detail).toContain("saveThenScenario");
    expect(detail).toMatch(/if \(await saveDraft\(\)\) makeScenario\(\);/);
  });
});

describe("②지금 도는 단계가 보인다", () => {
  it("컨텍스트가 '어느 단계가 도는가'를 들고 있다 — 불리언이 아니라 단계 key 다", () => {
    expect(ctx).toContain("busyStep");
    expect(ctx).toContain("setBusyStep");
  });

  // ★ 시나리오 만들기는 동기 호출이라 status 가 안 바뀐다 — 이 값이 유일한 신호다.
  it("시나리오·굽기 시작 때 그 값을 세운다", () => {
    expect(detail).toMatch(/setBusyStep\("scenario"\)/);
    expect(detail).toMatch(/setBusyStep\("rendering"\)/);
  });

  // ★ 끄는 자리를 한 군데로 모은다 — 성공·실패·시간 초과가 전부 stop 을 지난다.
  it("끝나면 끈다 — 켜진 채 남는 갈래가 없다", () => {
    expect(detail).toMatch(/setBusyStep\(null\)/);
  });

  it("사이드바가 그 값을 받아 도는 줄만 깜박인다", () => {
    expect(sidebar).toContain("busyStep");
    expect(sidebar).toMatch(/const running = busyStep === s\.key/);
    expect(sidebar).toMatch(/running \? " running" : ""/);
  });

  // ★ 새로고침하거나 다른 탭에서 들어오면 화면의 busyStep 이 비어 있다 — 그때는
  //   문서의 status 가 유일한 신호다. 둘을 합쳐야 어느 쪽으로 들어와도 보인다.
  it("새로고침으로 들어와도 굽는 중이 보인다 — status 도 함께 본다", () => {
    expect(sidebar).toMatch(/adProject\?\.status === "rendering"/);
    expect(detail).toMatch(/setBusyStep\("rendering"\)[\s\S]{0,200}startPolling\(\)/);
  });

  // ★ 색·모션만으로 말하지 않는다 — 못 읽는 사람이 있고, 모션을 끄는 사람도 있다.
  it("글자로도 말한다", () => {
    expect(sidebar).toContain("만드는 중…");
    expect(detail).toContain("running-dot");
  });

  it("모션을 줄이는 설정을 존중한다", () => {
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toMatch(/\.side-step\.running/);
  });

  // ★ 화면이 자기 시계로 세면 새로고침할 때마다 0 분으로 되돌아가 "멈춘 것 같다"가 심해진다.
  it("지난 시간은 **문서의 시작 시각**에서 잰다", () => {
    expect(detail).toMatch(/project\?\.ad_job\?\.startedAt/);
    expect(detail).toContain("elapsed");
  });
});

describe("★ 진행 표시를 부르는 화면은 그 함수를 실제로 꺼내야 한다", () => {
  // ★★ 2026-08-21 사고: /ads/[id] 가 setBusyStep 을 **꺼내지 않고 불러서**
  //   `startRender` 가 fetch 앞에서 ReferenceError 로 죽었다. 굽기가 시작조차 안 됐는데
  //   화면은 아무 말도 안 했다(콘솔에만 났다). 진행 표시를 붙이려던 코드가 진행을 막았다.
  //   ★ 이 시험은 그 부류를 통째로 막는다 — 부르는 곳이 늘어도 자동으로 걸린다.
  const screens = [
    ["app/ads/new/page.js", readFileSync("app/ads/new/page.js", "utf8")],
    ["app/ads/[id]/page.js", detail],
  ];

  for (const [name, code] of screens) {
    it(`${name} 이 setBusyStep 을 꺼내 쓴다`, () => {
      if (!/setBusyStep\(/.test(code)) return; // 안 쓰면 볼 것이 없다
      const line = code.match(/const \{[^}]*\} = useAdProject\(\);/);
      expect(line, `${name} 이 useAdProject 에서 값을 안 꺼낸다`).toBeTruthy();
      expect(line[0], `${name} 이 setBusyStep 을 부르는데 꺼내지 않았다`).toContain("setBusyStep");
    });
  }

  // ★ 사장님이 실제로 쓰는 흐름이 여기다: /ads/new 에서 소재를 적고 누르면
  //   시나리오가 30~50초 돈다. 그 구간에 신호가 없으면 "멈춘 것 같다"가 된다.
  it("입력 화면도 시나리오 구간을 표시한다 — 가장 긴 무료 구간이다", () => {
    const src = readFileSync("app/ads/new/page.js", "utf8");
    expect(src).toMatch(/setBusyStep\("scenario"\)/);
    const at = src.indexOf('setBusyStep("scenario")');
    const call = src.indexOf("/scenario`");
    expect(at, "시나리오 호출보다 뒤에서 세운다 — 도는 동안 안 보인다").toBeLessThan(call);
  });

  it("실패하면 끈다 — 켜진 채로 남으면 영원히 깜박인다", () => {
    const src = readFileSync("app/ads/new/page.js", "utf8");
    const offs = (src.match(/setBusyStep\(null\)/g) || []).length;
    expect(offs, "끄는 자리가 모자라다").toBeGreaterThanOrEqual(2);
  });
});
