"use client";

// 레이아웃이 한 번 읽은 프로젝트를 단계 화면들이 나눠 쓴다.
//
// ★ 왜 컨텍스트인가: 단계마다 각자 GET 을 두드리면 같은 문서를 다섯 번 읽고, 한 화면이
//   갱신한 값을 옆 화면이 모른다. components/ProjectContext.jsx 가 단계별 흐름에서
//   같은 이유로 이미 이 모양이다.
//
// ★ 읽는 문은 `/api/film/<id>` 하나다 — `/api/projects/<id>` 는 종류가 있는 문서를 404 로
//   막는다(app/api/film/[id]/route.js 머리말 참고).
import { createContext, useCallback, useContext, useState } from "react";

const Ctx = createContext(null);

export function FilmProjectProvider({ children }) {
  const [project, setProject] = useState(null);

  // ★ 실패를 삼키지 않는다. 조용히 실패하면 화면은 옛 상태를 든 채 유료 버튼을 다시 연다.
  const reload = useCallback(async (id) => {
    const res = await fetch(`/api/film/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "지금 상태를 확인하지 못했어요 — 새로고침해 주세요");
    setProject(data);
    return data;
  }, []);

  return <Ctx.Provider value={{ project, setProject, reload }}>{children}</Ctx.Provider>;
}

export function useFilmProject() {
  const v = useContext(Ctx);
  if (!v) throw new Error("FilmProjectProvider 안에서만 쓸 수 있어요");
  return v;
}
