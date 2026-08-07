// 아이콘을 SVG 한 세트로 — 유니코드 글리프(⌂ ✦ ▤ ◫ ◷ ⚙︎ ⏻ ▶)는 폰트마다 굵기·크기·
// 베이스라인이 달라 사이드바 세로줄이 눈에 띄게 어긋났다. .ic 의 width 는 폭만 맞출 뿐
// 글리프 자체의 크기 차이는 그대로 남는다.
//
// ★ 색은 반드시 currentColor 다. hex 를 쓰면 tests/design-system.test.js 의
//   ":root 밖에는 hex 색 리터럴이 없다"가 .jsx 까지 훑어 빨개진다.
//
// aria-hidden — 아이콘 옆에는 항상 글자 라벨이 있다. 빼면 스크린리더가 두 번 읽는다.

const PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" />,
  sparkle: <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6.5 6.5l3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3" />,
  archive: (
    <>
      <path d="M3 4.5h18v4H3zM4.5 8.5V20h15V8.5" />
      <path d="M10 12h4" />
    </>
  ),
  template: <path d="M3.5 4.5h17v15h-17zM10 4.5v15" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </>
  ),
  power: <path d="M12 3v9M6.8 6.8a7.5 7.5 0 1 0 10.4 0" />,
  play: <path d="M8 5.5l11 6.5-11 6.5z" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  caret: <path d="M6 9.5l6 6 6-6" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
};

export default function Icon({ name, size = 18 }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  );
}
