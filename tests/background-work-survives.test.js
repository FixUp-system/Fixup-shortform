// 응답을 보낸 뒤에도 일이 계속 돌아야 한다 — 그것을 플랫폼에 **말해 줘야** 한다.
//
// 2026-08-18 프로덕션 실측으로 잡은 결함이다. 이 저장소의 생성 라우트 여섯은 파이프라인을
// `await` 없이 띄우고 곧바로 응답한다(서버리스라 응답이 먼저 나가야 한다). 그런데 Vercel 에서
// **응답 후의 작업은 보장되지 않는다** — `waitUntil()`/`after()` 로 함수 수명을 늘려야 하고,
// 그 안에서도 `maxDuration` 에 묶인다. 둘 다 없었다.
//
// 실측된 증상(프로젝트 ac62cd47):
//  · 클립 3개를 **결제**했는데 문서엔 2개만 남았다. 오류 기록도 없다(catch 조차 안 돌았다)
//    → fal 응답을 받은 뒤 **저장 전에** 인스턴스가 멈췄다. 컷당 $0.674 가 그대로 손실이다
//  · 합성은 두 번 시도해 두 번 다 `render`·`render_error` 가 **둘 다 비었다**
//  · 로그의 인스턴스 식별자가 넷이었다 — 2초 폴링이 여러 인스턴스로 흩어지므로, 폴링이 우연히
//    그 인스턴스를 깨우면 일이 진행되고 아니면 멈춘다. **부분 성공과 전면 실패를 가른 것은 운이다**
//
// ★ 심장박동(lib/pipeline.js startHeartbeat)은 이것을 **막지 못한다** — 죽음을 보이게 하는
//   장치일 뿐이다. 근본 해결은 작업 큐·워커이고 별개 프로젝트다(CLAUDE.md).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 파이프라인을 띄우고 기다리지 않는 라우트 전부. 새 라우트가 이 방식을 쓰면 여기 더한다 —
// 빠뜨리면 그 라우트만 조용히 죽는다(그리고 그 죽음은 돈이 나간 뒤에 온다).
const ROUTES = [
  { path: "app/api/projects/[id]/render/route.js", fn: "runRenderPipeline" },
  { path: "app/api/projects/[id]/clips/route.js", fn: "runVideoPipeline" },
  { path: "app/api/projects/[id]/images/route.js", fn: "runImagesPipeline" },
  { path: "app/api/projects/[id]/voice/route.js", fn: "runVoicePipeline" },
  { path: "app/api/projects/[id]/cuts/route.js", fn: "runSplitPipeline" },
  { path: "app/api/projects/[id]/auto/route.js", fn: "runAutoPipeline" },
];

describe("응답 뒤의 일이 살아남는다", () => {
  for (const { path, fn } of ROUTES) {
    const src = readFileSync(path, "utf8");
    const step = path.split("/").at(-2);

    it(`★ ${step} — 함수 수명을 그 작업까지 늘린다`, () => {
      expect(src, "lib/background.js 를 안 끌어온다").toMatch(/import \{ runInBackground \} from "(?:\.\.\/)+lib\/background\.js"/);
      // 띄우는 자리가 실제로 그 안이어야 한다 — import 만 남기고 감싸지 않으면 아무 효과가 없다.
      expect(src, `${fn} 을 runInBackground 로 감싸지 않았다 — 응답 뒤에 멈출 수 있다`)
        .toMatch(new RegExp(`runInBackground\\(\\s*${fn}\\(`));
      // ★ 라우트가 `after` 를 **직접** 부르지 않는다 — 요청 범위 밖에서 던지는 성질을 여섯 곳에서
      //   따로 다루면 한 곳이 빠지고, 그 라우트만 조용히 죽는다.
      expect(src, "after 를 직접 부른다 — 판정은 lib/background.js 한 자리다")
        .not.toMatch(/from "next\/server"/);
    });

    // ★ **콜백 형태(`() => …`)로 넘기면 안 된다.** 그러면 파이프라인이 요청 범위 **밖**에서
    //   시작하고, 이 저장소의 비용 주체는 AsyncLocalStorage 에서 읽는다(lib/actor.js) —
    //   컨텍스트가 없으면 `costActor()` 가 **던진다**. 약속(promise)을 넘기면 호출이 요청
    //   안에서 일어나 컨텍스트가 그대로 따라간다.
    it(`★ ${step} — 요청 컨텍스트 안에서 시작한다(콜백 아님)`, () => {
      expect(src, "콜백을 넘겼다 — actor 컨텍스트를 잃어 costActor() 가 던진다")
        .not.toMatch(/runInBackground\(\s*\(\s*\)\s*=>/);
    });

    it(`★ ${step} — 실행 시간 상한을 명시한다`, () => {
      expect(src, "maxDuration 이 없다 — 배포 기본값에 잘린다").toMatch(/export const maxDuration = \d+/);
    });
  }

  // ★ 여기는 소스 문자열이 아니라 **진짜 동작**을 잰다 — 이 함수가 요청 범위 밖에서 던지면
  //   테스트·측정 스크립트가 라우트를 직접 부르는 순간 51개가 무너진다(그렇게 겪었다).
  //   그리고 **약속을 그대로 돌려줘야** 부르는 쪽이 필요할 때 기다릴 수 있다.
  it("★ 요청 범위 밖에서도 던지지 않고, 약속을 그대로 돌려준다", async () => {
    const { runInBackground } = await import("../lib/background.js");
    const p = Promise.resolve("됐다");
    let got;
    expect(() => { got = runInBackground(p); }, "요청 범위 밖에서 던졌다").not.toThrow();
    expect(got, "받은 약속을 그대로 돌려주지 않는다").toBe(p);
    await expect(p).resolves.toBe("됐다");
  });

  // 상한 값을 한 벌로 두지는 않는다(라우트마다 일의 길이가 다르다). 다만 **자막 라우트와
  // 같은 값 이상**이어야 한다 — 그쪽은 원본 하나에 필터 한 번이고, 여기는 그보다 긴 일이다.
  it("★ 합성은 자막 다시 굽기보다 짧게 잡히지 않는다", () => {
    const dur = (p) => Number(readFileSync(p, "utf8").match(/export const maxDuration = (\d+)/)?.[1] || 0);
    const subtitle = dur("app/api/projects/[id]/subtitle/route.js");
    expect(subtitle, "자막 라우트의 상한을 못 읽었다").toBeGreaterThan(0);
    expect(dur("app/api/projects/[id]/render/route.js")).toBeGreaterThanOrEqual(subtitle);
  });
});
