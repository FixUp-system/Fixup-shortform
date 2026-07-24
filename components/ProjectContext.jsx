"use client";

// 진행 중인 프로젝트를 사이드바와 단계 페이지가 함께 본다.
// 사이드바는 루트 레이아웃에 있어 /create/[id] 레이아웃의 하위가 아니므로,
// 컨텍스트를 루트에 두어야 스테퍼가 페이지 갱신에 즉시 따라온다.
import { createContext, useCallback, useContext, useMemo, useState } from "react";

const Ctx = createContext(null);

export function ProjectProvider({ children }) {
  const [project, setProject] = useState(null);

  const load = useCallback(async (id) => {
    const res = await fetch(`/api/projects/${id}`);
    if (!res.ok) {
      setProject(null);
      throw new Error("프로젝트를 찾을 수 없어요");
    }
    const data = await res.json();
    setProject(data);
    return data;
  }, []);

  const value = useMemo(() => ({ project, setProject, load }), [project, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProject는 ProjectProvider 안에서만 쓸 수 있어요");
  return ctx;
}
