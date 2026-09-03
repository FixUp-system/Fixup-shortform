"use client";

// **모델이 읽는 영어 지문 + 사장님이 읽는 한국어** 한 덩어리 (2026-09-03 사장님 지시).
//
// ★★ 왜 컴포넌트로 뺐나 — 이 모양이 필요한 자리가 셋이다(②시나리오 · ④프롬프트 ·
//   ③이미지 지문). 화면마다 마크업을 따로 두면 한쪽만 고쳐지는 날이 온다(ProjectCards 가
//   홈·보관함에 하나로 선 이유와 같다).
//
// ★★★ **원문이 먼저다.** 모델에게 실제로 나가는 것은 영어 원문이고, 번역은 곁들이는
//   값이다. 순서를 뒤집으면 사장님이 한국어를 고치면 반영될 것이라 기대하게 된다 —
//   고치는 자리는 따로 있다(각 화면의 수정 요청 칸).
// ★ 번역이 없으면 **그 줄을 아예 안 그린다** — 옛 문서는 번역이 없고(사장님 결정:
//   "앞으로 생성되는 문서에만"), 빈 상자를 두면 "번역이 실패했나"로 읽힌다.
export default function PromptWithKo({ text, ko, className = "script-src" }) {
  const body = typeof text === "string" ? text : "";
  const trans = typeof ko === "string" ? ko.trim() : "";
  if (!body) return null;
  return (
    <>
      <p className={className}>{body}</p>
      {trans && (
        <div className="prompt-ko">
          {/* ★ 라벨을 단다 — 라벨이 없으면 두 문단이 이어진 한 글로 읽힌다. */}
          <span className="prompt-ko-label">한국어</span>
          <p className={className}>{trans}</p>
        </div>
      )}
    </>
  );
}
