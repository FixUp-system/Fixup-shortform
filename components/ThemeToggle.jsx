"use client";

// 화면 밝기 — 어두운 벌이 기본이고, 밝은 벌은 **고르는 사람만** 본다(2026-08-18 사장님 지시).
//
// ★ 첫 칠은 이 부품이 하지 않는다. <head> 의 인라인 스크립트가 이미 <html> 에 표를 찍었다
//   (app/layout.js) — 여기서 다시 칠하면 그 사이에 어두운 화면이 한 번 번쩍인다.
//   이 부품이 하는 일은 **지금 상태를 읽어 버튼에 비추고, 누르면 바꾸는 것** 둘뿐이다.
// ★ 서버에서는 <html> 을 볼 수 없다. 그래서 첫 렌더는 "모름"으로 두고 붙은 뒤에 읽는다 —
//   서버가 어둡다고 단정하면 밝은 화면을 고른 사장님에게서 리액트 경고가 난다.
import { useEffect, useState } from "react";

const KEY = "shortform-theme";

export default function ThemeToggle() {
  const [light, setLight] = useState(null);

  useEffect(() => {
    setLight(document.documentElement.getAttribute("data-theme") === "light");
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    const el = document.documentElement;
    if (next) el.setAttribute("data-theme", "light");
    else el.removeAttribute("data-theme");
    // 사생활 보호 모드에서는 쓰기 자체가 던진다 — 못 기억해도 화면은 바뀌어야 한다
    try {
      localStorage.setItem(KEY, next ? "light" : "dark");
    } catch {}
  }

  // 아직 못 읽었으면 자리만 잡는다 — 글자를 먼저 그리면 눌러 보기도 전에 한 번 바뀐다
  if (light === null) return <button className="mini theme-toggle" aria-hidden="true" />;

  return (
    <button
      className="mini theme-toggle"
      onClick={toggle}
      aria-pressed={light}
      title={light ? "어두운 화면으로" : "밝은 화면으로"}
    >
      {light ? "어둡게" : "밝게"}
    </button>
  );
}
