// 굽는 편을 **사람 없이** 걷는다 — 1분 크론이 부르는 자리.
//
// ★★★ 왜 필요한가. 접수는 큐로 즉시 끝나고 결과는 수거가 이어받는데
//   (lib/reel/pipeline.js 의 collectReelOneShot 머리말), 그 수거를 부르는 자리가
//   2026-09-10 까지 **사람이 화면을 열었을 때뿐**이었다. 굽기는 10분이 걸리므로
//   그 사이 창을 닫으면 아무도 안 걷었다 — 프로덕션에 그렇게 앉은 편이 셋 있었다
//   (tests/cron-collect.test.js 머리말에 id 와 실측이 있다).
//
// ★ **화면 밖으로 뺀 이유**: 라우트 안에 두면 값으로 잴 수가 없다. 이 저장소가
//   lib/archive/video.js 를 화면 밖으로 뺀 것과 같은 이유다 — 라우트는 얇게 두고
//   판정은 여기서 한다.
import { getStore } from "./store/index.js";
import { runWithActor } from "./actor.js";
import { collectReelOneShot as collectReelImpl } from "./reel/pipeline.js";
import { collectAdRender as collectAdImpl, finishAdRender as finishAdImpl } from "./ad/pipeline.js";

// 소유자를 모르는 옛 편(인증 전 문서는 owner_id 가 null)의 주체 이름.
// ★ 이름을 안 주면 runWithActor 가 거부해서 그 편들이 **영원히 안 걷힌다**.
const CRON_ACTOR = "cron";

// 한 회차에 마무리할 광고 수. 마무리는 내려받기·자막 굽기·저장이라 상한이 300초인데
// 크론은 1분마다 돈다 — 여럿을 마무리하면 다음 회차가 그 위에 겹쳐 쌓인다.
// 쌓인 것은 다음 분에 하나씩 풀린다(급하지 않다 — 이미 다 구워진 편들이다).
const FINISH_PER_RUN = 1;

export async function sweepBakingProjects(deps = {}) {
  const store = deps.store || getStore();
  const collectReel = deps.collectReelOneShot || collectReelImpl;
  const collectAd = deps.collectAdRender || collectAdImpl;
  const finishAd = deps.finishAdRender || finishAdImpl;

  // ★ 굽는 편이 하나도 없으면 여기서 끝난다 — fal 도 다른 표도 안 두드린다.
  //   1분마다 도는 자리라, 무거우면 그것 자체가 다음 전송량 사고가 된다(09-07).
  const rows = (await store.selectBakingProjects()) || [];

  let collected = 0;
  let finished = 0;
  let failed = 0;
  let finishBudget = FINISH_PER_RUN;

  for (const row of rows) {
    // 이 회차의 마무리 몫을 다 썼으면 **다음 분에** 한다. `continue` 는 아래 콜백 안에서
    // 못 쓰므로 여기서 가른다.
    if (row.kind === "ad" && row.ready && finishBudget <= 0) continue;

    // ★★ 한 편이 던져도 **나머지를 계속 걷는다.** 여기서 새어 나가면 첫 편 하나가
    //   다음 분에도, 그 다음 분에도 뒤의 전부를 줄 세운다.
    try {
      // ★★★ **주체를 세우고 부른다.** 수거 경로가 원장에 비용을 적는데
      //   (lib/i2v.js 의 addRecord `user: costActor()`), costActor 는 컨텍스트가 없으면
      //   던진다 — 크론에는 로그인한 사람이 없으므로 여기가 그 자리다.
      // ★ 이름은 **크론이 아니라 소유자**다. 원장이 답하는 질문은 "누가 돈을 냈나"이고,
      //   그 답은 걷는 시점이 아니라 주문한 사람이다.
      // ★★★ 2026-09-10 고침 — 소유자를 모르는 옛 편은 **운영자 자리로** 부른다.
      //   `ownerScope` 는 역할을 보기 **전에** `requireOwner` 로 던진다(lib/projects.js:30-42).
      //   그래서 이름만 세우고 `getProject(id, null)` 을 부르면 그 안의 `.catch(() => null)`
      //   이 그것을 삼켜 **아무것도 안 걷고 성공으로 세는** 상태가 됐다. 스텁을 쓰는 판이
      //   그 자리를 한 번도 안 지나 초록이었다(tests 의 "진짜 경로" 판이 이제 지난다).
      //   ★ 소유자를 아는 편에는 역할을 안 준다 — 줄 이유가 없고, 주면 소유자 필터가
      //     통째로 걷힌다(넓히는 값은 필요한 자리에만).
      const actor = row.owner_id ? row.owner_id : { id: CRON_ACTOR, role: "admin" };
      await runWithActor(actor, async () => {
        // 광고의 **마무리** — 수거가 ad_job.ready 를 적어 둔 편이다(lib/ad/pipeline.js).
        // ★ 겹침은 finishAdRender 자신의 임대 잠금이 막는다 — 여기서 또 막지 않는다.
        if (row.kind === "ad" && row.ready) {
          finishBudget -= 1;
          await finishAd(row.id, row.owner_id || CRON_ACTOR);
          finished += 1;
          return;
        }
        // 가벼운 수거 — fal 상태 한 번과 문서 쓰기 한 번뿐이라 회차 상한을 두지 않는다.
        if (row.kind === "ad") await collectAd(row.id, row.owner_id || CRON_ACTOR);
        else await collectReel(row.id, row.owner_id || CRON_ACTOR);
        collected += 1;
      });
    } catch {
      // ★ 삼킨다. 크론에는 이 실패를 볼 사람이 없고, 실패는 문서의 error 로 남는다
      //   (수거 함수들이 그렇게 적는다). 여기서 세는 것은 **몇 편이 막혔나**뿐이다.
      failed += 1;
    }
  }

  return { swept: rows.length, collected, finished, failed };
}
