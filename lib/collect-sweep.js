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
//
// ★★ 걷는 갈래가 **셋**이다(2026-09-10 저녁에 film 을 더했다): reel · 광고 · 필름.
//   필름은 광고와 같은 두 단(가벼운 수거 → 무거운 마무리)인데 **방식(mode)** 이 하나 더
//   붙는다 — 한 프로젝트가 두 편을 나란히 굽는다. 그래서 셀렉터가 주는 행은
//   프로젝트가 아니라 **프로젝트×방식**이고, 행에 mode 가 실린다.
//
// ★★ 그리고 이 자리에는 **지켜보는 사람이 없다.** 그래서 안전장치가 넷이다:
//   ① 셀렉터에 상한과 오래된 것 우선 정렬(lib/store/supabase.js 의 BAKING_LIMIT)
//   ② 무거운 마무리를 **맨 앞에** 세운다(아래 ordered)
//   ③ 회차 예산(SWEEP_BUDGET_MS) — 라우트 상한에 잘려 죽기 전에 우리가 멈춘다
//   ④ 실패에 종류·id·방식·사유를 남긴다 — 로그가 유일한 창이다
import { getStore } from "./store/index.js";
import { runWithActor } from "./actor.js";
import { collectReelOneShot as collectReelImpl } from "./reel/pipeline.js";
import { collectAdRender as collectAdImpl, finishAdRender as finishAdImpl } from "./ad/pipeline.js";
// ★ 필름도 같은 구조다(접수 → 수거 → 마무리). 다른 점은 **인자에 방식(mode)이 붙는 것**뿐이다 —
//   한 프로젝트가 films.order·films.refs 두 편을 나란히 굽는 것이 이 경로의 정상 흐름이라
//   (lib/film/doc.js), 어느 편을 걷는지 말하지 않으면 부를 수가 없다.
import { collectFilmRender as collectFilmImpl, finishFilmRender as finishFilmImpl } from "./film/pipeline.js";

// 소유자를 모르는 옛 편(인증 전 문서는 owner_id 가 null)의 주체 이름.
// ★ 이름을 안 주면 runWithActor 가 거부해서 그 편들이 **영원히 안 걷힌다**.
const CRON_ACTOR = "cron";

// 한 회차에 마무리할 편 수. 마무리는 내려받기·자막 굽기·저장이라 상한이 300초인데
// 크론은 1분마다 돈다 — 여럿을 마무리하면 다음 회차가 그 위에 겹쳐 쌓인다.
// 쌓인 것은 다음 분에 하나씩 풀린다(급하지 않다 — 이미 다 구워진 편들이다).
// ★ 몫은 **광고와 필름이 한 통**이다(2026-09-10). 갈래마다 따로 두면 회차마다 최대 두 편이
//   마무리되고, 둘 다 27MB 내려받기 + ffmpeg 라 300초를 함께 넘길 수 있다.
const FINISH_PER_RUN = 1;

// 한 회차의 예산(경과 ms).
//
// ★★★ 왜 필요한가. 지금까지 이 쓸기를 멈추는 것은 **라우트 상한(300초)뿐**이었다. 그런데
//   상한에서 잘리는 것은 "멈추는 것"이 아니라 **그 자리에서 죽는 것**이다 — 하필 무거운
//   마무리가 잠금을 쥔 채 죽으면 그 편은 잠금 수명(광고·필름 둘 다 6분) 동안 아무도 못
//   건드린다. 그러니 잘리기 전에 **우리가** 멈춘다.
// ★ 240초인 이유: 크론과 웹훅 라우트가 둘 다 maxDuration 300 이고, 마지막으로 시작한 일이
//   끝날 여유를 60초 남긴다.
// ⚠️ 이것은 "시작을 막는" 예산이지 "도중에 끊는" 예산이 **아니다.** 이미 시작한 마무리
//   한 편이 혼자 300초를 넘기는 것은 여전히 못 막는다(27MB 내려받기 + ffmpeg). 그래서
//   마무리는 회차에 한 편이고, 아래에서 **맨 앞에** 세운다 — 늦게 시작할수록 잘린다.
export const SWEEP_BUDGET_MS = 240_000;

export async function sweepBakingProjects(deps = {}) {
  const store = deps.store || getStore();
  const collectReel = deps.collectReelOneShot || collectReelImpl;
  const collectAd = deps.collectAdRender || collectAdImpl;
  const finishAd = deps.finishAdRender || finishAdImpl;
  const collectFilm = deps.collectFilmRender || collectFilmImpl;
  const finishFilm = deps.finishFilmRender || finishFilmImpl;
  const now = deps.now || Date.now;

  // ★ 굽는 편이 하나도 없으면 여기서 끝난다 — fal 도 다른 표도 안 두드린다.
  //   1분마다 도는 자리라, 무거우면 그것 자체가 다음 전송량 사고가 된다(09-07).
  // ★★ 웹훅은 **한 편만** 걷는다(sweepOneProject). 그 id 를 **셀렉터에 넘긴다** —
  //   다 받아 와서 여기서 거르던 시절에는 값이 거의 안 들었지만, 셀렉터에 상한이 생긴
  //   뒤로는 그 방식이 **조용한 구멍**이다: 찾는 편이 상한 밖에 있으면 아예 안 걷힌다.
  let rows = (await store.selectBakingProjects({ projectId: deps.only || null })) || [];
  // 셀렉터가 그 옵션을 모르는 구현(옛 스텁)일 수도 있으니 한 겹 더 거른다 — 값이 안 든다.
  if (deps.only) rows = rows.filter((r) => r.id === deps.only);

  // ★★★ **마무리가 남은 편을 맨 앞에 세운다**(2026-09-10). 그전에는 셀렉터가 준 순서
  //   그대로였고 그것이 `[...reels, ...ads]` 라, reel 을 전부 걷은 뒤에야 광고 마무리에
  //   닿았다 — 회차 예산이 생기면 **언제나 마무리가 먼저 잘리는** 순서다. 그런데 마무리는
  //   값(크레딧)이 이미 나갔고 fal 에서도 이미 다 구워진 편이라, 남은 것은 우리 쪽
  //   내려받기·자막·저장뿐이다. 가장 늦게 닿을 일이 아니라 가장 먼저 닿을 일이다.
  // ★ 정렬은 **안정**이라야 한다 — 셀렉터가 오래된 것부터 주는데(store 의 updated_at 정렬)
  //   여기서 뒤섞으면 그 노력이 사라진다. Array#sort 는 안정 정렬이다.
  const ordered = [...rows].sort((a, b) => Number(Boolean(b.ready)) - Number(Boolean(a.ready)));

  let collected = 0;
  let finished = 0;
  let failed = 0;
  let skipped = 0;
  let finishBudget = FINISH_PER_RUN;
  const startedAt = now();

  for (const row of ordered) {
    // 회차 예산을 넘겼으면 **다음 회차로 넘긴다.** 실패가 아니다 — 셀렉터가 오래된 것부터
    // 주므로 넘긴 편이 다음 회차의 앞자리가 된다.
    if (now() - startedAt >= SWEEP_BUDGET_MS) {
      skipped += 1;
      continue;
    }
    // 이 회차의 마무리 몫을 다 썼으면 **다음 분에** 한다. `continue` 는 아래 콜백 안에서
    // 못 쓰므로 여기서 가른다.
    // ★ 몫은 광고·필름이 **한 통**이다. 갈래마다 따로 두면 회차마다 최대 두 편이
    //   마무리되고, 둘 다 내려받기 + ffmpeg 라 300초 상한을 함께 넘길 수 있다.
    if (row.ready && finishBudget <= 0) {
      skipped += 1;
      continue;
    }

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
      const owner = row.owner_id || CRON_ACTOR;
      await runWithActor(actor, async () => {
        // **마무리** — 수거가 ready 를 적어 둔 편이다(광고는 ad_job.ready, 필름은
        // films[mode].job.ready). 무거운 일(내려받기·자막 굽기·저장)이 여기 산다.
        // ★ 겹침은 마무리 함수 자신의 임대 잠금이 막는다 — 여기서 또 막지 않는다.
        if (row.ready) {
          finishBudget -= 1;
          if (row.kind === "film") await finishFilm(row.id, owner, row.mode);
          else await finishAd(row.id, owner);
          finished += 1;
          return;
        }
        // 가벼운 수거 — fal 상태 한 번과 문서 쓰기 한 번뿐이라 회차 몫을 따로 두지 않는다
        // (회차 예산에는 걸린다).
        if (row.kind === "ad") await collectAd(row.id, owner);
        else if (row.kind === "film") await collectFilm(row.id, owner, row.mode);
        else await collectReel(row.id, owner);
        collected += 1;
      });
    } catch (e) {
      // ★★★ **id 와 사유를 남긴다**(2026-09-10). 그전에는 `failed += 1` 뿐이라 로그에
      //   `{"swept":N,"failed":3}` 한 줄만 남았다 — 크론에는 결과를 볼 사람이 없어 로그가
      //   유일한 창인데, 어느 편이 왜 막혔는지 알 길이 없었다.
      // ⚠️ "문서의 error 를 보면 된다"는 **절반만 맞다.** 수거 함수가 거기까지 갔을 때만
      //   적히고, 그 앞(주체 세우기·소유자 처리)에서 던지면 문서에는 아무것도 안 남는다 —
      //   오늘 고친 결함이 정확히 그 자리였다.
      // ★ 그래도 **던지지는 않는다.** 한 편이 새어 나가면 뒤의 전부가 다음 분에도 막힌다.
      failed += 1;
      console.error("[쓸기 실패]", JSON.stringify({
        kind: row.kind, id: row.id, mode: row.mode || null, reason: e?.message || String(e),
      }));
    }
  }

  return { swept: rows.length, collected, finished, failed, skipped };
}

// fal 웹훅이 부르는 자리 — **그 편 하나만** 걷는다.
//
// ★ 새 경로를 만들지 않는다. 쓸기와 **같은 함수**를 지나므로 주체 세우기·마무리 상한·
//   실패 삼키기가 전부 한 벌이다(두 벌이면 한쪽만 고쳐진다 — 이 저장소가 반복해 밟은 함정).
export function sweepOneProject(projectId, deps = {}) {
  return sweepBakingProjects({ ...deps, only: projectId });
}
