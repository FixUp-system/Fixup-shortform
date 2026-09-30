// 접수증을 문서에 적기 **전에** 함수가 죽은 편을 웹훅이 되살린다(2026-09-30 점검).
//
// ★★★ 왜 필요한가. 접수(fal)와 접수증 쓰기(updateProject)는 별개 걸음이다. 그 사이에 함수가
//   죽으면(재활용·메모리·상한) fal 은 값을 받고 끝까지 굽는데 문서에는 요청 번호가 없다.
//   fal 에는 요청 목록 API 가 없다(09-10 실측) — 그 번호를 들고 오는 것은 **웹훅뿐**이다.
//   웹훅 주소의 `p` 가 그 경우를 위한 장치였는데, 웹훅이 부르는 쓸기가 **접수증이 있는 행만**
//   골라서(lib/store/supabase.js 의 selectBakingProjects) 한 번도 일하지 못했다.
//
// ★★ 요청 번호는 **서명된 웹훅 본문**에서 온다(app/api/fal/webhook 이 ED25519 를 확인한 뒤).
//   그래도 결과를 믿고 꽂지 않는다 — 광고는 접수증만 되살리고 정상 수거가 fal 에 **다시 물어**
//   받는다(우리 키로 조회되지 않는 번호는 거기서 실패한다). reel 은 운영자 구조선
//   (attachReelVideo)이 같은 방식으로 fal 에 묻는다.
// ★★ 조건은 좁다 — "굽는 중인데 접수증이 없다"일 때만. 그 밖은 전부 손대지 않는다:
//   · 접수증이 있으면 정상 수거의 일이다
//   · reel 은 ⑥완성 합성도 status "rendering" 이다(progress.phase "render") — 늦게 온 웹훅
//     재시도가 합성 중인 편을 ⑤로 되돌리면 안 된다. 그래서 phase "video" 일 때만.
// ★ 던지지 않는다 — 웹훅이 2xx 가 아니면 fal 이 31번 다시 보낸다(라우트 머리말).
// ★ 필름은 아직 안 한다 — 한 문서에 방식(mode)이 둘이라 어느 편의 접수증인지 `p` 만으로는
//   못 가른다. 필요해지면 웹훅 주소에 방식을 함께 싣는 것부터다.
import { getStore } from "./store/index.js";
import { runWithActor } from "./actor.js";
import { updateProject as updateProjectImpl } from "./projects.js";
import { reelOf } from "./reel/doc.js";
import { attachReelVideo } from "./reel/pipeline.js";
import { adReceiptFor } from "./ad/pipeline.js";

// 소유자를 모르는 옛 편의 주체 — 쓸기(lib/collect-sweep.js)와 같은 규칙이다.
const ORPHAN_ACTOR = "cron";

export async function adoptOrphanReceipt(projectId, requestId, deps = {}) {
  if (!projectId || !requestId) return {};
  const store = deps.store || getStore();
  const updateProject = deps.updateProject || updateProjectImpl;
  const attachReel = deps.attachReel || attachReelVideo;
  const now = deps.now || Date.now;

  const row = await store.selectProjectForViewing(projectId).catch(() => null);
  const doc = row?.doc;
  if (!doc) return {};

  const actor = row.owner_id ? row.owner_id : { id: ORPHAN_ACTOR, role: "admin" };
  const owner = row.owner_id || ORPHAN_ACTOR;

  try {
    if (doc.kind === "ad") {
      if (doc.status !== "rendering" || doc.ad_job) return {};
      // 접수증 모양·결과 주소는 운영자 구조선과 **같은 함수**가 짓는다(두 벌이면 갈린다).
      const job = adReceiptFor(doc, requestId, now());
      let adopted = false;
      await runWithActor(actor, () => updateProject(projectId, owner, (p) => {
        // ★ 낙관적 락 안에서 **다시** 본다 — 그 사이 원래 함수가 살아나 적었을 수 있다.
        adopted = false;
        if (p.status !== "rendering" || p.ad_job) return p;
        adopted = true;
        return { ...p, ad_request_id: requestId, ad_job: job };
      }));
      if (adopted) console.log("[접수증 되살림]", JSON.stringify({ kind: "ad", id: projectId, requestId }));
      return adopted ? { adopted: "ad" } : {};
    }

    if (doc.kind === "reel") {
      const reel = reelOf(doc);
      if (reel.status !== "rendering" || reel.job?.requestId) return {};
      if (doc.progress?.phase !== "video") return {};
      const out = await runWithActor(actor, () => attachReel(projectId, owner, { requestId }, { orphan: true }));
      console.log("[접수증 되살림]", JSON.stringify({ kind: "reel", id: projectId, requestId, out }));
      return out?.attached ? { adopted: "reel" } : { error: out?.error || null };
    }
  } catch (e) {
    console.error("[접수증 되살림 실패]", JSON.stringify({ id: projectId, requestId, reason: e?.message }));
    return { error: e?.message };
  }
  return {};
}
