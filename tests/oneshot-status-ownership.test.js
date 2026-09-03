// **통짜의 완료 판정은 수거 하나다** (2026-09-03 사장님 지시로 고침).
//
// ★★★ 무엇이 망가져 있었나 — `/clips` 라우트가 통짜 갈래에서도 접수 직후
//   `status:"clips"` 를 찍었다. 통짜는 fal 에 **접수만 하고 즉시 돌아오므로** 그 반환은
//   "다 됐다"가 아니라 "접수했다"인데, 그것을 완료로 읽은 것이다. 한 줄이 넷을 망가뜨렸다:
//     · 화면 폴링이 `status !== "rendering"` 이면 멈춘다 → **접수하자마자 폴링이 죽는다**
//     · 아무도 수거하지 않는다 → 사장님이 새로고침해야 결과가 걷힌다
//     · 수거가 적어 둔 오류를 그 쓰기가 **덮는다** → error 는 null 인데 화면엔 실패가 뜬다
//     · ★ **다음 클릭이 헛돈다** — 접수증이 안 지워진 채 남아 runReelOneShot 이
//       `if (job?.requestId) return;` 로 돌아간다. 프롬프트를 고쳐도 새 요청이 안 나갔다.
//   09-03 오후에 이 헛걸음을 **세 번** 밟았고, 사장님이 "프롬프트를 고쳐도 계속 같은
//   오류가 뜬다"고 한 것이 이 구조였다.
//
// ★ 컷별(percut)은 **그대로 둔다** — runReelClips 는 실제로 다 굽고 돌아오므로, 거기서
//   안 옮기면 status 가 영원히 "rendering" 이다(2026-08-21 리뷰 C1 이 세운 줄).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const route = strip(readFileSync("app/api/reel/[id]/clips/route.js", "utf8"));
const pipeline = strip(readFileSync("lib/reel/pipeline.js", "utf8"));

describe("굽기 라우트 — 통짜는 완료를 선언하지 않는다", () => {
  it("★★★ 통짜면 `.then()` 이 상태를 안 옮기고 빠져나간다", () => {
    const then = route.slice(route.indexOf(".then("), route.indexOf(".catch("));
    expect(then, "통짜 갈래를 안 가른다").toMatch(/plan\.mode === "oneshot"/);
    expect(then, "가르고도 그냥 지나간다 — return 이 없다").toMatch(/oneshot"\)\s*return;/);
  });

  it("★★ 컷별은 여전히 옮긴다 — 안 그러면 영원히 '만드는 중'이다", () => {
    const then = route.slice(route.indexOf(".then("), route.indexOf(".catch("));
    expect(then).toMatch(/status: "clips"/);
  });

  it("★★ 실패는 갈래와 상관없이 적는다 — 접수 자체가 실패한 경우다", () => {
    const cat = route.slice(route.indexOf(".catch("));
    expect(cat).toMatch(/status: "error"/);
    expect(cat).toMatch(/errorStep: "video"/);
  });
});

describe("수거가 완료를 판정한다 — 그 자리가 유일해야 한다", () => {
  it("★★★ 수거 성공이 접수증을 지우고 상태를 옮긴다", () => {
    // collectReelOneShot 의 성공 경로: job:null + status:"clips"
    expect(pipeline).toMatch(/job: null, error: null, errorStep: null,[\s\S]{0,400}?status: "clips"/);
  });

  it("★★★ 확정 실패도 접수증을 지운다 — 안 지우면 다음 클릭이 헛돈다", () => {
    expect(pipeline).toMatch(/status: "error"[\s\S]{0,200}?job: null/);
  });

  it("★★ 일시 오류는 접수증을 **지키고** 아무것도 안 적는다 — 돈 낸 편을 버리지 않는다", () => {
    expect(pipeline).toMatch(/transient: true/);
  });

  it("★★★ 접수증이 있으면 새로 접수하지 않는다 — 그 줄이 이 판 전체의 이유다", () => {
    expect(pipeline).toMatch(/job\?\.requestId\) return;/);
  });
});

describe("화면 — 통짜가 도는 동안 폴링이 산다", () => {
  it("★★★ rendering 이면 계속 두드린다", () => {
    const page = strip(readFileSync("app/reel/[id]/video/page.js", "utf8"));
    expect(page, "폴링이 rendering 을 기준으로 안 멈춘다").toMatch(/status !== "rendering"/);
  });
});
