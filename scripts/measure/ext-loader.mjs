// 확장자 없는 상대 import 를 풀어 주는 node 로더.
//
// ★★ 왜 필요한가: 이 저장소의 lib 곳곳이 `from "./fake"` 처럼 확장자 없이 쓴다
//   (lib/vlm.js:10 · lib/i2v.js:2 · lib/imagegen.js:5 · lib/pipeline.js:2 · lib/validate.js:1 …).
//   Next 번들러는 그것을 풀지만 **맨 node 는 못 푼다** — 그래서 lib 를 import 하는
//   측정 스크립트가 ERR_MODULE_NOT_FOUND 로 죽는다. 앱은 멀쩡한데 스크립트만 죽는다.
//
// 쓰는 법:  node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/<스크립트>.mjs
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) {
    if (spec.startsWith(".") && !spec.endsWith(".js")) {
      try { return await next(spec + ".js", ctx); } catch {}
      try { return await next(spec + "/index.js", ctx); } catch {}
    }
    throw e;
  }
}
