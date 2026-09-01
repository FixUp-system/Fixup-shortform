// 보관함 상세가 재생·내려받기에 쓸 **완성본 주소 한 줄**.
//
// ★★ 왜 화면 밖으로 뺐는가: 여기서 실제로 틀렸기 때문이다(2026-08-19). film 갈래만
//   `films[mode].video` 를 **통째로** 냈는데 그 값은 `{ url, seconds, rawUrl, subtitled, ts }`
//   객체다 — 광고·단계별 갈래는 문자열(`videos[0].url`·`render.url`)이었다. 그래서
//   `<video src={video}>` 와 `href={\`${video}?dl=1\`}` 가 "[object Object]" 를 받아
//   **재생도 내려받기도 죽었다.** 그 페이지가 있는 이유가 바로 그 둘이다.
//
//   화면 안의 삼항식으로 두면 이 어긋남을 **값으로 잴 방법이 없다**(이 저장소에는 렌더링
//   하네스가 없어 화면은 소스 문자열로만 잰다 — 문자열 검사는 "URL 인가"를 못 본다).
//   순수 함수로 빼면 세 종류를 다 넣어 보고 "언제나 문자열이거나 null"을 못 박을 수 있다.
//   film 화면이 filmGates 를 lib 으로 뺀 것과 같은 이유다.
//
// ★ 사슬 끝에 `fs` 가 닿으면 안 된다 — "use client" 화면이 그대로 부른다.
//   아래 import 는 lib/reel/doc.js 하나이고 그 파일도 import 0 개라 그 성질이 유지된다.
//   규칙을 두 벌로 베끼는 쪽이 이 저장소가 더 크게 겪은 사고다(이 파일 머리말).
import { reelWholeVideoUrlOf } from "../reel/doc.js";

export function archiveVideoUrl(doc) {
  if (!doc) return null;
  // 광고 — 굽는 단위가 편이라 videos 배열의 첫 편이 완성본이다.
  if (doc.kind === "ad") return doc.videos?.[0]?.url || null;
  // 한 번에 굽는 영상 — **방식마다 한 벌**이라(films.order·films.refs) 먼저 구워진 것을
  // 보여 준다. 두 편을 나란히 보는 자리는 제작 화면이다.
  if (doc.kind === "film") {
    return Object.values(doc.films || {}).map((fm) => fm?.video?.url).find(Boolean) || null;
  }
  // reel(컷마다 직접 말하는 영상) — 완성본은 doc.reel.video.url 에 산다
  // (app/api/reel/[id]/render/route.js 가 putReel 로 채우는 그 자리). ★★ 2026-08-21
  // 리뷰 C2 — 처음엔 이 갈래가 없어서 app/archive/[id]/page.js 안에서 화면이 직접
  // doc.reel?.video?.url 을 판독했는데, 그것이 바로 이 파일 머리말이 막으려는 사고다
  // (판독이 화면 안으로 되돌아가면 다음 종류가 늘 때 또 갈릴 수 있다). ad·film 과
  // 같은 자리에 둔다.
  // ★★★ 2026-09-01 — **굽기만 한 통짜도 완성본이다**(사장님 지적: 카드는 뜨는데 눌러
  //   들어가면 "아직 완성본이 없어요"). 합성("이대로 완성하기")은 수동이라 굽기만 하면
  //   doc.reel.video 가 안 채워지는데, 통짜는 그 한 편이 곧 완성본이다.
  //   ★ 합성본이 **먼저다** — 자막까지 태운 편이 진짜 완성본이다.
  //   ★ 컷별 조각은 안 된다(reelWholeVideoUrlOf 의 `whole` 판정) — 아직 이어 붙이기 전이다.
  if (doc.kind === "reel") return doc.reel?.video?.url || reelWholeVideoUrlOf(doc) || null;
  // 단계별(종류 없는 옛 문서) — 합성 결과가 한 자리에 있다.
  return doc.render?.url || null;
}
