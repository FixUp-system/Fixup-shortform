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
// ★ import 가 없다 — "use client" 화면이 그대로 부를 수 있어야 한다.
export function archiveVideoUrl(doc) {
  if (!doc) return null;
  // 광고 — 굽는 단위가 편이라 videos 배열의 첫 편이 완성본이다.
  if (doc.kind === "ad") return doc.videos?.[0]?.url || null;
  // 한 번에 굽는 영상 — **방식마다 한 벌**이라(films.order·films.refs) 먼저 구워진 것을
  // 보여 준다. 두 편을 나란히 보는 자리는 제작 화면이다.
  if (doc.kind === "film") {
    return Object.values(doc.films || {}).map((fm) => fm?.video?.url).find(Boolean) || null;
  }
  // 단계별(종류 없는 옛 문서) — 합성 결과가 한 자리에 있다.
  return doc.render?.url || null;
}
