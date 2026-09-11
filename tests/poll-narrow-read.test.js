// 폴링 라우트는 **문서를 통째로 읽지 않는다** (2026-09-11).
//
// ★★★ 이 판이 막는 사고: **2026-09-07 에 서비스를 죽인 그 구조가 되돌아오는 것.**
//   Supabase 무료 egress(5GB/월)를 태워 프로젝트가 402 로 잠기고, 영상을 보는 행위가
//   로그인까지 멈췄다. 원인은 굽는 동안 화면이 2초마다 두드리는 상태 라우트가
//   프로젝트 문서를 **통째로**(reel 실측 44.5KB · ad 16.8KB) 읽고 있었던 것이다.
//
// ★ 그 자리는 고쳤다(좁은 셀렉터). 이 판은 **다음 사람이 편하게 getProject 를 다시
//   부르는 것**을 막는다 — 한 줄이면 되돌아가고, 되돌아가도 화면은 멀쩡해 보인다.
//   조용히 돌아오는 종류의 격하라 사람이 못 알아챈다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 굽는 동안 **2초마다** 불리는 자리들
const POLL_ROUTES = [
  "app/api/ads/[id]/status/route.js",
  "app/api/reel/[id]/status/route.js",
];

// 그 라우트가 부르는 수거 — 여기도 같은 빈도로 돈다
const COLLECTORS = ["lib/ad/pipeline.js", "lib/reel/pipeline.js"];

const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("폴링 라우트 — 통짜를 읽지 않는다", () => {
  it("★★★ 상태 라우트가 getProject 를 안 부른다", () => {
    for (const p of POLL_ROUTES) {
      const src = strip(readFileSync(p, "utf8"));
      expect(src, `${p} 가 문서를 통째로 읽는다`).not.toMatch(/getProject\s*\(/);
      // loadAd 도 통짜다(app/api/ads/route.js) — 이름만 다르다.
      expect(src, `${p} 가 loadAd 로 통짜를 읽는다`).not.toMatch(/loadAd\s*\(/);
    }
  });

  it("★★★ 상태 라우트가 좁은 셀렉터를 쓴다", () => {
    const ad = readFileSync(POLL_ROUTES[0], "utf8");
    const reel = readFileSync(POLL_ROUTES[1], "utf8");
    expect(ad, "광고 상태가 좁은 셀렉터를 안 쓴다").toMatch(/getAdStatus/);
    expect(reel, "reel 상태가 좁은 셀렉터를 안 쓴다").toMatch(/getReelStatus/);
  });

  it("★★★ 수거의 **기본** 읽기가 통짜가 아니다", () => {
    // 이음매(deps.getProject)는 남아 있다 — 판이 통짜를 주입해 쓴다. 여기서 재는 것은
    // **주입이 없을 때 무엇이 도는가**, 즉 프로덕션에서 도는 쪽이다.
    const ad = strip(readFileSync("lib/ad/pipeline.js", "utf8"));
    const reel = strip(readFileSync("lib/reel/pipeline.js", "utf8"));
    expect(ad, "광고 수거의 기본이 통짜다").toMatch(
      /readHead\s*=\s*deps\.getAdStatus\s*\|\|\s*deps\.getProject\s*\|\|\s*getAdStatus/
    );
    expect(reel, "reel 수거의 기본이 통짜다").toMatch(
      /readHead\s*=\s*deps\.getReelStatus\s*\|\|\s*deps\.getProject\s*\|\|\s*getReelJob/
    );
  });

  it("★★ 수거는 cuts 를 안 읽는다 — 문서의 절반이다(실측 23KB/44.5KB)", () => {
    const store = readFileSync("lib/store/supabase.js", "utf8");
    const at = store.indexOf("async selectReelJob");
    expect(at, "수거 전용 셀렉터가 없다").toBeGreaterThan(-1);
    const body = store.slice(at, store.indexOf("},", at));
    expect(body, "수거 전용 셀렉터가 cuts 를 가져온다").not.toMatch(/doc->cuts/);
  });

  it("★★★ 심장박동을 **매번 쓰지 않는다** — 통짜 읽기+쓰기가 2초마다 돌던 자리다", () => {
    const reel = strip(readFileSync("lib/reel/pipeline.js", "utf8"));
    expect(reel, "박동 간격을 안 본다").toMatch(/HEARTBEAT_MS/);
    // 간격은 이 저장소의 상수 하나가 정한다 — 여기서 손으로 30000 을 적으면 두 벌이 된다.
    expect(reel, "박동 간격을 손으로 적었다").not.toMatch(/30_?000/);
  });

  it("★★ 좁은 셀렉터가 **두 스토어 모두**에 있다 — 한쪽만 있으면 테스트가 헛돈다", () => {
    for (const p of ["lib/store/supabase.js", "lib/store/memory.js"]) {
      const src = readFileSync(p, "utf8");
      for (const fn of ["selectAdStatus", "selectReelStatus", "selectReelJob"]) {
        expect(src, `${p} 에 ${fn} 가 없다`).toMatch(new RegExp(`async ${fn}\\(`));
      }
    }
  });

  it("★★★ 응답 계약은 그대로다 — 화면이 읽는 칸을 하나도 안 뺐다", () => {
    const ad = readFileSync(POLL_ROUTES[0], "utf8");
    for (const k of ["status", "video", "error", "finish_needed"]) {
      expect(ad, `광고 응답에서 «${k}» 가 사라졌다`).toMatch(new RegExp(`${k}:`));
    }
    const reel = readFileSync(POLL_ROUTES[1], "utf8");
    for (const k of ["status", "error", "progress", "stalled_for_ms", "cuts"]) {
      expect(reel, `reel 응답에서 «${k}» 가 사라졌다`).toMatch(new RegExp(`${k}:`));
    }
  });
});
