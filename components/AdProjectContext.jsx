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
  // 지금 **보고 있는** 단계. 실제 진행(project.status)과 다를 수 있다 — 완성된 광고에서
  // ②시나리오를 눌러 다시 보는 경우다(주소의 ?step). 사이드바는 이 값으로 불을 켠다.
  //
  // ★ 사이드바가 useSearchParams 로 주소를 직접 읽지 않는 이유: 이 파일 머리의 규약
  // 그대로다 — **화면이 유일한 발신자, 사이드바는 수신만**. 두 곳이 각자 주소를 해석하면
  // "볼 수 있는 단계인가" 판정이 두 벌이 되어 언젠가 갈린다(그 판정은 lib/ad/steps.js 의
  // isAdStepReachable 하나뿐이어야 한다).
  const [view, setView] = useState(null);
  // ★★ **무엇이 지금 돌고 있는가**(2026-08-21 사장님 지적: "생성 중인지 멈춘 건지 알 수
  //   없다"). status 만으로는 부족하다 — 시나리오 만들기는 **동기 호출**이라 끝날 때까지
  //   status 가 그대로이고, 그동안 사이드바에는 아무 신호가 없다. 그래서 화면이 "지금
  //   이 단계가 돌고 있다"를 여기 올려 두고 사이드바가 읽어 깜박인다.
  // ★ 값은 **단계 key**다(lib/ad/steps.js 의 AD_STEPS[].key). 불리언이면 어느 단계가
  //   도는지 모른다 — 사이드바는 그 한 줄만 깜박여야 한다.
  const [busyStep, setBusyStep] = useState(null);

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

  const value = useMemo(
    () => ({ project, setProject, load, view, setView, busyStep, setBusyStep }),
    [project, load, view, busyStep]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdProject() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdProject는 AdProjectProvider 안에서만 쓸 수 있어요");
  return ctx;
}
