// 샷 크기 — 화면 설계가 닫힌 목록에서 고르고, 코드가 분포를 판정한다.
//
// import 가 없다(aspects·styles·speeds·voices·clip-limits 와 같은 이유).
//
// 왜 분포를 판정하는가: 초점이 물건이면 화면 설계가 제품을 화면에 계속 두려 해서 클로즈업으로
// 쏠린다. 실측(2026-07-30 농구화 광고): 5컷 중 3컷이 클로즈업이고 사람이 무엇을 하는지 보이는
// 넓은 샷은 하나뿐이었다.
//
// 광고는 그렇게 만들지 않는다 — 제품은 **사람이 쓰는 장면 안에** 들어 있고, 제품만 크게 잡는
// 컷은 여는 한 방과 닫는 한 방 정도로 아낀다. 처음부터 끝까지 제품에 붙어 있으면 카탈로그가 된다.
//
// 목록의 낱말은 SHOWS_SYSTEM 이 "그 말 그대로 적는다"고 지시한 것과 같아야 한다.
// 긴 것을 먼저 둔다 — "극단적 클로즈업"이 "클로즈업"보다 먼저 걸려야 한다.
export const SHOT_SIZES = [
  { id: "extreme_close", label: "극단적 클로즈업", words: ["극단적 클로즈업"], tight: true },
  { id: "close", label: "클로즈업", words: ["클로즈업"], tight: true },
  { id: "medium", label: "미디엄 샷", words: ["미디엄 샷", "미디엄샷"], tight: false },
  { id: "full", label: "풀 샷", words: ["풀 샷", "풀샷"], tight: false },
  { id: "wide", label: "광각", words: ["광각", "설정 샷"], tight: false },
];

// 클로즈업 계열이 이 비율을 넘으면 제품에 붙어 있는 것으로 본다.
//
// ⚠️ 이 선은 감이다. 표본이 실행 몇 번뿐이라 실측 분포에서 뽑은 값이 아니다.
//    표본이 쌓이면 다시 잡는다. 절반으로 둔 근거는 "대부분은 넓은 샷"이라는 광고 문법이다.
export const TIGHT_LIMIT = 0.5;

export function shotSizeOf(shows) {
  const text = String(shows || "");
  for (const s of SHOT_SIZES) {
    if (s.words.some((w) => text.includes(w))) return s;
  }
  return null;
}

// 컷들이 제품에 붙어 있지 않은가.
//
// 컷이 둘 미만이면 판정하지 않는다 — 한 컷짜리 영상에 분포를 요구할 수 없다.
//
// ⚠️ **샷 크기 누락은 재시도 사유로 삼지 않는다.** 지문이 닫힌 목록에서 고르라고 하지만, 안 고른
//    컷 하나 때문에 화면 설계를 다시 부르면 사소한 누락에 LLM 호출을 한 번 더 치른다.
//    누락된 컷은 분포 셈에서 빠지고(아래 filter), 그 컷의 화면은 그대로 쓴다 — 샷 크기가
//    안 적혀도 그림은 나온다.
export function shotBalance(cuts) {
  const list = Array.isArray(cuts) ? cuts : [];
  if (list.length < 2) return { ok: true, reason: null };

  const sized = list.map((c) => shotSizeOf(c.shows)).filter(Boolean);
  if (sized.length < 2) return { ok: true, reason: null };
  const tight = sized.filter((s) => s.tight).length;
  if (tight / sized.length > TIGHT_LIMIT) {
    return {
      ok: false,
      reason: `${sized.length}컷 중 ${tight}컷이 클로즈업이다 — 제품에 붙어 있다. 대부분은 사람이 무엇을 하는지 보이는 넓은 샷이어야 하고, 제품 클로즈업은 여는 한 방과 닫는 한 방으로 아낀다`,
    };
  }
  return { ok: true, reason: null };
}
