// **오래 걸리는 라우트에는 상한이 적혀 있어야 한다** (2026-09-03).
//
// ★★★ 왜 판으로 박는가 — 2026-09-03 에 13곳이 한꺼번에 빠져 있었다. 그중
//   `app/api/reel/[id]/status` 는 GET 인데 fal 에 두 번 다녀오는 **수거 경로**여서,
//   상한 없이 잘리면 결과를 영영 못 줍고 화면은 "만드는 중"에 갇힌다 — 사장님이
//   "새로고침해도 그대로"라고 한 자리가 여기다.
//   `vercel.json` 에 `functions` 설정이 **0건**이라 전역 fallback 도 없다. 즉 라우트에
//   안 적으면 플랫폼 기본값이고, 그 값은 우리가 정한 적이 없다.
//
// ★★ 목록을 손으로 적지 않는다 — 적으면 새 라우트가 조용히 빠진다. **소스에서 찾는다**:
//   fal·LLM 을 부르거나, 파이프라인을 돌리거나, 응답 뒤에 일을 남기는 라우트가 대상이다.
// ★ 값까지는 안 잰다(60 이든 300 이든 그 라우트의 사정이다) — **있는가**만 잰다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function routeFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) routeFiles(p, out);
    else if (name === "route.js") out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

// 이 낱말이 소스에 있으면 **오래 걸릴 수 있는 라우트**로 본다.
//   · 응답 뒤에 남는 일        — runInBackground
//   · fal 을 직접 부르는 것      — generateImage·submitClip·generateClip·drawStoryboardSheet·synthesize
//   · fal 에서 결과를 줍는 것    — collect*
//   · 파이프라인·LLM 을 돌리는 것 — run*/make*/build*Prompt·startAdRender
const HEAVY = [
  /runInBackground/,
  /generateImage|drawStoryboardSheet|submitClip|generateClip|synthesize/,
  /collectReelOneShot|collectAdRender|collectFilmRender|collectClip/,
  /runReel\w*|runAd\w*|runFilm\w*|startAdRender|makeReelScenario|makeAdScenario|makeFilmScenario|buildReelPrompts/,
];

const files = routeFiles("app/api");

describe("오래 걸리는 라우트에는 maxDuration 이 있다", () => {
  const heavy = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return HEAVY.some((re) => re.test(src));
  });

  it("★ 대상이 실제로 잡힌다 — 0건이면 이 판이 아무것도 안 지킨다", () => {
    expect(heavy.length).toBeGreaterThan(8);
  });

  it("★★★ 대상 전부에 상한이 적혀 있다", () => {
    const missing = heavy.filter((f) => !/export const maxDuration\s*=\s*\d+/.test(readFileSync(f, "utf8")));
    expect(missing, `상한이 없는 라우트:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("★★ 값이 사람이 정한 범위 안이다 — 0 이나 터무니없는 값이면 배포가 거절한다", () => {
    for (const f of heavy) {
      const m = readFileSync(f, "utf8").match(/export const maxDuration\s*=\s*(\d+)/);
      if (!m) continue;
      const v = Number(m[1]);
      expect(v, `${f} 의 상한이 ${v}`).toBeGreaterThanOrEqual(30);
      expect(v, `${f} 의 상한이 ${v}`).toBeLessThanOrEqual(800);
    }
  });
});

describe("수거를 겸하는 GET 은 특히 챙긴다", () => {
  // ★ 이 셋은 **GET 인데 일을 한다** — 상태를 읽기 전에 fal 에서 결과를 줍는다.
  //   상한이 없으면 잘리고, 잘리면 아무도 다시 줍지 않는다(크론도 웹훅도 없다).
  const COLLECTORS = [
    "app/api/reel/[id]/status/route.js",
    "app/api/reel/[id]/route.js",
    "app/api/ads/[id]/status/route.js",
    "app/api/film/[id]/status/route.js",
  ];

  for (const f of COLLECTORS) {
    it(`★★★ ${f} 에 상한이 있다`, () => {
      expect(readFileSync(f, "utf8")).toMatch(/export const maxDuration\s*=\s*\d+/);
    });
  }
});

describe("vercel.json — 전역 fallback 이 없다는 사실을 못 박는다", () => {
  it("★★ functions 설정이 생기면 이 판이 알려 준다 — 그때는 위 규칙을 다시 본다", () => {
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(
      v.functions,
      "vercel.json 에 functions 가 생겼다 — 전역 상한이 있으면 라우트별 상한의 뜻이 달라진다",
    ).toBeUndefined();
  });
});
