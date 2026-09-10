// 크론 수거 — **굽는 편을 사람 없이 걷는다** (2026-09-10 사장님 요청).
//
// ★★★ 무엇이 망가져 있었나. 접수는 큐로 즉시 끝나고 결과는 **수거**가 이어받는데
//   (lib/reel/pipeline.js 의 collectReelOneShot 머리말), 그 수거를 부르는 자리가
//   **사람이 화면을 열었을 때뿐**이었다:
//     · GET /api/reel/[id]        — 보관함 상세를 열 때
//     · GET /api/reel/[id]/status — ⑤영상 화면이 폴링할 때(창을 닫으면 멈춘다)
//   굽기는 10분이 걸린다(2026-09-10 실측: reel 622초 · 광고 701·895초). 그 사이 창을
//   닫으면 **아무도 안 걷는다.**
//
// ★★★ 실물로 셋이 그렇게 앉아 있었다(2026-09-10 프로덕션 실측):
//     · reel 14fd0ce0 — fal COMPLETED 26.2MB, 앱에는 없음 (사장님이 손으로 붙였다)
//     · ad  0603d9bf — 09-08부터 rendering, fal COMPLETED 27.0MB, 접수증 살아 있음
//     · ad  26cfd4a2 — 09-04부터 rendering, fal COMPLETED 25.6MB, 접수증 살아 있음
//   돈은 이미 냈고 영상은 fal 에 며칠째 있는데 앱은 "만드는 중"을 띄우고 있었다.
//
// ⚠️ fal 에는 **요청 목록 API 가 없다**(2026-09-10 실측: /requests 405 · api.fal.ai 404).
//   그래서 접수증을 놓치면 되찾을 길이 아예 없다 — 이 판이 지키는 것은 그 접수증이
//   **반드시 쓰인다**는 것이다.
//
// ★ 전송량 규율(09-07 사고): 굽는 편이 하나도 없으면 **fal 도 저장소도 안 두드린다.**
//   1분마다 도는 크론이라 여기가 무거우면 그것 자체가 다음 사고가 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sweepBakingProjects } from "../lib/collect-sweep.js";
import { memoryStore } from "../lib/store/memory.js";

describe("쓸기 — 굽는 편이 없으면 아무 데도 안 묻는다", () => {
  it("★★ 접수증이 하나도 없으면 fal 을 한 번도 안 부른다", async () => {
    const called = [];
    const out = await sweepBakingProjects({
      store: { selectBakingProjects: async () => [] },
      collectReelOneShot: async () => called.push("reel"),
      collectAdRender: async () => called.push("ad"),
      finishAdRender: async () => called.push("finish"),
    });

    expect(called, "굽는 편이 없는데 fal 을 불렀다").toEqual([]);
    expect(out.swept).toBe(0);
  });
});

// 쓸기가 부르는 함수는 **이미 있는 것들**이다 — 새 수거 로직을 여기서 또 쓰면 두 벌이 되어
// 한쪽만 고쳐진다(이 저장소가 반복해서 밟은 함정). 이 판은 "맞는 것을 맞는 인자로 부르는가"
// 만 잰다.
const harness = (rows) => {
  const calls = [];
  const deps = {
    store: { selectBakingProjects: async () => rows },
    collectReelOneShot: async (id, owner) => { calls.push(["reel", id, owner]); return { changed: true }; },
    collectAdRender: async (id, owner) => { calls.push(["ad", id, owner]); return { changed: true }; },
    finishAdRender: async (id, owner) => { calls.push(["finish", id, owner]); return { finished: true }; },
  };
  return { deps, calls };
};

describe("쓸기 — 종류에 맞는 수거를 부른다", () => {
  it("★★ reel 은 수거를 부른다 — **소유자를 함께 넘긴다**", async () => {
    // 크론에는 로그인한 사람이 없다. 소유자를 안 넘기면 getProject 가 남의 편으로 보고
    // 아무것도 못 걷는다(lib/projects.js 의 ownerScope).
    const { deps, calls } = harness([{ id: "p1", owner_id: "u1", kind: "reel" }]);

    await sweepBakingProjects(deps);

    expect(calls).toEqual([["reel", "p1", "u1"]]);
  });

  it("★★ 광고는 **아직 안 걷힌 것만** 수거한다", async () => {
    const { deps, calls } = harness([{ id: "a1", owner_id: "u1", kind: "ad", ready: false }]);

    await sweepBakingProjects(deps);

    expect(calls).toEqual([["ad", "a1", "u1"]]);
  });

  it("★★★ 마무리가 남은 광고는 **마무리를** 부른다 — 수거를 또 부르지 않는다", async () => {
    // 광고는 두 단이다: 수거가 ad_job.ready 를 적고(가볍다), 마무리가 내려받기·자막·저장을
    // 한다(무겁다 · 상한 300초). 지금까지 그 마무리를 부르는 자리도 **화면뿐**이라
    // (app/api/ads/[id]/status/route.js 의 finish_needed), 창을 닫으면 영원히 rendering 이었다.
    const { deps, calls } = harness([{ id: "a1", owner_id: "u1", kind: "ad", ready: true }]);

    await sweepBakingProjects(deps);

    expect(calls).toEqual([["finish", "a1", "u1"]]);
  });

  it("★★★ 무거운 마무리는 **한 회차에 한 편만** 한다", async () => {
    // 1분마다 도는데 마무리 하나가 300초까지 걸릴 수 있다. 한 회차에 여럿을 마무리하면
    // 다음 크론이 그 위에 겹쳐 쌓인다. 쌓인 것은 다음 분에 하나씩 풀린다.
    // ★ 가벼운 수거는 상한이 없다 — fal 상태 한 번과 문서 쓰기 한 번뿐이다.
    const { deps, calls } = harness([
      { id: "a1", owner_id: "u1", kind: "ad", ready: true },
      { id: "a2", owner_id: "u1", kind: "ad", ready: true },
      { id: "p1", owner_id: "u1", kind: "reel" },
      { id: "p2", owner_id: "u2", kind: "reel" },
    ]);

    await sweepBakingProjects(deps);

    expect(calls.filter((c) => c[0] === "finish"), "마무리를 여럿 했다").toHaveLength(1);
    expect(calls.filter((c) => c[0] === "reel"), "가벼운 수거까지 줄였다").toHaveLength(2);
  });
});

describe("쓸기 — 누구의 이름으로 걷는가", () => {
  it("★★★ 각 편을 **그 소유자의 이름으로** 걷는다", async () => {
    // ⚠️ 이것을 빼면 크론이 **한 편도 못 걷는다.** 수거 경로가 비용을 적는데
    //   (lib/i2v.js 의 addRecord `user: costActor()`), costActor 는 컨텍스트가 없으면
    //   **던진다**(lib/actor.js — "없으면 기본값으로 떨어지면 안 된다"가 그 파일의 규칙).
    //   크론에는 로그인한 사람이 없으니 여기서 세워 주지 않으면 전부 failed 로 샌다.
    // ★ 그리고 **크론의 이름이 아니라 소유자의 이름**이어야 한다 — 원장이 답해야 하는
    //   질문은 "누가 돈을 냈나"이고, 그 답은 걷는 시점이 아니라 **주문한 사람**이다.
    const { currentActor } = await import("../lib/actor.js");
    const seen = [];
    await sweepBakingProjects({
      store: {
        selectBakingProjects: async () => [
          { id: "p1", owner_id: "owner-1", kind: "reel" },
          { id: "p2", owner_id: "owner-2", kind: "reel" },
        ],
      },
      collectReelOneShot: async () => { seen.push(currentActor()); },
      collectAdRender: async () => {},
      finishAdRender: async () => {},
    });

    expect(seen).toEqual(["owner-1", "owner-2"]);
  });

  it("★★ 소유자가 없는 옛 편은 **크론 이름으로** 걷는다 — 던지지 않는다", async () => {
    // 인증이 붙기 전 문서는 owner_id 가 null 이다. runWithActor 는 빈 주체를 거부하므로
    // (lib/actor.js) 여기서 이름을 주지 않으면 그 편들이 영원히 안 걷힌다.
    const { currentActor } = await import("../lib/actor.js");
    let seen = null;
    const out = await sweepBakingProjects({
      store: { selectBakingProjects: async () => [{ id: "old", owner_id: null, kind: "reel" }] },
      collectReelOneShot: async () => { seen = currentActor(); },
      collectAdRender: async () => {},
      finishAdRender: async () => {},
    });

    expect(seen).toBe("cron");
    expect(out.failed, "옛 편에서 던졌다").toBe(0);
  });
});

describe("쓸기 — 한 편이 죽어도 나머지를 걷는다", () => {
  it("★★★ 앞 편이 던져도 뒤 편을 계속 걷는다", async () => {
    // 크론은 한 번에 여러 편을 훑는다. 첫 편에서 터져 나가면 나머지는 **다음 분에도**
    // 같은 자리에서 또 막힌다 — 한 편이 영원히 줄을 세운다.
    const calls = [];
    const out = await sweepBakingProjects({
      store: {
        selectBakingProjects: async () => [
          { id: "bad", owner_id: "u1", kind: "reel" },
          { id: "good", owner_id: "u1", kind: "reel" },
        ],
      },
      collectReelOneShot: async (id) => {
        if (id === "bad") throw new Error("fal 이 죽었다");
        calls.push(id);
        return { changed: true };
      },
      collectAdRender: async () => {},
      finishAdRender: async () => {},
    });

    expect(calls, "앞 편이 던지자 뒤 편을 안 걷었다").toEqual(["good"]);
    expect(out.failed).toBe(1);
    expect(out.swept).toBe(2);
  });
});

// ── 셀렉터 — 무엇을 "굽는 중"으로 볼 것인가 ─────────────────────────────────
//
// ★★★ 이것이 이 기능에서 **가장 위험한 자리**다. 1분마다 도는 조회라, 여기서 문서를
//   통째로 읽으면 하루 1,440번 읽는다. 2026-09-07 에 Supabase 무료 전송량(5GB/월)을
//   다 써서 **프로젝트가 402 로 통째로 막히고 서비스가 죽었다** — 그 사고의 구조가
//   바로 "자주 도는 자리가 무겁다"였다.

const put = (doc, owner = "u1") => memoryStore.insertProject(doc, owner);

describe("셀렉터 — 접수증이 있는 편만 고른다", () => {
  it("★★ reel 은 접수증이 있을 때만 고른다", async () => {
    await put({ id: "baking", kind: "reel", reel: { job: { requestId: "r1" } } });
    await put({ id: "idle", kind: "reel", reel: { status: "done" } });
    await put({ id: "never", kind: "reel" });

    const rows = await memoryStore.selectBakingProjects();

    expect(rows.map((r) => r.id)).toEqual(["baking"]);
    expect(rows[0]).toMatchObject({ id: "baking", owner_id: "u1", kind: "reel" });
  });

  it("★★ 광고는 **굽는 중일 때만** 고른다 — 접수증이 남아 있어도 상태가 아니면 아니다", async () => {
    // collectAdRender 자신이 `status !== "rendering"` 이면 fal 에 묻지도 않는다
    // (lib/ad/pipeline.js). 셀렉터가 그보다 넓으면 1분마다 헛도는 행이 생긴다.
    await put({ id: "a-baking", kind: "ad", status: "rendering", ad_job: { requestId: "r1" } });
    await put({ id: "a-done", kind: "ad", status: "done", ad_job: { requestId: "r2" } });

    const rows = await memoryStore.selectBakingProjects();

    expect(rows.map((r) => r.id)).toEqual(["a-baking"]);
  });

  it("★★★ 마무리가 남은 광고는 `ready` 로 표시해서 준다", async () => {
    // 쓸기가 수거와 마무리를 가르는 근거다. 여기서 안 실어 보내면 쓸기가 문서를 한 번 더
    // 읽어야 하고, 그것이 곧 1분마다 도는 추가 조회가 된다.
    await put({ id: "a-ready", kind: "ad", status: "rendering", ad_job: { requestId: "r1", ready: { url: "u" } } });

    const rows = await memoryStore.selectBakingProjects();

    expect(rows).toEqual([{ id: "a-ready", owner_id: "u1", kind: "ad", ready: true }]);
  });

  it("★★★ 굽는 편이 없으면 **빈 배열**이다 — 없음을 null 로 주지 않는다", async () => {
    await put({ id: "idle", kind: "reel" });

    expect(await memoryStore.selectBakingProjects()).toEqual([]);
  });
});

describe("셀렉터 — 전송량 (09-07 사고를 되풀이하지 않는다)", () => {
  const src = readFileSync("lib/store/supabase.js", "utf8");
  const fn = src.slice(src.indexOf("async selectBakingProjects"), src.indexOf("async selectBakingProjects") + 1200);

  it("★★★ **doc 통짜를 안 읽는다** — 1분마다 도는 조회다", () => {
    expect(fn, "셀렉터가 없다").toBeTruthy();
    expect(fn, "doc 을 통째로 골랐다 — 하루 1,440번 읽힌다").not.toMatch(/select\([^)]*(^|[^>-])\bdoc\b\s*[,"]/);
  });

  it("★★★ **거르기를 DB 에 맡긴다** — 다 받아 와서 코드로 거르면 읽은 값은 이미 다 나갔다", () => {
    expect(fn, "접수증 있는 편만 고르는 필터가 없다").toMatch(/requestId/);
    expect(fn, "굽는 중인 광고만 고르는 조건이 없다").toMatch(/rendering/);
  });

  it("★★★ 없음 판정은 **`->>`(텍스트)로 한다** — `->` 는 JSON null 을 null 로 안 본다", () => {
    // ⚠️⚠️ 이 저장소는 접수증을 지울 때 **JSON null 을 쓴다**(lib/ad/pipeline.js 의
    //   `ad_job: null` · lib/reel 의 `job: null`). Postgres 에서
    //     '{"ad_job": null}'::jsonb -> 'ad_job'   →  jsonb 'null'  (SQL NULL 이 **아니다**)
    //     '{"ad_job": null}'::jsonb ->> 'ad_job'  →  SQL NULL      ← 이쪽이라야 걸러진다
    //   `->` 로 물으면 **이미 끝난 광고가 1분마다 딸려 온다** — 크론이 영원히 헛돈다.
    const notFilters = fn.match(/\.not\([^)]*\)/g) || [];
    expect(notFilters.length, "없음 필터가 없다").toBeGreaterThan(0);
    for (const f of notFilters) {
      expect(f, `${f} — \`->\` 로 물으면 JSON null 이 안 걸러진다`).toMatch(/->>/);
    }
  });
});

// ── 문 — 크론만 들어온다 ────────────────────────────────────────────────────
//
// ★★★ 이 문은 **로그인 벽 밖**에 있다(Vercel 크론에는 사람이 없다). 그러니 문을 지키는
//   것은 비밀 하나뿐이다. 열려 있으면 남의 편을 fal 에 실어 나르게 하는 문이 된다.
describe("크론 문 — 비밀이 지킨다", () => {
  const call = async (headers) => {
    const { GET } = await import("../app/api/cron/collect/route.js");
    return GET(new Request("http://x/api/cron/collect", { headers }));
  };

  it("★★★ 비밀이 **안 설정돼 있으면 닫힌다** — 잊었을 때 열리는 쪽이면 안 된다", async () => {
    delete process.env.CRON_SECRET;

    const res = await call({ authorization: "Bearer whatever" });

    expect(res.status).toBe(401);
  });

  it("★★★ 비밀이 틀리면 401 이다", async () => {
    process.env.CRON_SECRET = "right";

    const res = await call({ authorization: "Bearer wrong" });

    expect(res.status).toBe(401);
    delete process.env.CRON_SECRET;
  });

  it("★★ 비밀이 맞으면 쓸고 결과를 돌려준다", async () => {
    process.env.CRON_SECRET = "right";

    const res = await call({ authorization: "Bearer right" });

    expect(res.status).toBe(200);
    // 인메모리에 굽는 편이 없으므로 0 이다 — **fal 을 한 번도 안 불렀다는 뜻**이기도 하다.
    expect(await res.json()).toMatchObject({ swept: 0 });
    delete process.env.CRON_SECRET;
  });
});

describe("배선 — 1분마다 돈다", () => {
  it("★★★ vercel.json 에 1분 크론이 등록돼 있다", () => {
    const cfg = JSON.parse(readFileSync("vercel.json", "utf8"));
    const cron = (cfg.crons || []).find((c) => c.path === "/api/cron/collect");

    expect(cron, "크론이 등록되지 않았다 — 라우트만 있으면 아무도 안 부른다").toBeTruthy();
    expect(cron.schedule, "1분마다가 아니다").toBe("* * * * *");
  });

  it("★★★ 크론 경로가 **로그인 벽에 안 막힌다** — 그리고 그 경로 하나뿐이다", async () => {
    // middleware 의 matcher 가 곧 보안 경계다(그 파일 머리말). 여기에 안 넣으면 Vercel
    // 크론이 307 로 /login 에 튕겨 **아무 일도 안 일어난다** — 09-10 에 표지 정적 파일이
    // 같은 자리에서 307 을 맞았다.
    const { PUBLIC_PATHS, isPublicPath } = await import("../lib/auth/paths.js");

    expect(isPublicPath("/api/cron/collect"), "크론이 로그인 벽에 막힌다").toBe(true);
    // ★ 접두사로 열면 앞으로 생길 크론이 **전부** 자동으로 공개가 된다.
    expect(PUBLIC_PATHS, "경로를 접두사로 열었다").not.toContain("/api/cron");
    expect(isPublicPath("/api/cron/anything-else"), "다음 크론까지 열렸다").toBe(false);
  });
});
