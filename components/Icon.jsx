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
  // 광고 영상 — 메가폰. "영상 만들기"(sparkle)와 사이드바에서 나란히 있어 서로 다른
  // 아이콘이 필요했다(같은 아이콘이면 최상위 두 항목이 눈으로 안 갈린다).
  ad: (
    <>
      <path d="M3 9v6h3l10 5V4L6 9H3z" />
      <path d="M19 9.5a4 4 0 0 1 0 5" />
    </>
  ),
  // 한 번에 굽는 영상 — 방식 둘. 사이드바에서 "영상 만들기"(sparkle)·"광고 영상"(ad)과
  // **나란히 서므로 넷이 서로 달라야 한다**(같으면 최상위 항목들이 눈으로 안 갈린다).
  // ★ 아이콘이 방식의 뜻을 그린다: 필름은 **차례로 이어지는 장면**, 겹친 장은 **참고할 그림**.
  film: (
    <>
      <path d="M3.5 5h17v14h-17z" />
      <path d="M8 5v14M16 5v14" />
      <path d="M3.5 12h17" />
    </>
  ),
  layers: (
    <>
      <path d="M7.5 3.5h13v13h-13z" />
      <path d="M16.5 16.5v4h-13v-13h4" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  caret: <path d="M6 9.5l6 6 6-6" />,
  // 더하기 — 장면 추가. 획 둘이라 어느 크기에서도 또렷하다.
  plus: <path d="M12 5v14M5 12h14" />,
  // 휴지통 — 장면 삭제. 뚜껑·몸통·손잡이 세 획이라 18px 에서도 뭉개지지 않는다.
  trash: (
    <>
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2" />
      <path d="M6.5 6.5 7.5 20h9l1-13.5" />
      <path d="M10.5 10v6M13.5 10v6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  // 느낌표(원 안의 !) — 만들기 화면 하단의 "프로에서는 인물 참조가 안 된다" 안내가 쓴다.
  bang: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5M12 16v.01" />
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
