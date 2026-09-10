// 필름 수거 — **접수증을 함부로 지우지 않는다** (2026-09-10 안정성 리뷰 §1·§3).
//
// ★★★ 광고와 **글자 그대로 같은 구조**다. reel 만 2026-09-02 에 "일시 오류면 접수증을
//   지킨다"를 받았고 광고·필름은 못 받았다 — `catch (e)` 하나가 어떤 오류든
//   `failFilmRender` 로 보내 환불하고 `job: null` 을 찍는다.
//   fal 에 요청 목록 API 가 없으므로(09-10 실측) 그 순간 값을 치른 영상을 영영 잃는다.
//
// ★ 필름은 노출이 **두 배**다 — 한 프로젝트가 방식 둘(order·refs)을 나란히 굽는 것이
//   정상 흐름이라, 흔들림 한 번이 두 편을 동시에 버릴 수 있다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, updateProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { putFilm, filmOf } from "../lib/film/doc.js";
import { collectFilmRender } from "../lib/film/pipeline.js";
import { chargeAd, balanceFor } from "../lib/charges.js";
import { adRenderTimeoutMs, adGiveUpMs } from "../lib/ad/timing.js";

const U = "00000000-0000-4000-8000-0000000000f8";
const MODE = "order";
const SCENARIO = { text: "Vertical 9:16 footage.", shots: [{ line: "안녕하세요", seconds: 15 }] };

async function rendering() {
  await getStore().insertGrant({ user_id: U, amount_credits: 1000, reason: "t" });
  const p = await runWithActor(U, () =>
    createProject({
      ownerId: U, kind: "film",
      material: { text: "라벤더 토끼 인형", photos: [] },
      settings: { seconds: 15, resolution: "480p", model: "seedance-2.0", aspect_ratio: "9:16", narration_lang: "ko" },
    })
  );
  const charged = await chargeAd({
    userId: U, projectId: p.id, seconds: 15, model: "seedance-2.0", resolution: "480p", openNewAttempt: true,
  });
  await runWithActor(U, () =>
    updateProject(p.id, U, (d) =>
      putFilm({ ...d, scenario: SCENARIO }, MODE, {
        status: "rendering",
        job: { requestId: "req-film", seconds: 15, startedAt: 1_000_000, attempt: charged.attempt },
      })
    )
  );
  return p;
}

const jobOf = async (id) => filmOf(await getProject(id, U), MODE).job;

describe("필름 수거 — 일시 오류에 접수증이 산다", () => {
  beforeEach(() => resetMemoryStore());

  for (const [name, msg] of [
    ["네트워크", "fetch failed"],
    ["혼잡", "영상 생성 실패 (429) too many requests"],
    ["제공자 5xx", "영상 생성 실패 (503) unavailable"],
  ]) {
    it(`★★★ ${name} — job 이 남고 **환불하지 않는다**`, async () => {
      const p = await rendering();
      const before = await balanceFor(U);

      await runWithActor(U, () =>
        collectFilmRender(p.id, U, MODE, { collectAdVideo: async () => { throw new Error(msg); } })
      );

      expect((await jobOf(p.id))?.requestId, "접수증을 지웠다").toBe("req-film");
      expect(await balanceFor(U), "일시 오류에 환불했다").toBe(before);
    });
  }

  it("★★ 확정 실패(422)는 **그대로** 환불하고 접수증을 지운다", async () => {
    const p = await rendering();
    const before = await balanceFor(U);

    await runWithActor(U, () =>
      collectFilmRender(p.id, U, MODE, {
        collectAdVideo: async () => { throw new Error("영상 생성 실패 (422) content_policy_violation"); },
      })
    );

    expect(await jobOf(p.id), "확정 실패인데 접수증이 남았다").toBeFalsy();
    expect(await balanceFor(U), "확정 실패인데 환불을 안 했다").toBeGreaterThan(before);
  });
});

describe("필름 수거 — 늦는다고 버리지 않는다", () => {
  beforeEach(() => resetMemoryStore());

  it("★★★ 대기 상한을 넘겨도 **접수증을 지키고 환불하지 않는다**", async () => {
    const p = await rendering();
    const before = await balanceFor(U);

    await runWithActor(U, () =>
      collectFilmRender(p.id, U, MODE, {
        collectAdVideo: async () => ({ done: false }),
        now: () => 1_000_000 + adRenderTimeoutMs(15) + 1,
      })
    );

    expect((await jobOf(p.id))?.requestId, "늦는다고 접수증을 버렸다").toBe("req-film");
    expect(await balanceFor(U), "늦는다고 환불했다").toBe(before);
    expect(filmOf(await getProject(p.id, U), MODE).status, "아직 굽는 중이다").toBe("rendering");
  });

  it("★★★ **포기 상한**을 넘기면 그때는 환불하고 접수증을 지운다", async () => {
    const p = await rendering();
    const before = await balanceFor(U);

    await runWithActor(U, () =>
      collectFilmRender(p.id, U, MODE, {
        collectAdVideo: async () => ({ done: false }),
        now: () => 1_000_000 + adGiveUpMs(15) + 1,
      })
    );

    expect(await jobOf(p.id), "포기했는데 접수증이 남았다").toBeFalsy();
    expect(await balanceFor(U), "포기했는데 환불을 안 했다").toBeGreaterThan(before);
  });
});
