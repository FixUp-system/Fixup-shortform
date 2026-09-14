// 드롭다운 한 벌(2026-09-14) — 화면은 <select> 를 직접 쓰지 않고 이것을 부른다.
//
// 모양은 app/globals.css 의 .dd(감싼 칸 · ::after 삼각형) · .dd-input(칸) 한 규칙이 정한다.
// 브라우저 기본 화살표는 끈다 — 브라우저마다 달라 "손으로 만든 화면"처럼 보이는 가장 큰 자리다.
//
// · className     — 자리마다 **키·폭**만 더 준다(예: 자막 조절판의 sub-select 는 격자 리듬 38px).
// · wrapClassName — 감싼 칸에 더할 것(예: sub-select-wrap 의 폭 토큰).
// 나머지 속성(value·onChange·disabled·aria-label·style…)은 <select> 에 그대로 간다.
export default function Select({ className = "", wrapClassName = "", children, ...props }) {
  return (
    <span className={`dd${wrapClassName ? ` ${wrapClassName}` : ""}`}>
      <select className={`dd-input${className ? ` ${className}` : ""}`} {...props}>
        {children}
      </select>
    </span>
  );
}
