// 함수 번들 — **ffmpeg 를 아무 데나 싣지 않는다** (2026-09-10 · Function Storage 초과).
//
// ★★★ 무슨 일이 있었나. `next.config.mjs` 가 `"/*"` 로 **모든 함수**에 110MB
//   (ffmpeg-static 80MB + assets 30MB)를 붙이고 있었다. 배포 실물 실측:
//       λ index (46.11MB) · λ _not-found (46.11MB) · λ admin (46.11MB) … 출력 197개
//   404 화면이 46MB다. 그것이 배포 20개 이상 쌓여 Vercel Function Storage 를 넘겼다.
//
// ★★ 좁히는 일은 **조용히 실패한다.** 폰트가 빠져도 오류가 안 나고 libass 가 기본 폰트로
//   대체할 뿐이라, 배포는 "성공"하고 **자막만 두부(□□□)** 로 나온다(2026-08-13 에 겪었다).
//   그래서 이 판은 두 방향을 다 잰다 — **덜 실었나**(위험)와 **더 실었나**(비용).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composeRouteKeys } from "../lib/build/compose-routes.mjs";

const cfg = readFileSync("next.config.mjs", "utf8");
const keys = composeRouteKeys();

describe("계산 — 무엇이 ffmpeg 를 지고 가야 하나", () => {
  it("★★★ 비어 있지 않다 — 계산이 망가지면 **전부** 빠진다", () => {
    // 이 한 줄이 안전핀이다. 그래프 워커가 조용히 0개를 돌려주면 배포는 성공하고
    // 합성만 죽는다(또는 자막이 두부가 된다).
    expect(keys.length).toBeGreaterThan(5);
  });

  it("★★★ 합성이 실제로 도는 문이 **빠지지 않았다**", () => {
    for (const must of [
      "/api/reel/*/render",   // ⑥완성 합성
      "/api/ads/*/finish",    // 원클릭 마무리(자막 굽기)
      "/api/film/*/finish",   // 필름 마무리
      "/api/cron/collect",    // 1분 크론 — finishAdRender 를 부른다(2026-09-10 신설)
    ]) {
      expect(keys, `${must} 가 빠졌다 — 그 문에서 자막이 두부가 된다`).toContain(must);
    }
  });

  it("★★★ 상관없는 문에는 **안 실린다** — 좁히기가 실제로 일어났는지", () => {
    for (const never of ["/api/me", "/login", "/", "/api/auth/login"]) {
      expect(keys, `${never} 까지 ffmpeg 를 진다`).not.toContain(never);
    }
    // 전체 진입점이 98개다. 절반도 안 되어야 좁힌 값어치가 있다.
    expect(keys.length).toBeLessThan(45);
  });
});

describe("설정 — 무거운 것을 전역으로 붙이지 않는다", () => {
  it("★★★ `\"/*\"` 에 **ffmpeg 도 폰트도** 없다", () => {
    const all = cfg.slice(cfg.indexOf('"/*"'), cfg.indexOf('"/*"') + 200);
    expect(all, '"/*" 항목을 못 찾았다').toBeTruthy();
    expect(all, "모든 함수에 ffmpeg 를 붙인다 — 404 화면까지 46MB가 된다")
      .not.toMatch(/ffmpeg-static/);
    expect(all, "모든 함수에 자막 폰트(30MB)를 붙인다").not.toMatch(/assets\/\*\*/);
  });

  it("★★ 설정이 목록을 **계산해서** 쓴다 — 손으로 적으면 새 라우트에서 갈린다", () => {
    expect(cfg, "compose-routes 를 안 쓴다").toMatch(/composeRouteKeys/);
  });

  it("★★ 아바타 참조(104K)는 전역으로 둔다 — 40개 문이 쓰고 값이 거의 없다", () => {
    expect(cfg).toMatch(/assets\/refs/);
  });
});
