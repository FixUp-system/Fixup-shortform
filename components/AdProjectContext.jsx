"use client";

// 진행 중인 광고 프로젝트를 사이드바와 /ads/[id] 화면이 함께 본다.
// components/ProjectContext.jsx 와 같은 모양이다 — 문서 종류(kind:"ad")가 다르고
// 엔드포인트가 달라(/api/ads/<id>) 별도 컨텍스트를 둔다. 하나로 합치면 광고 문서를
// 기존 project 컨텍스트에 억지로 끼워 넣어야 하고, 사이드바의 두 목록(영상 만들기 vs
// 광고 영상)이 같은 값을 서로 다른 뜻으로 읽는 자리가 생긴다.
//
// ★ 사이드바는 이 컨텍스트를 읽기만 한다 — 자체로 fetch·폴링을 새로 시작하지 않는다.
// 실제 네트워크 호출은 /ads/[id] 화면의 최초 load(id) 와 굽는 동안의 2초 상태 폴링
// (app/ads/[id]/page.js)이 맡고, 그 결과를 여기 담아 나눠 본다. 같은 것을 사이드바가
// 또 하면 요청이 두 배가 된다.
import { createContext, useCallback, useContext, useMemo, useState } from "react";

const Ctx = createContext(null);

export function AdProjectProvider({ children }) {
  const [project, setProject] = useState(null);

  const load = useCallback(async (id) => {
    const res = await fetch(`/api/ads/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setProject(null);
      throw new Error(data.error || "찾을 수 없어요");
    }
    setProject(data);
    return data;
  }, []);

  const value = useMemo(() => ({ project, setProject, load }), [project, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdProject() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdProject는 AdProjectProvider 안에서만 쓸 수 있어요");
  return ctx;
}
