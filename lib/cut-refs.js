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
import { AVATARS } from "./refs.js";
import { readRefBytes } from "./refs-io.js";

export async function loadCutRefs(cut, project) {
  // 컷이 고른 레퍼런스를 출처와 키로 푼다 — 어디서 읽을지는 lib/refs-io.js 가 안다.
  const resolved = resolveCutRefs(cut, project).map((r) => ({
    kind: r.kind,
    who: r.who, // 첨부를 배역에 묶는 데 쓴다 — 익명으로 보내면 모델이 배역을 뒤바꾼다
    source: r.from === "photo" ? "upload" : "avatar",
    key:
      r.from === "photo"
        ? (project.material?.photos || []).find((p) => p.id === r.id)?.url?.split("/").pop()
        : (AVATARS.find((a) => a.id === r.id) || {}).file,
  }));

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
