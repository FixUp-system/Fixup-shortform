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
import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { sweepBakingProjects, SWEEP_BUDGET_MS } from "../lib/collect-sweep.js";
import { memoryStore } from "../lib/store/memory.js";
// ★★ 상한은 **프로덕션 저장소에 산다**(전송량을 막는 자리가 거기다). 인메모리에도 같은
//   이름의 상수가 있지만 **저장소끼리 import 하지 않는다** — 그렇게 하면 vitest.setup.js 를
//   통해 `@supabase/supabase-js` 가 다른 판의 vi.mock 보다 먼저 로드돼 판 36개가 죽는다(실측).
//   대신 **여기서 프로덕션 값을 가져와 인메모리 결과를 잰다** — 두 숫자가 갈리면 빨개진다.
import { BAKING_LIMIT } from "../lib/store/supabase.js";
import { FILM_MODES } from "../lib/film/mode.js";

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
    // ★ film 은 인자가 넷이다 — **방식(mode)** 이 붙는다. 한 프로젝트가 두 편을 나란히
    //   굽는 것이 이 경로의 정상 흐름이라(lib/film/doc.js), 방식을 안 넘기면 어느 편을
    //   걷는지 정할 수가 없다.
    collectFilmRender: async (id, owner, mode) => { calls.push(["film", id, owner, mode]); return { changed: true }; },
    finishFilmRender: async (id, owner, mode) => { calls.push(["film-finish", id, owner, mode]); return { finished: true }; },
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

// ── film — 통째로 빠져 있던 갈래 ───────────────────────────────────────────
//
// ★★★ 2026-09-10 저녁. 셀렉터가 아는 종류가 **reel 과 ad 둘뿐**이었다. 그런데 필름은
//   광고와 **같은 구조**다: startFilmRender(접수) → collectFilmRender(수거) →
//   finishFilmRender(마무리). 그리고 collectFilmRender 머리말에 남는 성질이 글자 그대로
//   적혀 있었다 — **"아무도 안 두드리면 수거도 안 된다."** 즉 필름은 창을 닫으면
//   광고·reel 과 똑같이 앉은 채 남는데, 크론이 그것을 **찾지도 못했다.**
//
// ★ 필름의 어려운 점: 한 프로젝트가 **방식 둘**(films.order · films.refs)을 나란히 굽는다.
//   그래서 접수증도 상태도 마무리 표시도 전부 `films[mode]` 안에 따로 산다 —
//   행 하나가 프로젝트 하나가 아니라 **프로젝트×방식**이다.
describe("쓸기 — film 갈래", () => {
  it("★★★ film 수거는 **방식(mode)까지** 넘겨서 부른다", async () => {
    const { deps, calls } = harness([
      { id: "f1", owner_id: "u1", kind: "film", mode: "refs", ready: false },
    ]);

    await sweepBakingProjects(deps);

    expect(calls).toEqual([["film", "f1", "u1", "refs"]]);
  });

  it("★★★ 한 프로젝트의 **두 방식을 따로** 걷는다 — 행이 둘이다", async () => {
    // 한쪽만 걷으면 나머지 한 편이 영원히 "만드는 중"이다. 상태 라우트가 방식을 돌며
    // 수거하는 것과 같은 이유다(app/api/film/[id]/status/route.js).
    const { deps, calls } = harness([
      { id: "f1", owner_id: "u1", kind: "film", mode: "order", ready: false },
      { id: "f1", owner_id: "u1", kind: "film", mode: "refs", ready: false },
    ]);

    await sweepBakingProjects(deps);

    expect(calls).toEqual([
      ["film", "f1", "u1", "order"],
      ["film", "f1", "u1", "refs"],
    ]);
  });

  it("★★★ 마무리가 남은 방식은 **마무리를** 부른다 — 수거를 또 부르지 않는다", async () => {
    // 필름도 두 단이다: 수거가 job.ready 를 적고(가볍다), 마무리가 내려받기·자막·저장을
    // 한다(무겁다 · 전용 라우트 상한 300초). 마무리를 부르는 자리도 화면뿐이었다.
    const { deps, calls } = harness([
      { id: "f1", owner_id: "u1", kind: "film", mode: "refs", ready: true },
    ]);

    await sweepBakingProjects(deps);

    expect(calls).toEqual([["film-finish", "f1", "u1", "refs"]]);
  });

  it("★★ 소유자가 없는 옛 film 도 **크론 이름으로** 걷는다", async () => {
    const { deps, calls } = harness([
      { id: "f1", owner_id: null, kind: "film", mode: "refs", ready: false },
    ]);

    const out = await sweepBakingProjects(deps);

    expect(calls).toEqual([["film", "f1", "cron", "refs"]]);
    expect(out.failed).toBe(0);
  });

  it("★★★ 무거운 마무리 몫은 **광고와 한 통**이다 — 회차에 하나", async () => {
    // 예산을 갈래마다 따로 두면 회차마다 최대 두 편(광고 1 + 필름 1)이 마무리되고,
    // 둘 다 내려받기 + ffmpeg 라 300초 상한을 함께 넘길 수 있다.
    const { deps, calls } = harness([
      { id: "a1", owner_id: "u1", kind: "ad", ready: true },
      { id: "f1", owner_id: "u1", kind: "film", mode: "refs", ready: true },
    ]);

    await sweepBakingProjects(deps);

    expect(calls.filter((c) => c[0] === "finish" || c[0] === "film-finish")).toHaveLength(1);
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

describe("쓸기 — **진짜 경로**로 한 번 지나간다 (스텁이 가린 자리)", () => {
  it("★★★ 소유자 없는 옛 편도 **실제로 걷힌다** — 스텁 없이 lib/projects 를 지난다", async () => {
    // ⚠️⚠️ 위 판들은 수거 함수를 **스텁으로 갈아 끼운다.** 그래서 `getProject` 가
    //   소유자를 어떻게 다루는지 한 번도 안 지났고, 그 사이에 진짜 결함이 숨어 있었다:
    //     ownerScope(null) → requireOwner(null) → **던진다**  (lib/projects.js:30-42)
    //   role 검사보다 **먼저** 던지므로, 크론이 "cron" 이라는 이름을 세워도 소용이 없다.
    //   그러면 collectReelOneShot 안의 `.catch(() => null)` 이 그것을 삼켜
    //   `{changed:false}` 로 조용히 나가고, 쓸기는 그것을 **성공으로 셌다**.
    // ★ 이 판은 그래서 **진짜 수거 함수**를 쓴다. fal 경계만 막는다(돈도 회선도 안 쓴다).
    const { collectReelOneShot } = await import("../lib/reel/pipeline.js");
    await memoryStore.insertProject(
      { id: "old", kind: "reel", cuts: [{ idx: 0 }], reel: { job: { requestId: "r1", of: "각인" } } },
      null,
    );
    let asked = false;

    const out = await sweepBakingProjects({
      store: { selectBakingProjects: async () => [{ id: "old", owner_id: null, kind: "reel" }] },
      collectReelOneShot: (id, owner) =>
        collectReelOneShot(id, owner, {
          // fal 은 안 부른다 — "아직 안 끝났다"만 답한다. 여기까지 왔다는 것이 곧 증거다.
          collectClip: async () => { asked = true; return { done: false }; },
        }),
      collectAdRender: async () => {},
      finishAdRender: async () => {},
    });

    expect(asked, "소유자가 없다고 fal 에 묻지도 못하고 되돌아왔다").toBe(true);
    expect(out.collected, "걷지도 못했는데 걷었다고 셌다").toBe(1);
  });

  it("★★★ film 도 **진짜 수거 함수**를 한 번은 지난다 — 방식이 실제로 닿는가", async () => {
    // ⚠️ 위 film 판들은 전부 스텁이다. 스텁은 "맞는 인자로 불렀는가"만 재고,
    //   그 인자가 **실제 수거 안에서 쓸모가 있는가**는 못 잰다. collectFilmRender 는
    //   isFilmMode(mode) 가 아니면 fal 에 묻지도 않고 그대로 돌아가므로(lib/film/pipeline.js),
    //   셀렉터가 mode 를 빠뜨리거나 오타로 실으면 **조용히 아무 일도 안 일어난다** —
    //   그런데 쓸기는 그것을 성공으로 센다(수거가 던지지 않는 함수라서).
    // ★ fal 경계만 막는다(collectAdVideo). 돈도 회선도 안 쓴다.
    const { collectFilmRender } = await import("../lib/film/pipeline.js");
    await memoryStore.insertProject(
      {
        id: "film-old",
        kind: "film",
        scenario: { text: "x", shots: [{ line: "안녕하세요", seconds: 15, shows: "A rabbit" }] },
        films: {
          refs: {
            status: "rendering",
            images: [{ key: "shot-1", url: "https://fal.example/a.png" }],
            job: { requestId: "f1", startedAt: Date.now(), seconds: 15 },
          },
        },
      },
      null,
    );
    let askedMode = null;

    const out = await sweepBakingProjects({
      store: {
        selectBakingProjects: async () => [
          { id: "film-old", owner_id: null, kind: "film", mode: "refs", ready: false },
        ],
      },
      collectFilmRender: (id, owner, mode) =>
        collectFilmRender(id, owner, mode, {
          // fal 은 안 부른다 — "아직 안 끝났다"만 답한다. 여기까지 왔다는 것이 곧 증거다.
          collectAdVideo: async () => { askedMode = mode; return { done: false }; },
        }),
      collectReelOneShot: async () => {},
      collectAdRender: async () => {},
      finishAdRender: async () => {},
      finishFilmRender: async () => {},
    });

    expect(askedMode, "방식이 진짜 수거까지 못 닿았다 — fal 에 묻지도 못했다").toBe("refs");
    expect(out.collected).toBe(1);
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

// ── 안전장치 — 크론에는 지켜보는 사람이 없다 ───────────────────────────────
//
// ★★★ 2026-09-10 저녁에 본 네 구멍. 전부 "한 회차가 얼마나 커질 수 있나"와
//   "커졌을 때 무엇이 보이나"의 문제다:
//     ① 셀렉터에 상한도 정렬도 없다 — 접수증이 남은 편이 무제한으로 딸려 온다
//     ② 행 순서가 [...reels, ...ads] 로 고정 — reel 을 다 걷어야 광고 마무리에 닿는다
//     ③ 회차 예산이 없다 — 라우트 상한(300초)뿐인데 마무리 한 편이 그것을 거의 다 쓴다
//     ④ 실패에 id 도 사유도 안 남는다 — 로그가 유일한 창인데 숫자 한 줄이 전부였다
describe("쓸기 — 무거운 마무리를 **먼저** 훑는다", () => {
  it("★★★ 가벼운 수거가 앞에 줄 서 있어도 마무리가 먼저다", async () => {
    // ⚠️ 이것이 없으면 회차 예산에 걸리는 것은 **언제나 마무리**다. 그런데 마무리는
    //   값(크레딧)이 이미 나갔고 fal 에서도 이미 다 구워진 편이라, 남은 것은 우리 쪽
    //   내려받기뿐이다 — 가장 늦게 닿아야 할 일이 아니라 가장 먼저 닿아야 할 일이다.
    const { deps, calls } = harness([
      { id: "p1", owner_id: "u1", kind: "reel" },
      { id: "p2", owner_id: "u1", kind: "reel" },
      { id: "a1", owner_id: "u1", kind: "ad", ready: true },
    ]);

    await sweepBakingProjects(deps);

    expect(calls[0], "마무리가 가벼운 수거 뒤로 밀렸다").toEqual(["finish", "a1", "u1"]);
  });

  it("★★ 마무리끼리는 셀렉터가 준 순서(오래된 것 먼저)를 지킨다", async () => {
    // 정렬은 **안정**이라야 한다 — 셀렉터가 오래된 것부터 주는데 여기서 뒤섞으면
    // 그 노력이 사라지고, 상한에 걸린 편이 매 회차 다른 편에게 자리를 뺏긴다.
    const { deps, calls } = harness([
      { id: "a1", owner_id: "u1", kind: "ad", ready: true },
      { id: "a2", owner_id: "u1", kind: "ad", ready: true },
    ]);

    await sweepBakingProjects(deps);

    expect(calls).toEqual([["finish", "a1", "u1"]]);
  });
});

describe("쓸기 — 회차 예산", () => {
  it("★★★ 예산을 넘기면 남은 편은 **다음 회차로** 넘긴다 — 부르지 않는다", async () => {
    // 라우트 상한은 300초다(크론·웹훅 둘 다). 거기서 잘리면 그 자리에서 죽는데,
    // 하필 무거운 마무리가 잠금을 쥔 채 죽으면 그 편은 잠금 수명(6분) 동안 아무도
    // 못 건드린다. 그러니 **잘리기 전에 우리가 멈춘다.**
    const { deps, calls } = harness([
      { id: "p1", owner_id: "u1", kind: "reel" },
      { id: "p2", owner_id: "u1", kind: "reel" },
      { id: "p3", owner_id: "u1", kind: "reel" },
    ]);
    // 한 편 걷을 때마다 예산의 절반이 넘게 흐른 것으로 친다.
    let t = 0;
    const step = Math.floor(SWEEP_BUDGET_MS / 2) + 1;

    const out = await sweepBakingProjects({ ...deps, now: () => (t += step) });

    expect(calls, "예산을 넘겨서도 계속 걷었다").toHaveLength(1);
    expect(out.skipped, "넘긴 편을 안 세었다").toBe(2);
    // ★ 넘긴 것은 **실패가 아니다** — 다음 회차가 그대로 이어받는다.
    expect(out.failed).toBe(0);
  });

  it("★★ 예산 안이면 전부 걷는다 — 예산이 평소 흐름을 막지 않는다", async () => {
    const { deps, calls } = harness([
      { id: "p1", owner_id: "u1", kind: "reel" },
      { id: "p2", owner_id: "u1", kind: "reel" },
    ]);

    const out = await sweepBakingProjects(deps);

    expect(calls).toHaveLength(2);
    expect(out.skipped).toBe(0);
  });
});

describe("쓸기 — 실패를 로그에 남긴다", () => {
  it("★★★ **종류·id·방식·사유**를 남긴다 — 숫자 한 줄로는 아무것도 못 고친다", async () => {
    // 크론에는 결과를 볼 사람이 없어 Vercel 로그가 유일한 창이다. 그런데 지금까지
    // 남는 것은 `{"swept":N,"failed":3}` 뿐이었다 — 어느 편이 왜 막혔는지 알 길이 없고,
    // 문서의 error 는 **수거가 거기까지 갔을 때만** 적힌다(주체 세우기에서 던지면 안 적힌다).
    const seen = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => seen.push(a.map(String).join(" ")));

    try {
      await sweepBakingProjects({
        store: {
          selectBakingProjects: async () => [
            { id: "f1", owner_id: "u1", kind: "film", mode: "refs", ready: false },
          ],
        },
        collectFilmRender: async () => { throw new Error("fal 이 죽었다"); },
        collectReelOneShot: async () => {},
        collectAdRender: async () => {},
        finishAdRender: async () => {},
        finishFilmRender: async () => {},
      });
    } finally {
      spy.mockRestore();
    }

    const line = seen.join("\n");
    expect(line, "실패를 로그에 안 남겼다").toBeTruthy();
    expect(line, "어느 편인지 안 남겼다").toContain("f1");
    expect(line, "어느 종류인지 안 남겼다").toContain("film");
    expect(line, "어느 방식인지 안 남겼다").toContain("refs");
    expect(line, "왜 막혔는지 안 남겼다").toContain("fal 이 죽었다");
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

// ── 셀렉터 — film (방식마다 한 행) ────────────────────────────────────────
//
// ★★★ 필름은 접수증이 `doc.films[mode].job` 에, 굽는 중 표시가 `doc.films[mode].status`
//   에 산다. **문서 맨 위의 status 가 아니다** — 그쪽은 film 에서 "draft"·"scenario" 에
//   머물고 굽기와 무관하다(app/api/film/[id]/scenario/route.js 가 마지막으로 적는다).
//   광고를 흉내 내어 status 컬럼을 보면 **한 편도 안 걸린다.**
const filmDoc = (id, films) => ({ id, kind: "film", status: "scenario", films });
const baking = (extra = {}) => ({
  status: "rendering",
  job: { requestId: "r1", startedAt: 1, seconds: 15, ...(extra.job || {}) },
});

describe("셀렉터 — film 은 방식마다 한 행이다", () => {
  it("★★★ 두 방식이 나란히 구우면 **행이 둘**이고, 각 행에 mode 가 실린다", async () => {
    // 이것이 이 갈래의 전부다 — mode 가 없으면 collectFilmRender 를 부를 수가 없고,
    // 프로젝트당 한 행으로 접으면 나머지 한 편이 영원히 안 걷힌다.
    await put(filmDoc("f1", { order: baking(), refs: baking() }));

    const rows = await memoryStore.selectBakingProjects();

    expect(rows).toEqual([
      { id: "f1", owner_id: "u1", kind: "film", mode: "order", ready: false },
      { id: "f1", owner_id: "u1", kind: "film", mode: "refs", ready: false },
    ]);
  });

  it("★★ 굽는 방식만 고른다 — 끝난 방식·접수 전 방식은 안 나온다", async () => {
    // collectFilmRender 자신이 `!job || status !== "rendering"` 이면 fal 에 묻지도 않는다.
    // 셀렉터가 그보다 넓으면 1분마다 헛도는 행이 생긴다(광고와 같은 규율).
    await put(filmDoc("f1", {
      order: { status: "done", video: { url: "u" }, job: null },
      refs: baking(),
    }));
    await put(filmDoc("f2", { refs: { status: "images", images: [{ key: "s1" }] } }));

    const rows = await memoryStore.selectBakingProjects();

    expect(rows.map((r) => `${r.id}:${r.mode}`)).toEqual(["f1:refs"]);
  });

  it("★★★ 마무리가 남은 방식은 `ready` 로 표시해서 준다", async () => {
    await put(filmDoc("f1", { refs: baking({ job: { ready: { url: "u", seconds: 15 } } }) }));

    const rows = await memoryStore.selectBakingProjects();

    expect(rows).toEqual([{ id: "f1", owner_id: "u1", kind: "film", mode: "refs", ready: true }]);
  });

  it("★★ 방식 표(FILM_MODES)를 돌아서 만든다 — 방식이 늘어도 셀렉터는 안 고친다", async () => {
    const films = {};
    for (const m of FILM_MODES) films[m.id] = baking();
    await put(filmDoc("f1", films));

    const rows = await memoryStore.selectBakingProjects();

    expect(rows.map((r) => r.mode)).toEqual(FILM_MODES.map((m) => m.id));
  });
});

describe("셀렉터 — 상한과 순서 (무제한으로 딸려 오지 않는다)", () => {
  it("★★★ 한 회차에 **상한만큼만** 준다", async () => {
    // ⚠️ 상한이 없으면 접수증이 남은 편 수만큼 무제한으로 딸려 온다. 한 행은 작지만
    //   (id·owner_id·판정 한 조각) 1분마다 × 하루 1,440번이라 행 수가 그대로 곱해진다 —
    //   09-07 사고의 구조가 정확히 "자주 도는 자리가 무겁다"였다.
    for (let i = 0; i < BAKING_LIMIT + 3; i += 1) {
      await put({ id: `r${i}`, kind: "reel", reel: { job: { requestId: `q${i}` } } });
    }

    const rows = await memoryStore.selectBakingProjects();

    expect(rows).toHaveLength(BAKING_LIMIT);
  });

  it("★★★ **오래 안 건드린 편 먼저** 준다 — 상한에 걸려도 굶는 편이 없다", async () => {
    // 상한만 있고 순서가 없으면 뒤쪽 편은 영원히 상한 밖에 남는다. 걷어서 무언가
    // 바뀐 편은 문서가 다시 쓰이므로 저절로 맨 뒤로 간다 — 그래서 한 바퀴가 돈다.
    await put({ id: "first", kind: "reel", reel: { job: { requestId: "q1" } } });
    await put({ id: "second", kind: "reel", reel: { job: { requestId: "q2" } } });
    expect((await memoryStore.selectBakingProjects()).map((r) => r.id)).toEqual(["first", "second"]);

    const cur = await memoryStore.selectProject("first", "u1");
    await memoryStore.updateProjectRow("first", "u1", cur.version, cur.doc);

    expect(
      (await memoryStore.selectBakingProjects()).map((r) => r.id),
      "방금 건드린 편이 여전히 맨 앞이다",
    ).toEqual(["second", "first"]);
  });
});

describe("셀렉터 — 한 편만 물어볼 수 있다 (웹훅)", () => {
  it("★★★ 상한이 생긴 뒤로는 **거르기도 DB 에 맡겨야** 한다", async () => {
    // ⚠️ 웹훅은 "이 편을 지금 걷어라"는 방아쇠다(app/api/fal/webhook/route.js).
    //   그런데 쓸기가 목록을 다 받아 와서 코드로 거르던 시절에, 상한을 붙이는 순간
    //   **찾는 편이 상한 밖에 있으면 아예 안 걷히는** 조용한 구멍이 생긴다.
    //   그래서 셀렉터가 id 를 받는다 — 값도 같이 준다(행 하나만 온다).
    for (let i = 0; i < BAKING_LIMIT + 3; i += 1) {
      await put({ id: `r${i}`, kind: "reel", reel: { job: { requestId: `q${i}` } } });
    }
    const last = `r${BAKING_LIMIT + 2}`;

    const rows = await memoryStore.selectBakingProjects({ projectId: last });

    expect(rows.map((r) => r.id), "상한 밖의 편을 못 찾았다").toEqual([last]);
  });
});

// ⚠️⚠️ **주석을 먼저 걷는다.** 아래 판들은 소스를 문자열로 재는데, 이 저장소의 주석은
//   실제 코드 조각을 인용한다(설명하려면 인용해야 한다 — 바로 아래 `->` 이야기가 그렇다).
//   안 걷으면 판이 **설명을 코드로 착각한다**: 주석 하나 때문에 멀쩡한 코드가 빨갛거나,
//   더 나쁘게는 주석이 필터를 대신 만족시켜 **고치지 않아도 초록**이 된다.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// 함수 하나를 **통째로** 떠낸다.
// ★ 글자 수로 자르던 시절(`slice(start, start + 1200)`)에는 함수가 자라는 순간 판이 뒷부분을
//   못 봤다 — film 갈래를 더하면서 실제로 그 자리에 닿았다. 중괄호를 세는 쪽은 안 낡는다.
// ⚠️ 인자에도 중괄호가 온다(`selectBakingProjects({ projectId } = {})`). 그냥 첫 `{` 부터
//   세면 **인자 하나만 떠내고 몸통을 통째로 놓친다** — 판이 전부 초록으로 뒤집힌다.
//   그래서 괄호가 닫힌 뒤의 첫 `{` 를 몸통의 시작으로 본다.
const fnOf = (src, head) => {
  const start = src.indexOf(head);
  if (start < 0) return "";
  let paren = 0;
  let i = start;
  for (; i < src.length; i += 1) {
    if (src[i] === "(") paren += 1;
    else if (src[i] === ")") paren -= 1;
    else if (src[i] === "{" && paren === 0) break;
  }
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}" && (depth -= 1) === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
};

describe("셀렉터 — 전송량 (09-07 사고를 되풀이하지 않는다)", () => {
  const fn = fnOf(stripComments(readFileSync("lib/store/supabase.js", "utf8")), "async selectBakingProjects");

  it("★★★ **doc 통짜를 안 읽는다** — 1분마다 도는 조회다", () => {
    expect(fn, "셀렉터가 없다").toBeTruthy();
    expect(fn, "doc 을 통째로 골랐다 — 하루 1,440번 읽힌다").not.toMatch(/select\([^)]*(^|[^>-])\bdoc\b\s*[,"`]/);
  });

  it("★★★ **거르기를 DB 에 맡긴다** — 다 받아 와서 코드로 거르면 읽은 값은 이미 다 나갔다", () => {
    expect(fn, "접수증 있는 편만 고르는 필터가 없다").toMatch(/requestId/);
    expect(fn, "굽는 중인 광고만 고르는 조건이 없다").toMatch(/rendering/);
    expect(fn, "film 갈래를 DB 에 안 물었다").toMatch(/films/);
  });

  it("★★★ 없음 판정은 **`->>`(텍스트)로 한다** — `->` 는 JSON null 을 null 로 안 본다", () => {
    // ⚠️⚠️ 이 저장소는 접수증을 지울 때 **JSON null 을 쓴다**(lib/ad/pipeline.js 의
    //   ad_job, lib/film·lib/reel 의 job). Postgres 에서 jsonb 의 화살표 둘이 다르다:
    //     한 화살표로 물으면 jsonb 의 null 이 그대로 와서 SQL NULL 이 **아니고**,
    //     두 화살표(텍스트)로 물어야 SQL NULL 로 떨어져 걸러진다.
    //   한 화살표로 물으면 **이미 끝난 편이 1분마다 딸려 온다** — 크론이 영원히 헛돈다.
    const notFilters = fn.match(/\.not\([^)]*\)/g) || [];
    expect(notFilters.length, "없음 필터가 없다").toBeGreaterThan(0);
    for (const f of notFilters) {
      expect(f, `${f} — 화살표 하나로 물으면 JSON null 이 안 걸러진다`).toMatch(/->>/);
    }
  });

  it("★★★ 갈래를 **하나도 빠짐없이** 상한·정렬에 태운다", () => {
    // ⚠️ 상한과 정렬을 질의마다 손으로 붙이면 다음에 갈래를 더하는 사람이 한 줄을
    //   빠뜨리고, 그 갈래만 조용히 무제한이 된다. 한 헬퍼를 지나게 해서 세어 본다.
    expect(fn, "상한이 없다 — 접수증이 남은 편이 무제한으로 딸려 온다").toMatch(/\.limit\(/);
    expect(fn, "오래된 것 우선 정렬이 없다").toMatch(/\.order\(\s*"updated_at"/);
    const queries = fn.match(/db\(\)\.from\("projects"\)/g) || [];
    const capped = fn.match(/capped\(\s*db\(\)\.from\("projects"\)/g) || [];
    expect(queries.length, "프로젝트 질의가 없다").toBeGreaterThan(0);
    expect(capped.length, "상한·정렬을 안 지나는 질의가 있다").toBe(queries.length);
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
  // ★★★ 2026-09-10 **저녁 — 크론 등록을 뺐다. 이 계정이 Hobby 라서다.**
  //   배포가 통째로 거부됐다(실측 그대로):
  //     "Hobby accounts are limited to daily cron jobs.
  //      This cron expression (* * * * *) would run more than once per day."
  //   즉 한 줄 때문에 **다른 18커밋까지 못 올라갔다.** 그래서 등록만 빼고 라우트는 남긴다 —
  //   Pro 로 올리거나 외부 스케줄러를 붙이면 그날 바로 산다.
  // ★ 그러므로 이 판은 "등록돼 있다"가 아니라 **"등록한다면 1분이어야 한다"** 를 지킨다.
  //   등록이 없는 지금도 통과하고, 되살릴 때 엉뚱한 주기로 넣으면 잡는다.
  it("★★★ 크론을 등록한다면 **1분**이어야 한다 (지금은 Hobby 라 등록이 없다)", () => {
    const cfg = JSON.parse(readFileSync("vercel.json", "utf8"));
    const cron = (cfg.crons || []).find((c) => c.path === "/api/cron/collect");
    if (!cron) return;                       // 지금 상태 — Hobby 라 못 건다
    expect(cron.schedule, "1분마다가 아니다").toBe("* * * * *");
  });

  it("★★★ 부르는 문은 **살아 있다** — 등록만 빠졌지 기능이 빠진 게 아니다", () => {
    // 외부 스케줄러(GitHub Actions·cron-job.org)나 Pro 승급이 그대로 이 문을 부른다.
    expect(existsSync("app/api/cron/collect/route.js"), "크론 라우트가 사라졌다").toBe(true);
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
