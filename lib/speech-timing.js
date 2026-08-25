// 자막 시각을 **모델이 실제로 말한 때**에 맞춘다. 순수 함수다(네트워크 결과만 받는다).
//
// ★★ 왜: 우리 자막은 컷 경계 누적으로 시각을 잡는데(lib/subtitles.js 의 buildCues),
//   통짜로 굽는 영상은 모델이 자기 리듬으로 말한다. 2026-08-25 떡볶이 15초 실측:
//     계획 0.00s → 실제 0.03s  (+0.03)
//     계획 5.00s → 실제 6.47s  (+1.47)
//     계획 10.50s → 실제 10.09s (-0.41)
//     계획 13.50s → 실제 11.51s (-1.99)   ← 말이 끝난 뒤에 자막이 뜬다
//   **앞뒤로 흔들려 상수 보정이 안 된다.** 재는 수밖에 없다.
//   (buildCues 는 이 값을 이미 읽는다 — 2026-08-19 에 그 자리를 만들어 두었다.)
//
// ★★★ **글자는 whisper 에서 가져오지 않는다.** 같은 실측에서 모델이 대사를 바꿔 말했다:
//   "끓이기만 하면 돼요" → "끄기만 하면 돼요". 뜻이 달라지는데 그걸 자막으로 태우면
//   **화면에 오타가 박힌다.** whisper 는 "언제 말했나"만 답하고, "무엇을 말했나"는
//   시나리오(cut.sentence)가 답한다. 이 규율이 이 파일의 존재 이유다.

// 말하는 컷만 골라 whisper 조각과 **순서대로** 짝짓는다.
//
// ★ 왜 순서로 짝짓나: 글자로 맞추려면 모델이 잘못 말한 것과 우리 원문을 비교해야 하는데,
//   "끓이기"와 "끄기"처럼 달라진 말은 어떤 유사도 자로도 안정적으로 안 맞는다.
//   한 클립 안에서 대사는 **적힌 순서대로** 나오므로 순서가 가장 튼튼한 기준이다.
// ★ 조각이 모자라면 남는 컷은 **건드리지 않는다** — 그 컷은 옛 방식(컷 경계)으로 흐른다.
//   억지로 채우면 엉뚱한 시각이 박혀 자막이 통째로 밀린다.
export function alignSpeech(cuts, chunks) {
  const list = Array.isArray(cuts) ? cuts : [];
  const parts = Array.isArray(chunks) ? chunks : [];
  if (!list.length || !parts.length) return list;

  let n = 0;
  return list.map((cut) => {
    const speaks = typeof cut?.sentence === "string" && cut.sentence.trim();
    if (!speaks) return cut;
    const chunk = parts[n];
    n += 1;
    const start = Number(chunk?.timestamp?.[0]);
    const end = Number(chunk?.timestamp?.[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return cut;
    // ★ sentence 는 손대지 않는다 — 위 ★★★ 참고.
    return { ...cut, spoken_start: round2(start), spoken_seconds: round2(end - start) };
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// **언제 재야 하나** — 한 클립 안에 대사가 둘 이상일 때만이다.
//
// ★★ 컷별로 구우면 클립 하나에 대사 하나라 시작이 곧 컷 경계다 — 어긋날 자리가 없고
//   whisper 를 부르면 값만 나간다(lib/subtitles.js 의 buildCues 주석이 그 사정을 적는다).
//   한 클립에 여러 대사가 들어갈 때 비로소 모델이 자기 리듬으로 배치하고, 그때 어긋난다.
//
// ★ "통짜인가"라는 **구조 이름으로 묻지 않는다.** 담는 방식이 바뀌어도(클립 하나를
//   컷들에 어떻게 나눠 담든) "한 클립에 대사가 여럿인가"는 그대로 참이다.
export function needsSpeechProbe(cuts) {
  const list = Array.isArray(cuts) ? cuts : [];
  const speaking = list.filter((c) => typeof c?.sentence === "string" && c.sentence.trim()).length;

  // ★★ 통짜 갈래(r2v) — 굽기 결과를 **첫 컷의 video 에만** 담는다(lib/reel/pipeline.js 의
  //   runReelOneShot). 나머지 컷은 대사를 지닌 채 video 가 없어서 아래의 "한 클립에 대사
  //   여럿" 셈으로는 안 잡힌다. 그런데 어긋남이 가장 큰 갈래가 바로 여기다 — 한 클립 안에서
  //   모델이 전부 말하기 때문이다.
  //   실측(2026-08-25): 재지 않으면 15초 영상에 18초·24초 자막이 생겨 **영상 밖으로 밀려난다.**
  // ★ `whole` 플래그가 "통짜로 구웠다"를 말한다 — 담는 방식을 다시 추측하지 않는다.
  if (list.some((c) => c?.video?.url && c?.video?.whole)) return speaking >= 2;

  const byClip = new Map();
  for (const c of list) {
    const url = c?.video?.url;
    if (!url) continue;
    if (!(typeof c?.sentence === "string" && c.sentence.trim())) continue;
    byClip.set(url, (byClip.get(url) || 0) + 1);
  }
  for (const n of byClip.values()) if (n >= 2) return true;
  return false;
}
