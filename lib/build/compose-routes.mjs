// 빌드 전용 — **ffmpeg 와 자막 폰트를 실을 라우트를 스스로 계산한다.**
//
// ★★★ 왜 필요한가(2026-09-10 · Vercel Function Storage 초과). `next.config.mjs` 가
//   `outputFileTracingIncludes: { "/*": [ffmpeg-static, assets] }` 로 **모든 함수**에
//   110MB(ffmpeg 80MB + 폰트 30MB)를 붙이고 있었다. 배포 실물에서 함수 하나가
//   **46.11MB** 였고 `_not-found`(404 화면)까지 같은 크기였다. 출력 197개 × 배포 20개
//   이상이 쌓여 제공량을 넘겼다.
//
// ★★ 그런데 좁히는 일은 **조용히 실패한다.** 폰트가 빠져도 오류가 안 난다 — libass 는
//   지정한 폴더를 못 읽으면 기본 폰트로 대체할 뿐이라, 배포는 "성공"하고 **자막 글자만
//   두부(□□□)** 로 나온다(lib/compose.js 머리말 · 2026-08-13 프로덕션에서 겪은 모양).
//   그래서 목록을 **손으로 적지 않는다** — 손으로 적으면 새 라우트가 compose 를 쓰기
//   시작한 날 아무도 모르게 빠진다. import 그래프가 유일한 진실이다.
//
// ★ 이 파일은 **빌드 때만** 돈다(next.config.mjs). 앱 코드가 부르지 않는다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

// 상대 import 만 따라간다 — 우리가 쓴 코드가 전부 상대 경로이고, node_modules 까지
// 들어가면 그래프가 폭발한다(그리고 거기에는 compose 가 없다).
function depsOf(file) {
  let src = "";
  try { src = readFileSync(file, "utf8"); } catch { return []; }
  const out = [];
  const re = /(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const t = path.resolve(path.dirname(file), m[1]);
    for (const c of [t, `${t}.js`, `${t}.jsx`, path.join(t, "index.js")]) {
      if (isFile(c)) { out.push(c); break; }
    }
  }
  return out;
}

function walk(dir, out = []) {
  let items = [];
  try { items = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) walk(p, out);
    else if (it.name === "route.js" || it.name === "page.js") out.push(p);
  }
  return out;
}

// `app/api/ads/[id]/finish/route.js` → `/api/ads/*/finish`
//
// ★ 대괄호를 그대로 두지 않는다 — 이 키는 **글롭**이라 `[id]` 가 문자 클래스(i 또는 d)로
//   읽힌다(Next 문서가 `\[\[\.\.\.slug\]\]` 처럼 이스케이프하는 이유). 한 마디를 통째로
//   가리키는 `*` 가 더 안전하고 읽기도 쉽다.
function routeKeyOf(file, root) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const segs = rel.replace(/^app\//, "").replace(/\/(route|page)\.js$/, "").split("/");
  return "/" + segs.map((s) => (s.startsWith("[") ? "*" : s)).filter(Boolean).join("/");
}

// `lib/compose.js` 에 닿는 진입점의 **라우트 키 목록**. 닿으면 그 함수 안에서 ffmpeg 가
// 돌 수 있다는 뜻이므로, 바이너리와 폰트가 함께 실려야 한다.
export function composeRouteKeys(root = process.cwd()) {
  const target = path.resolve(root, "lib/compose.js");
  const cache = new Map();
  const reaches = (entry) => {
    const seen = new Set();
    const stack = [entry];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      if (f === target) return true;
      if (!cache.has(f)) cache.set(f, depsOf(f));
      for (const d of cache.get(f)) stack.push(d);
    }
    return false;
  };
  const keys = new Set();
  for (const e of walk(path.join(root, "app"))) if (reaches(e)) keys.add(routeKeyOf(e, root));
  return [...keys].sort();
}
