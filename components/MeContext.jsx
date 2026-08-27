"use client";

// 내 정보(GET /api/me)를 **한 번만** 읽어 화면 셋이 함께 본다 —
// 상단 계정 바(UserMenu) · 사이드바(운영자 링크) · 마이페이지(app/me/page.js).
//
// 왜 필요했나 — 셋이 각자 읽던 시절에는 두 가지가 동시에 틀렸다:
//  ① 마이페이지에서 이름을 바꿔 저장해도 상단바는 **옛 이름 그대로**였다(새로고침해야 반영).
//     저장 뒤 마이페이지가 자기 상태만 다시 채웠고 상단바는 그 사실을 몰랐다.
//  ② 한 화면에서 같은 GET /api/me 가 **두 번** 나갔다(UserMenu + Sidebar).
// 공유본 하나를 두고 마이페이지가 저장 뒤 `load()` 를 부르면 둘 다 사라진다.
//
// 모양은 components/ProjectContext.jsx 를 그대로 따른다(읽은 값 · 다시 읽는 함수).
// 여기에 **실패 여부**가 하나 더 붙는다 — 마이페이지가 "불러오는 중"과 "못 읽었다"를
// 구분해야 하기 때문이다(못 읽은 채 [저장] 하면 저장돼 있던 이름이 지워진다).
//
// ★ 두는 자리는 components/AppShell.jsx 의 **bare 가 아닌 갈래**뿐이다.
// /login·/pending 에서 GET /api/me 는 401(승인 대기자는 403)이라, 그 화면에 두면
// 들어오지도 않은 사람에게 헛된 요청을 쏜다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const Ctx = createContext(null);

export function MeProvider({ children }) {
  const [me, setMe] = useState(null);
  const [failed, setFailed] = useState(false);
  // ★★ 손님(로그인 안 함)인가 — **실패와 다른 축이다**(2026-08-27). 401 은 "못 읽었다"가
  //   아니라 "아직 로그인 안 했다"이고, 상단바가 그 자리에 [로그인]을 그려야 한다.
  //   failed 하나로 뭉치면 일시적인 오류에도 로그인 버튼이 뜬다.
  const [guest, setGuest] = useState(false);

  // ★ ProjectContext.load 와 달리 **던지지 않는다.** 소비자가 셋인데 그중 둘(상단바·
  // 사이드바)은 실패를 조용히 넘기면 되고, 마이페이지는 `failed` 로 화면에 드러낸다.
  // 던지면 세 자리 모두 catch 를 달아야 하고, 특히 이름 저장 성공 뒤의 재조회가 실패하면
  // "저장했어요" 자리에 읽기 오류가 덮여 **저장을 실패로 오해**하게 된다.
  //
  // ★ 실패해도 이미 읽어 둔 값은 **버리지 않는다.** 버리면 마이페이지 이름칸이 비고
  // [저장] 이 막힌다 — 잘 읽어 뒀던 화면이 일시적인 실패 한 번에 되돌아가는 셈이다.
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.status === 401) { setGuest(true); setFailed(false); return; }
      if (!res.ok) throw new Error("내 정보를 읽지 못했어요");
      setGuest(false);
      const data = await res.json();
      setMe(data);
      setFailed(false);
      return data;
    } catch {
      setFailed(true);
      return null;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const value = useMemo(() => ({ me, failed, guest, load }), [me, failed, guest, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMe() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMe는 MeProvider 안에서만 쓸 수 있어요");
  return ctx;
}
