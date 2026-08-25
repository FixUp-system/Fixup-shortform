"use client";

// 레이아웃이 한 번 읽은 프로젝트를 단계 화면들 **과 사이드바**가 나눠 쓴다.
//
// ★★ 2026-08-25 — 원래 이 컨텍스트는 app/reel/[id]/layout.js **안**에 있었다. 그때는
//   사이드바에 reel 단계 목록이 없었고("진입 링크 하나 때문에 치를 값이 아니다"), 그래서
//   레이아웃 본문에 스테퍼를 그렸다 — 사이드바용 클래스(side-steps)를 본문에 쓴 셈이라
//   모양이 깨진다. 사장님이 단계 목록을 사이드바로 옮기라고 했고, 그러려면 공급자가
//   사이드바보다 **위**(app/layout.js 루트)에 있어야 한다. film 이 2026-08-21 에
//   똑같은 값을 치렀다(components/FilmProjectContext.jsx 와 같은 모양이다).
//
// ★ 읽는 문은 `/api/reel/<id>` 하나다 — `/api/projects/<id>` 는 종류가 있는 문서를 404 로
//   막는다(app/api/reel/[id]/route.js 머리말 참고).
import { createContext, useCallback, useContext, useState } from "react";

const Ctx = createContext(null);

export function ReelProjectProvider({ children }) {
  const [project, setProject] = useState(null);

  // ★ 실패를 삼키지 않는다. 조용히 실패하면 화면은 옛 상태를 든 채 유료 버튼을 다시 연다.
  const reload = useCallback(async (id) => {
    const res = await fetch(`/api/reel/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "지금 상태를 확인하지 못했어요 — 새로고침해 주세요");
    setProject(data);
    return data;
  }, []);

  return <Ctx.Provider value={{ project, setProject, reload }}>{children}</Ctx.Provider>;
}

export function useReelProject() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ReelProjectProvider 안에서만 쓸 수 있어요");
  return v;
}
