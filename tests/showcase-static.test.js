// 랜딩 표지를 **정적 파일로 굽는다** (2026-09-10 사장님 지시: "파일 자체를 올린다던가").
//
// ★★★ 왜. 표지를 API 라우트로 흘려주면 한 장마다 함수가 뜨고 Postgres 를 한 번 조회하고
//   Supabase Storage 를 한 번 내려받는다. 09-09 에 엣지가 쥐게 고쳐 **두 번째 방문부터는**
//   0.6초가 됐지만 **첫 방문은 7.5초 그대로**였다(라이브 실측).
//   같은 날 정적 파일을 재 보니 답이 분명했다:
//     API 표지  19KB  → 첫 1.2~2.7초 · 캐시 0.18초
//     정적 파일 607KB → 첫 0.65초    · 캐시 **0.076초**
//   **607KB 짜리 정적 파일이 19KB 짜리 API 표지보다 빠르다.**
//
// ★★ 그리고 속도만이 아니다. 구워 넣으면 이 셋이 함께 사라진다:
//     · 죽은 표지(09-07 미이관으로 25장 중 스무 장이 404 · 404 가 성공보다 2.7배 느리다)
//     · `/api/projects` 왕복(0.85~1.5초)과 그 뒤에야 시작되는 hydration 대기
//     · **방문마다 나가던 Supabase 전송** — 2026-09-07 에 서비스를 죽인 그 구조
//
// ★ 대신 성질이 바뀐다: 벽이 **배포 시점에 고정**된다. 랜딩에서는 그것이 오히려 낫다 —
//   자동 목록에는 영어 지문 원문이 이름인 편이 섞여 있었다(09-09 실측). 고를 수 있어야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const mw = readFileSync("middleware.js", "utf8");
const src = readFileSync("app/home/page.js", "utf8");
const made = readFileSync("components/HomeMade.jsx", "utf8");

// matcher 문자열을 **정규식으로 되살려** 실제 판정을 잰다 — 글자만 세면 "showcase 라고
// 적혀 있다"까지만 확인되고, 자리가 틀려도 통과한다.
function matcherRe() {
  const m = mw.match(/matcher:\s*\[\s*"([^"]+)"/);
  expect(m, "matcher 를 못 읽었다").not.toBe(null);
  return new RegExp(`^${m[1]}$`);
}

describe("정적 표지 — 미들웨어 경계", () => {
  it("★★★ showcase/ 는 미들웨어를 안 탄다 — 안 빼면 로그인 벽에 막혀 307 이 된다", () => {
    // 2026-09-10 라이브 실측으로 확인한 함정이다:
    //   /samples/storyboard-2x2.jpg (제외됨)   → 200 · 0.076초
    //   /board-logo.png            (제외 안 됨) → **307 → /login**
    // `public/` 에 넣는 것만으로는 안 된다. 이 저장소가 fonts/·samples/ 를 뺀 이유와 같다.
    const re = matcherRe();
    expect(re.test("/showcase/01.webp"), "showcase 가 미들웨어에 걸린다 = 307").toBe(false);
    expect(re.test("/showcase/hero.webp")).toBe(false);
  });

  it("★★★ 넓힌 것은 그 한 자리뿐이다 — 보안 경계가 조용히 넓어지지 않았다", () => {
    // matcher 가 곧 보안 경계다(middleware.js 머리말). 여기 안 걸리는 경로는 **신원 헤더
    // 없이** 라우트에 닿는다. 그러니 넓힐 때는 넓어진 자리를 정확히 잰다.
    const re = matcherRe();
    for (const p of ["/api/projects", "/api/uploads/a.jpg", "/api/reel/x/attach",
                     "/home", "/admin", "/archive", "/ads/new", "/me"]) {
      expect(re.test(p), `${p} 가 미들웨어에서 빠졌다 — 신원 검사를 안 지난다`).toBe(true);
    }
  });

  it("★ 원래 빠져 있던 것들은 그대로 빠져 있다", () => {
    const re = matcherRe();
    for (const p of ["/_next/static/x.js", "/fonts/a.woff2", "/samples/a.jpg", "/favicon.ico"]) {
      expect(re.test(p), `${p} 가 다시 미들웨어에 걸린다`).toBe(false);
    }
  });
});

describe("정적 표지 — 화면이 무엇을 무는가", () => {
  it("★★★ 랜딩이 목록 API 를 안 문다 — 굽는 시점에 정해진다", () => {
    // 이 한 줄이 이번 변경의 핵심이다. 그전에는 화면이 뜬 **뒤에** fetch 가 나가고,
    // 그 응답이 온 **뒤에야** 표지 25장이 출발했다. 그 사슬을 통째로 끊는다.
    expect(made, "아직 목록을 부른다").not.toMatch(/fetch\(\s*["'`]\/api\/projects/);
    expect(src, "껍데기가 목록을 부른다").not.toMatch(/fetch\(\s*["'`]\/api\/projects/);
  });

  it("★★★ 벽이 서버에서 그려진다 — 클라이언트 부품이 아니다", () => {
    // 클라이언트면 JS 가 붙기 전까지 벽이 비어 있다. 손님이 처음 보는 화면이라
    // **첫 그림(HTML)** 에 이미 들어 있어야 한다.
    expect(made, '"use client" 가 남아 있다 — 벽이 hydration 을 기다린다').not.toMatch(/["']use client["']/);
    expect(made, "리액트 상태를 쓴다 = 클라이언트다").not.toMatch(/useState|useEffect/);
  });

  it("★★ 굽힌 목록에서 그린다", () => {
    expect(made, "굽힌 목록을 안 가져온다").toMatch(/from\s+["'][^"']*showcase(\.js)?["']/);
    expect(made, "굽힌 목록을 안 돈다").toMatch(/\.map\(/);
  });

  it("★★★ 여전히 영상 태그가 없다 — 이 규칙은 방식이 바뀌어도 산다", () => {
    // 2026-09-07 사고. 정적으로 바뀌었다고 영상을 물어도 되는 것이 아니다 —
    // 오히려 정적이면 무는 순간 **엣지에서 그대로 빠져나간다**.
    expect(src, "<video> 가 껍데기에 있다").not.toMatch(/<video/);
    expect(made, "<video> 가 벽에 있다").not.toMatch(/<video/);
  });

  it("★★ 그림에 크기를 적는다 — 안 적으면 벽이 그려지며 화면이 튄다", () => {
    // 비율이 제각각이라 높이를 그림이 정한다. 크기를 안 주면 브라우저가 자리를 못 잡아
    // 표지가 하나씩 뜰 때마다 아래가 밀린다(CLS). 굽는 시점에 재 두었으니 적을 수 있다.
    expect(made, "width/height 를 안 적는다").toMatch(/width=\{[^}]+\}[\s\S]{0,80}height=\{/);
  });
});

describe("굽힌 목록 — 순수해야 한다", () => {
  it("★★ 목록 파일은 import 가 없다 — 화면이 읽는 자리라 fs 를 끌면 빌드가 깨진다", () => {
    // 이 저장소가 세 번 겪은 사고다(CLAUDE.md 「값이 사는 곳」). 순수 데이터로 둔다.
    const list = readFileSync("lib/showcase.js", "utf8");
    expect(list, "목록 파일이 무언가를 import 한다").not.toMatch(/^\s*import\s/m);
    expect(list, "목록이 비어 있다").toMatch(/file:\s*["']/);
  });
});
