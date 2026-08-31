// **"아직 모른다"를 확정으로 읽지 않는다** — 새로고침 직후의 잘못된 한 프레임.
//
// 2026-08-31 사장님 보고: *"새로 고침할 때 해상도 뒤에 크레딧이 보이거나 모델이 기본만
// 보였다가 로딩이 끝나면 정상적으로 렌더링된다."*
//
// ★★ 뿌리는 하나다 — `MeProvider` 가 내보내는 값에 **"읽기가 끝났는가"가 없었다**
//   (`{me, failed, guest, load}`). `me` 는 `null` 로 시작하는데 소비자들이 `me?.x` 를
//   **확정된 답**으로 읽었다:
//     · `showCredits = me?.gated !== false` → `undefined !== false` 는 **참**이라
//       크레딧이 그려졌다가, 크레딧을 끈 계정(gated:false)이면 로딩 뒤 사라진다
//     · `reelModelsForTier(me?.tier)` → tier 를 모르니 **기본 등급으로 좁혀** 모델이
//       하나만 보였다가, 프로 등급이면 로딩 뒤 늘어난다
//
// ★ 이 파일이 이미 같은 종류의 구분을 한 번 했다 — `guest` 를 `failed` 와 **다른 축**으로
//   가른 것(*"401 은 '못 읽었다'가 아니라 '아직 로그인 안 했다'"*). 그 규율을 한 칸 넓힌다.
//
// ★★ 고치는 방향: **모르는 동안에는 안 그린다.** "틀린 값 → 맞는 값"은 버그로 읽히고
//   "빈자리 → 맞는 값"은 로딩으로 읽힌다. 줄과 라벨은 남겨 레이아웃이 안 흔들리게 한다.
//
// (이 저장소에는 렌더 하네스가 없다 — 소스 문자열로 잰다. tests/*-ui.test.js 와 같은 방식.)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
// ⚠️ **줄 주석을 먼저 걷는다.** 이 저장소의 다른 판들은 블록 주석(`/* */`)을 먼저 지우는데,
//   그 순서는 **줄 주석 안의 글롭 경로에 속는다** — `app/create/[id]/*/page.js` 의 `/*` 를
//   블록 주석 시작으로 읽고 다음 `*/` 까지 통째로 지운다(실측: app/ads/[id]/page.js 에서
//   1만 3천 자가 사라져 멀쩡한 코드가 "없다"로 잡혔다).
//   `[^:]` 가드는 그대로 둔다 — URL 의 `://` 를 주석으로 오인하지 않기 위한 것이다.
const strip = (t) => t.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const CREDIT_SCREENS = [
  "app/ads/new/page.js",
  "app/ads/[id]/page.js",
  "app/create/page.js",
  "app/create/[id]/images/page.js",
];

describe("MeContext 가 '아직 모른다'를 말한다", () => {
  const src = read("components/MeContext.jsx");

  it("★ 읽기가 끝났는지를 내보낸다", () => {
    expect(strip(src), "value 에 ready 가 없다").toMatch(/value\s*=\s*useMemo\(\(\)\s*=>\s*\(\{[^}]*ready/);
  });

  it("★★ 성공·401·실패 **어느 쪽으로 끝나도** 세운다 — 실패하면 영영 안 그려진다", () => {
    // finally 로 세워야 세 갈래가 다 덮인다. try 안에서만 세우면 실패한 계정의 화면이
    // 빈 채로 굳는다 — 잘못된 한 프레임을 고치려다 영영 빈 화면을 만드는 셈이다.
    expect(strip(src)).toMatch(/finally\s*\{[^}]*setReady\(true\)/);
  });
});

describe("크레딧 문구 — 모르는 동안에는 안 그린다", () => {
  for (const p of CREDIT_SCREENS) {
    it(`${p} 가 ready 를 함께 본다`, () => {
      const s = strip(read(p));
      expect(s, "showCredits 가 ready 를 안 본다").toMatch(/showCredits\s*=\s*ready\s*&&/);
    });
  }

  it("★ ready 없이 gated 만 보는 자리가 하나도 없다 — 이것이 회귀 방지선이다", () => {
    for (const p of CREDIT_SCREENS) {
      const s = strip(read(p));
      // `= me?.gated !== false` 로 **시작**하면 로딩 중을 확정으로 읽는 그 코드다.
      expect(s, `${p} 에 옛 판정이 남아 있다`).not.toMatch(/=\s*me\?\.gated\s*!==\s*false/);
    }
  });
});

describe("모델 칩 — 등급을 모르는 동안에는 비운다", () => {
  it("★ 단계별: 등급을 알기 전에는 목록이 비어 있다", () => {
    const s = strip(read("app/reel/new/page.js"));
    expect(s, "reelModelsForTier 를 ready 없이 부른다")
      .toMatch(/ready\s*\?\s*reelModelsForTier|reelModelsForTier[^;]*:\s*\[\]/);
  });

  it("★ 원클릭: 트레이가 등급을 아는지 함께 받는다", () => {
    const tray = strip(read("components/AdOptionTray.jsx"));
    expect(tray, "AdOptionTray 가 tierReady 를 안 받는다").toMatch(/tierReady/);
    // 모르는 동안에는 칩을 안 그린다 — 줄과 라벨은 남는다(레이아웃 유지).
    expect(tray).toMatch(/tierReady\s*&&[\s\S]{0,200}modelsForTier\(/);
  });

  it("★ 원클릭 화면 둘이 그 값을 넘긴다", () => {
    for (const p of ["app/ads/new/page.js", "app/ads/[id]/page.js"]) {
      expect(strip(read(p)), `${p} 가 tierReady 를 안 넘긴다`).toMatch(/tierReady=\{/);
    }
  });
});
