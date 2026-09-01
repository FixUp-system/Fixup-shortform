// 이 컷에 **실제로 실릴** 레퍼런스 목록. 파이프라인과 프롬프트 미리보기가 같은 목록을 봐야
// 한다 — 두 벌이면 사장님이 복사해 간 프롬프트와 우리가 보내는 프롬프트가 갈리고,
// 밖에서 돌려 본 결과가 달라도 왜 다른지 아무도 모른다.
//
// 원래 이 코드는 lib/pipeline.js 의 processCut 안에 인라인으로 있었다. 라우트가 같은 것을
// 필요로 하게 되면서 여기로 옮겼다(그대로 베끼면 두 벌이 된다).
//
// ★ "고른 것"과 "실린 것"은 다르다 — readRefBytes 는 모든 실패를 null 로 뭉갠다
//   (Storage 장애·env 누락·권한). 그래서 둘을 함께 돌려준다: missing 이 0 이 아니면
//   그림은 그 사진 **없이** 그려진다(막지는 않는다 — 이 저장소의 결정이다).
import { resolveCutRefs } from "./cast.js";
import { blocksFacesInRefs } from "./clip-limits.js";
import { isPersonPhoto } from "./photos.js";
import { AVATARS } from "./refs.js";
import { readRefBytes } from "./refs-io.js";

// 컷이 고른 레퍼런스를 출처와 키로 푼다 — 어디서 읽을지는 lib/refs-io.js 가 안다.
// 여기까지는 **순수하다**(바이트를 안 읽는다). 아래 두 소비자가 같은 목록을 봐야 하므로
// 한 자리에 둔다 — 베끼면 "실린다고 화면에 적은 것"과 "실제로 싣는 것"이 갈린다.
export function describeCutRefs(cut, project) {
  // ★★★ **얼굴을 막는 모델에서는 인물 사진을 아예 안 싣는다**(2026-09-01 사장님 결정).
  //
  //   2.5 는 사진 같은 얼굴이 든 참조를 실측 9건 전부 거절했다. 그런데 판 지문은
  //   "얼굴은 프레임 밖으로"라고 써 놓고 사진은 그대로 실어서, **글과 사진이 서로
  //   싸웠다** — 사진이 이기면 판에 얼굴이 그려지고 영상 단계에서 막힌다(판값 $0.401 을
  //   두 번 태운다). 못 그리는 것은 애초에 요구하지 않는다 — 이 저장소가 판 지문에서
  //   이미 내린 결정이고, 참조 사진만 그 밖에 남아 있었다.
  //
  // ★★ **여기가 잠금이다.** 화면(visiblePhotoRoles)은 안 보이게 할 뿐이라 옛 프로젝트나
  //   모델을 바꾼 경우에는 사진이 이미 붙어 있다. 그 길을 여기서 닫는다.
  // ★ 사람이 사라지는 것은 아니다 — 생김새는 reelCastLine 이 글로 나른다.
  // ★ **모르는 모델은 안 막는다**(blocksFacesInRefs 의 규율). 2.0 은 얼굴 든 판을 통과시켰다.
  const noFaces = blocksFacesInRefs(project);
  const photos = project?.material?.photos || [];
  return resolveCutRefs(cut, project).filter((r) => {
    if (!noFaces) return true;
    if (r.kind === "person") return false; // 배역에 붙은 얼굴(사진이든 아바타든)
    // 라벨로 새는 길 — `＋제품`으로 올린 얼굴이 사물 자리로 들어온다.
    return !isPersonPhoto(photos.find((p) => p.id === r.id));
  }).map((r) => ({
    kind: r.kind,
    who: r.who, // 첨부를 배역에 묶는 데 쓴다 — 익명으로 보내면 모델이 배역을 뒤바꾼다
    source: r.from === "photo" ? "upload" : "avatar",
    // 사장님이 올린 사진이면 그 사진의 id 다 — "어느 사진이 어느 컷에 실렸나"를 셀 때 쓴다.
    photo_id: r.from === "photo" ? r.id : null,
    key:
      r.from === "photo"
        ? (project.material?.photos || []).find((p) => p.id === r.id)?.url?.split("/").pop()
        : (AVATARS.find((a) => a.id === r.id) || {}).file,
  }));
}

// 스토리보드 한 장에 실을 레퍼런스 — **프로젝트 전체의 합집합**이다.
//
// ★★ 2026-08-25 사장님 실측으로 생겼다: 제품 사진을 첨부했는데 **완전히 다른 제품**이
//   그려졌다. 원인이 둘 겹쳐 있었다.
//     ① 시나리오는 사진이 있으면 제품 생김새를 **글로 안 쓴다**(lib/ad/scenario.js —
//        "사진이 정한다, look·shows 에서는 '그 제품'이라고 가리키기만 한다"). 글이 사진을
//        이겨 없던 것이 그려지는 사고를 막으려고 넣은 규칙이다.
//     ② 그런데 스토리보드 갈래는 **그 사진을 안 실었다**(옛 주석: "컷 하나의 참조를
//        통째로 실으면 다른 칸까지 그 사진을 닮는다").
//   합치면 **제품을 정의하는 것이 아무것도 없다** — 모델이 지어낼 수밖에 없었다.
//
// ★ 옛 걱정("다른 칸까지 닮는다")은 **인물 사진** 이야기다. 제품은 반대로 모든 칸에 같은
//   것이 나와야 맞으므로, 스토리보드에서는 그 성질이 부작용이 아니라 **목적**이다.
//
// ★ 바이트는 **키마다 한 번만** 읽는다 — 컷마다 loadCutRefs 를 부르면 같은 사진을 컷 수만큼
//   다시 내려받는다(loadRefUsage 가 같은 이유로 그렇게 한다).
export async function loadStoryboardRefs(project) {
  const cuts = Array.isArray(project?.cuts) ? project.cuts : [];
  const byKey = new Map();
  for (const cut of cuts) {
    for (const r of describeCutRefs(cut, project)) {
      if (!r.key || byKey.has(r.key)) continue;
      byKey.set(r.key, r);
    }
  }
  const resolved = [...byKey.values()];

  const refs = [];
  for (const r of resolved) {
    const bytes = await readRefBytes(r);
    if (bytes) refs.push({ ...r, bytes });
    // 조용히 버리지 않는다 — 바로 아래에서 $0.40 짜리 생성이 그 사진 없이 나간다.
    else console.error(`⚠️ 레퍼런스를 못 읽었다: ${r.source}/${r.key} — 스토리보드가 그것 없이 그려진다`);
  }
  if (resolved.length && refs.length < resolved.length) {
    console.error(`⚠️⚠️ 스토리보드 레퍼런스 ${resolved.length}장 중 ${refs.length}장만 실렸다 — 그대로 유료 생성이 나간다($0.40).`);
  }
  return { refs, resolved, missing: resolved.length - refs.length };
}

export async function loadCutRefs(cut, project) {
  const resolved = describeCutRefs(cut, project);

  // 못 얻은 레퍼런스는 버리되 **조용히 버리지는 않는다.**
  // 바로 아래에서 컷당 $0.08 짜리 생성이 그대로 나간다 — 사장님이 올린 제품 사진 없이.
  const refs = [];
  for (const r of resolved) {
    const bytes = await readRefBytes(r);
    if (bytes) refs.push({ ...r, bytes });
    else console.error(`⚠️ 레퍼런스를 못 읽었다: ${r.source}/${r.key || "(키 없음)"} — 컷${cut.idx + 1}은 그것 없이 그려진다`);
  }
  if (resolved.length && refs.length < resolved.length) {
    console.error(`⚠️⚠️ 컷${cut.idx + 1} 레퍼런스 ${resolved.length}장 중 ${refs.length}장만 실렸다 — 그대로 유료 생성이 나간다($0.08).`);
    console.error(`     업로드는 Storage 에 있다. SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 를 확인할 것.`);
  }
  return { refs, resolved, missing: resolved.length - refs.length };
}

// 프로젝트 **전체**의 "어느 사진이 어느 컷에 실렸는가" — 그리고 어느 컷에도 안 실린 사진.
//
// 왜 여기인가: 사장님이 사진 5장을 올렸는데 실제로 실린 것이 1장이어도 화면은 지금까지 아무
// 말도 하지 않았다("반영이 안 된다"고 읽힌다). 그 사실을 아는 것은 이 사슬뿐이고, 그 사슬은
// `fs`·Storage 를 끌어 화면이 부를 수 없다.
//
// ★ 바이트는 **키마다 한 번만** 읽는다. 컷마다 loadCutRefs 를 부르면 같은 사진 원본을 컷
//   수만큼 다시 내려받는다(컷 8개면 최대 16회) — 화면 하나 그리려고 낼 값이 아니다.
//   여기서 읽는 이유는 하나다: 골랐어도 못 읽으면 그림에는 안 실린다(missing).
export async function loadRefUsage(project) {
  const photos = (project?.material?.photos || []).filter((p) => p?.id);
  const readable = new Map(); // "출처/키" → 읽혔는가. 같은 사진을 두 번 읽지 않는다.
  const usedPhotoIds = new Set();
  const cuts = [];

  for (const cut of project?.cuts || []) {
    // 사진을 레퍼런스로 **참고**하는 것이 아니라 그 사진 자체를 화면으로 쓰는 컷도 있다.
    // 그것을 "안 쓰였다"고 하면 거짓 경고다.
    if (cut?.source === "photo" && cut.photo_id) usedPhotoIds.add(cut.photo_id);

    const resolved = describeCutRefs(cut, project);
    const refs = [];
    for (const r of resolved) {
      if (r.photo_id) usedPhotoIds.add(r.photo_id);
      const cacheKey = `${r.source}/${r.key}`;
      if (!readable.has(cacheKey)) readable.set(cacheKey, !!(await readRefBytes(r)));
      if (!readable.get(cacheKey)) continue; // 못 읽었다 — 그림에도 안 실린다
      refs.push({
        kind: r.kind,
        // 사장님이 알아볼 이름으로 답한다. 업로드는 올릴 때의 파일명, 준비된 인물 사진은
        // 이름이 없다(화면이 "준비된 인물 사진"이라고 부른다).
        name: r.photo_id
          ? photos.find((p) => p.id === r.photo_id)?.filename || r.key || null
          : null,
        mine: !!r.photo_id,
      });
    }
    cuts.push({ idx: cut.idx, picked: resolved.length, missing: resolved.length - refs.length, refs });
  }

  return {
    cuts,
    photos_total: photos.length,
    // ★ "고르지도 않은 사진"만 안 쓰인 것이다. 골랐는데 못 읽은 것은 다른 사건이고
    //   (missing) 섞으면 사장님이 원인을 엉뚱한 데서 찾는다.
    unused: photos
      .filter((p) => !usedPhotoIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.filename || p.url?.split("/").pop() || null })),
  };
}
